import { validationResult } from 'express-validator';
import { getModel } from '../models/dynamicModels.js';

/**
 * Tenant-aware Report Controller
 */

export const uploadReport = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      studentId,
      classId,
      reportType,
      academicYear,
      term,
      subjects,
      totalMarks,
      percentage,
      grade,
      rank,
      remarks,
      teacherComments
    } = req.body;

    const Student = await getModel(req.schoolId, 'students');
    const Report = await getModel(req.schoolId, 'reports');

    // Verify student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found in your school'
      });
    }

    // Parse subjects if sent as JSON string
    let parsedSubjects = [];
    if (subjects) {
      try {
        parsedSubjects = typeof subjects === 'string' ? JSON.parse(subjects) : subjects;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subjects format'
        });
      }
    }

    const report = await Report.create({
      studentId,
      classId: classId || student.classId,
      reportType: reportType || 'academic',
      academicYear,
      term,
      subjects: parsedSubjects,
      totalMarks: totalMarks ? parseFloat(totalMarks) : undefined,
      percentage: percentage ? parseFloat(percentage) : undefined,
      grade,
      rank: rank ? parseInt(rank) : undefined,
      remarks,
      teacherComments,
      generatedBy: req.userId
    });

    await report.populate('studentId', 'firstName lastName rollNumber');
    await report.populate('classId', 'className section grade');

    res.status(201).json({
      success: true,
      message: 'Report created successfully',
      data: report
    });

  } catch (error) {
    next(error);
  }
};

export const getReports = async (req, res, next) => {
  try {
    const { studentId, classId, academicYear, term, reportType } = req.query;

    const Report = await getModel(req.schoolId, 'reports');

    const filter = {};
    if (studentId) filter.studentId = studentId;
    if (classId) filter.classId = classId;
    if (academicYear) filter.academicYear = academicYear;
    if (term) filter.term = term;
    if (reportType) filter.reportType = reportType;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const reports = await Report.find(filter)
      .populate('studentId', 'firstName lastName rollNumber')
      .populate('classId', 'className section grade')
      .populate('generatedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Report.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: reports.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: reports
    });

  } catch (error) {
    next(error);
  }
};

export const getReportById = async (req, res, next) => {
  try {
    const Report = await getModel(req.schoolId, 'reports');

    const report = await Report.findById(req.params.id)
      .populate('studentId', 'firstName lastName rollNumber email')
      .populate('classId', 'className section grade academicYear')
      .populate('generatedBy', 'name email role');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.status(200).json({
      success: true,
      data: report
    });

  } catch (error) {
    next(error);
  }
};

export const updateReport = async (req, res, next) => {
  try {
    const Report = await getModel(req.schoolId, 'reports');

    // Prevent changing studentId, classId, generatedBy
    delete req.body.studentId;
    delete req.body.classId;
    delete req.body.generatedBy;

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('studentId', 'firstName lastName rollNumber')
      .populate('classId', 'className section grade');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Report updated successfully',
      data: report
    });

  } catch (error) {
    next(error);
  }
};

export const deleteReport = async (req, res, next) => {
  try {
    const Report = await getModel(req.schoolId, 'reports');
    const report = await Report.findByIdAndDelete(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

export default {
  uploadReport,
  getReports,
  getReportById,
  updateReport,
  deleteReport
};
