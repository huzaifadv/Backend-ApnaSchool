import { validationResult } from 'express-validator';
import { getModel } from '../models/dynamicModels.js';

// @desc    Upload simple admin report
// @route   POST /api/admin/reports
// @access  Private (Admin only)
export const uploadReport = async (req, res, next) => {
  try {
    console.log('=== Report Upload Request ===');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    console.log('School ID:', req.schoolId);
    console.log('User ID:', req.userId);

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { student, title, description } = req.body;

    // Get the Student model for this school (tenant-aware)
    const Student = await getModel(req.schoolId, 'students');

    // Get the AdminReport model for this school (tenant-aware)
    const AdminReport = await getModel(req.schoolId, 'adminReports');

    // Verify student exists and belongs to admin's school
    const studentDoc = await Student.findById(student).populate('classId');

    console.log('Student found:', studentDoc ? 'Yes' : 'No');
    if (studentDoc) {
      console.log('Student details:', {
        id: studentDoc._id,
        name: studentDoc.fullName,
        rollNumber: studentDoc.rollNumber
      });
    }

    if (!studentDoc) {
      return res.status(404).json({
        success: false,
        message: 'Student not found or does not belong to your school'
      });
    }

    // Create file URL (optional - only if file was uploaded)
    let fileUrl = null;
    let fileName = null;
    if (req.file) {
      // Cloudinary file - use path from Cloudinary
      fileUrl = req.file.path; // Cloudinary URL
      fileName = req.file.originalname;
      console.log('File uploaded to Cloudinary:', fileName);
      console.log('Cloudinary URL:', fileUrl);
    }

    // Create report document in tenant's database
    const report = await AdminReport.create({
      student: {
        _id: studentDoc._id,
        name: studentDoc.fullName,
        rollNumber: studentDoc.rollNumber,
        class: {
          _id: studentDoc.classId._id,
          name: studentDoc.classId.className,
          section: studentDoc.classId.section
        }
      },
      title,
      description,
      fileUrl,
      fileName
    });

    console.log('Report created successfully:', report._id);
    console.log('================================');

    res.status(201).json({
      success: true,
      message: 'Report uploaded successfully',
      data: report
    });

  } catch (error) {
    console.error('Error uploading report:', error);
    next(error);
  }
};

// @desc    Get all reports for admin's school
// @route   GET /api/admin/reports
// @access  Private (Admin only)
export const getReports = async (req, res, next) => {
  try {
    const { studentId, classId } = req.query;

    // Get the AdminReport model for this school (tenant-aware)
    const AdminReport = await getModel(req.schoolId, 'adminReports');

    // Build filter
    const filter = {};

    if (studentId) {
      filter['student._id'] = studentId;
    }

    if (classId) {
      filter['student.class._id'] = classId;
    }

    // Get reports with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const reports = await AdminReport.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AdminReport.countDocuments(filter);

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
// @route   GET /api/admin/reports/:id
// @access  Private (Admin only)
export const getReportById = async (req, res, next) => {
  try {
    // Get the AdminReport model for this school (tenant-aware)
    const AdminReport = await getModel(req.schoolId, 'adminReports');

    const report = await AdminReport.findById(req.params.id);

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
// @route   PUT /api/admin/reports/:id
// @access  Private (Admin only)
export const updateReport = async (req, res, next) => {
  try {
    // Get the AdminReport model for this school (tenant-aware)
    const AdminReport = await getModel(req.schoolId, 'adminReports');

    const report = await AdminReport.findById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Prevent changing student
    delete req.body.student;

    const updatedReport = await AdminReport.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

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
// @route   DELETE /api/admin/reports/:id
// @access  Private (Admin only)
export const deleteReport = async (req, res, next) => {
  try {
    // Get the AdminReport model for this school (tenant-aware)
    const AdminReport = await getModel(req.schoolId, 'adminReports');

    const report = await AdminReport.findByIdAndDelete(req.params.id);

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
