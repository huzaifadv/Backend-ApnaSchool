import { validationResult } from 'express-validator';
import Report from '../models/Report.js';
import Student from '../models/Student.js';
import path from 'path';

// @desc    Upload report PDF and create report document
// @route   POST /api/reports/upload
// @access  Private (Admin only)
export const uploadReport = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      studentId,
      examType,
      academicYear,
      subjects,
      totalMarksObtained,
      totalMarks,
      percentage,
      overallGrade,
      rank,
      remarks,
      isPublished
    } = req.body;

    // Verify student belongs to admin's school
    const student = await Student.findOne({
      _id: studentId,
      schoolId: req.schoolId
    }).populate('classId');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found or does not belong to your school'
      });
    }

    // Parse subjects if sent as JSON string
    let parsedSubjects;
    try {
      parsedSubjects = typeof subjects === 'string' ? JSON.parse(subjects) : subjects;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subjects format. Must be valid JSON array'
      });
    }

    // Create file URL (optional - only if file was uploaded)
    let fileUrl = null;
    let fileName = null;
    if (req.file) {
      fileUrl = `/uploads/reports/${req.file.filename}`;
      fileName = req.file.originalname;
    }

    // Create report document
    const report = await Report.create({
      schoolId: req.schoolId,
      studentId: student._id,
      classId: student.classId._id,
      examType,
      academicYear,
      subjects: parsedSubjects,
      totalMarksObtained: parseFloat(totalMarksObtained),
      totalMarks: parseFloat(totalMarks),
      percentage: parseFloat(percentage),
      overallGrade,
      rank: rank ? parseInt(rank) : undefined,
      remarks,
      isPublished: isPublished === 'true' || isPublished === true,
      publishedDate: isPublished === 'true' || isPublished === true ? new Date() : undefined,
      reportFileUrl: fileUrl,
      reportFileName: fileName
    });

    await report.populate('studentId', 'firstName lastName rollNumber');
    await report.populate('classId', 'className section grade');

    res.status(201).json({
      success: true,
      message: 'Report uploaded successfully',
      data: report
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get all reports for admin's school
// @route   GET /api/reports
// @access  Private (Admin only)
export const getReports = async (req, res, next) => {
  try {
    const { studentId, classId, examType, academicYear, isPublished } = req.query;

    // Build filter
    const filter = { schoolId: req.schoolId };

    if (studentId) {
      filter.studentId = studentId;
    }

    if (classId) {
      filter.classId = classId;
    }

    if (examType) {
      filter.examType = examType;
    }

    if (academicYear) {
      filter.academicYear = academicYear;
    }

    if (isPublished !== undefined) {
      filter.isPublished = isPublished === 'true';
    }

    // Get reports with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const reports = await Report.find(filter)
      .populate('studentId', 'firstName lastName rollNumber')
      .populate('classId', 'className section grade')
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

// @desc    Get single report by ID
// @route   GET /api/reports/:id
// @access  Private (Admin only)
export const getReportById = async (req, res, next) => {
  try {
    const report = await Report.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    })
      .populate('studentId', 'firstName lastName rollNumber email parentName parentPhone')
      .populate('classId', 'className section grade academicYear');

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

// @desc    Update report
// @route   PUT /api/reports/:id
// @access  Private (Admin only)
export const updateReport = async (req, res, next) => {
  try {
    const report = await Report.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // If publishing the report, set publishedDate
    if (req.body.isPublished === true && !report.isPublished) {
      req.body.publishedDate = new Date();
    }

    // Prevent changing schoolId, studentId, classId
    delete req.body.schoolId;
    delete req.body.studentId;
    delete req.body.classId;

    const updatedReport = await Report.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    )
      .populate('studentId', 'firstName lastName rollNumber')
      .populate('classId', 'className section grade');

    res.status(200).json({
      success: true,
      message: 'Report updated successfully',
      data: updatedReport
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Delete report
// @route   DELETE /api/reports/:id
// @access  Private (Admin only)
export const deleteReport = async (req, res, next) => {
  try {
    const report = await Report.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.schoolId
    });

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
