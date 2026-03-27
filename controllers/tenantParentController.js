import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { getModel } from '../models/dynamicModels.js';

/**
 * Tenant-aware Parent Controller
 *
 * NOTE: No .populate() calls are used here because each tenant has its own
 * Mongoose connection and models must be loaded via getModel() before Mongoose
 * can resolve references. Instead we manually fetch related documents.
 */

export const verifyParentCode = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { schoolId, parentCode } = req.body;

    console.log('========== PARENT VERIFICATION ==========');
    console.log('School ID:', schoolId);
    console.log('Parent Code:', parentCode);

    const Student = await getModel(schoolId, 'students');
    const Class   = await getModel(schoolId, 'classes');  // register before manual fetch

    // Find student with matching parentAccessCode
    const student = await Student.findOne({
      parentAccessCode: parentCode,
      isActive: true
    }).select('-password').lean();

    console.log('Student found:', student ? 'Yes - ' + student.fullName : 'No');
    if (!student) {
      console.log('No student found with parentAccessCode:', parentCode);
      console.log('=========================================');
      return res.status(401).json({
        success: false,
        message: 'Invalid parent access code'
      });
    }

    // Manually fetch class info (avoids MissingSchemaError on populate)
    let classData = null;
    if (student.classId) {
      classData = await Class.findById(student.classId)
        .select('className section grade academicYear').lean();
    }

    console.log('Verification successful');
    console.log('=========================================');

    // Generate JWT token for parent
    const token = jwt.sign(
      {
        studentId: student._id,
        schoolId:  schoolId,
        parentName: student.parentName,
        type: 'parent'
      },
      process.env.JWT_SECRET,
      { expiresIn: '10d' }
    );

    res.status(200).json({
      success: true,
      message: 'Parent verification successful',
      token,
      data: {
        studentId: student._id,
        schoolId:  schoolId,
        student: {
          fullName:   student.fullName,
          rollNumber: student.rollNumber,
          class:      classData,
          email:      student.email,
          gender:     student.gender
        },
        parent: {
          name:  student.parentName,
          phone: student.parentPhone,
          email: student.parentEmail
        }
      }
    });

  } catch (error) {
    console.error('verifyParentCode error:', error);
    next(error);
  }
};

export const getStudentProfile = async (req, res, next) => {
  try {
    const Student = await getModel(req.schoolId, 'students');
    const Class   = await getModel(req.schoolId, 'classes');  // register before manual fetch
    const School  = (await import('../models/School.js')).default;

    const student = await Student.findById(req.studentId)
      .select('-password').lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Manually fetch class info
    if (student.classId) {
      student.classId = await Class.findById(student.classId)
        .select('className section grade academicYear classTeacher').lean();
    }

    // Get school information from main database
    const school = await School.findById(req.schoolId)
      .select('schoolName address city state pincode phone email');

    res.status(200).json({
      success: true,
      data: {
        ...student,
        school: school || null
      }
    });

  } catch (error) {
    console.error('getStudentProfile error:', error);
    next(error);
  }
};

export const getStudentReports = async (req, res, next) => {
  try {
    const AdminReport = await getModel(req.schoolId, 'adminReports');

    const reports = await AdminReport.find({
      'student._id': req.studentId
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports
    });

  } catch (error) {
    console.error('getStudentReports error:', error);
    next(error);
  }
};

export const getStudentNotices = async (req, res, next) => {
  try {
    const Notice  = await getModel(req.schoolId, 'notices');
    const Student = await getModel(req.schoolId, 'students');
    const Admin   = await getModel(req.schoolId, 'admins');   // register for manual fetch
    const Class   = await getModel(req.schoolId, 'classes');  // register for manual fetch

    const student = await Student.findById(req.studentId).lean();
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Fetch all active notices (lean, no populate)
    const allNotices = await Notice.find({ isActive: true, isSuperAdminNotice: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Manually populate createdBy and targetClasses
    for (const notice of allNotices) {
      if (notice.createdBy) {
        notice.createdBy = await Admin.findById(notice.createdBy)
          .select('name').lean();
      }
      if (notice.targetClasses && notice.targetClasses.length > 0) {
        notice.targetClasses = await Class.find({ _id: { $in: notice.targetClasses } })
          .select('className section grade').lean();
      }
    }

    // Filter notices relevant to this student's class
    const notices = allNotices.filter(notice => {
      if (!notice.targetClasses || notice.targetClasses.length === 0) return true;
      return notice.targetClasses.some(
        c => c._id.toString() === student.classId.toString()
      );
    });

    res.status(200).json({
      success: true,
      count: notices.length,
      data: notices
    });

  } catch (error) {
    console.error('getStudentNotices error:', error);
    next(error);
  }
};

export const getStudentAttendance = async (req, res, next) => {
  try {
    const Attendance = await getModel(req.schoolId, 'attendance');
    const Class      = await getModel(req.schoolId, 'classes');
    await getModel(req.schoolId, 'students'); // register Student model for Mongoose ref resolution

    const { startDate, endDate } = req.query;

    // Cast studentId explicitly to ObjectId to ensure Mongoose matches correctly
    const mongoose = (await import('mongoose')).default;
    const studentObjId = new mongoose.Types.ObjectId(req.studentId);

    const filter = { studentId: studentObjId };

    // new Date('YYYY-MM-DD') → midnight UTC — same as how attendance dates are stored.
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate.split('T')[0]);
      }
      if (endDate) {
        const e = new Date(endDate.split('T')[0]);
        e.setUTCHours(23, 59, 59, 999);
        filter.date.$lte = e;
      }
    }

    console.log('=== PARENT ATTENDANCE FETCH ===');
    console.log('req.schoolId:', req.schoolId);
    console.log('req.studentId (raw):', req.studentId);
    console.log('studentObjId (cast):', studentObjId);
    console.log('filter:', JSON.stringify(filter));

    // Debug: count ALL docs in collection to confirm data exists
    const totalDocs = await Attendance.countDocuments({});
    console.log('Total docs in attendance collection:', totalDocs);

    const records = await Attendance.find(filter)
      .sort({ date: -1 })
      .lean();

    console.log('Records found for this student:', records.length);
    if (records.length === 0 && totalDocs > 0) {
      // studentId mismatch — show first 3 docs for debugging
      const sample = await Attendance.find({}).limit(3).lean();
      console.log('Sample docs (first 3):', JSON.stringify(sample.map(d => ({
        _id: d._id,
        studentId: d.studentId,
        date: d.date,
        status: d.status
      }))));
    }

    // Manually populate classId
    for (const rec of records) {
      if (rec.classId) {
        rec.classId = await Class.findById(rec.classId)
          .select('className section').lean();
      }
    }

    const total      = records.length;
    const present    = records.filter(a => a.status === 'Present').length;
    const absent     = records.filter(a => a.status === 'Absent').length;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      data: {
        attendance: records,
        stats: { total, present, absent, percentage }
      }
    });

  } catch (error) {
    console.error('getStudentAttendance error:', error);
    next(error);
  }
};

export default {
  verifyParentCode,
  getStudentProfile,
  getStudentReports,
  getStudentNotices,
  getStudentAttendance
};
