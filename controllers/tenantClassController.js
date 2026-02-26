import { validationResult } from 'express-validator';
import { getModel } from '../models/dynamicModels.js';

/**
 * Tenant-aware Class Controller
 * All operations use dynamic database connections based on schoolId
 */

/**
 * @desc    Create a new class in tenant database
 * @route   POST /api/admin/classes
 * @access  Private (Admin only)
 */
export const createClass = async (req, res, next) => {
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
      className,
      section,
      grade,
      academicYear,
      classTeacher,
      room,
      capacity
    } = req.body;

    // Get Class model from tenant database
    const Class = await getModel(req.schoolId, 'classes');

    // Check if class-section combination already exists for this academic year
    const existingClass = await Class.findOne({
      className,
      section: section ? section.toUpperCase() : '',
      academicYear
    });

    if (existingClass) {
      return res.status(400).json({
        success: false,
        message: 'Class with this section already exists for the academic year'
      });
    }

    // Create class in tenant database
    const newClass = await Class.create({
      className,
      section: section ? section.toUpperCase() : '',
      grade,
      academicYear,
      classTeacher,
      room,
      capacity
    });

    res.status(201).json({
      success: true,
      message: 'Class created successfully',
      data: newClass
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all classes from tenant database
 * @route   GET /api/admin/classes
 * @access  Private (Admin only)
 */
export const getClasses = async (req, res, next) => {
  try {
    const { academicYear, grade, isActive } = req.query;

    // Get models from tenant database
    const Class = await getModel(req.schoolId, 'classes');
    const Student = await getModel(req.schoolId, 'students');

    // Build filter (no schoolId needed - tenant database is isolated)
    const filter = {};

    if (academicYear) {
      filter.academicYear = academicYear;
    }

    if (grade) {
      filter.grade = grade;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000; // Default to 1000 to show all classes
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const total = await Class.countDocuments(filter);

    // Get classes with pagination - sorted by className ascending (1, 2, 3, ...)
    const classes = await Class.find(filter)
      .sort({ className: 1, section: 1 })
      .skip(skip)
      .limit(limit);

    // Get student count for each class
    const classesWithCount = await Promise.all(
      classes.map(async (classDoc) => {
        const studentCount = await Student.countDocuments({
          classId: classDoc._id,
          isActive: true
        });

        return {
          ...classDoc.toObject(),
          studentCount
        };
      })
    );

    res.status(200).json({
      success: true,
      count: classesWithCount.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: classesWithCount
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single class by ID from tenant database
 * @route   GET /api/admin/classes/:id
 * @access  Private (Admin only)
 */
export const getClassById = async (req, res, next) => {
  try {
    const Class = await getModel(req.schoolId, 'classes');
    const Student = await getModel(req.schoolId, 'students');

    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Get student count and list
    const studentCount = await Student.countDocuments({
      classId: classDoc._id,
      isActive: true
    });

    const students = await Student.find({
      classId: classDoc._id,
      isActive: true
    })
      .select('rollNumber firstName lastName email')
      .sort({ rollNumber: 1 });

    res.status(200).json({
      success: true,
      data: {
        ...classDoc.toObject(),
        studentCount,
        students
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update class in tenant database
 * @route   PUT /api/admin/classes/:id
 * @access  Private (Admin only)
 */
export const updateClass = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const Class = await getModel(req.schoolId, 'classes');
    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // If updating class name, section, or academic year, check for duplicates
    if (
      (req.body.className || req.body.section || req.body.academicYear) &&
      (req.body.className !== classDoc.className ||
        req.body.section?.toUpperCase() !== classDoc.section ||
        req.body.academicYear !== classDoc.academicYear)
    ) {
      const existingClass = await Class.findOne({
        _id: { $ne: req.params.id },
        className: req.body.className || classDoc.className,
        section: req.body.section?.toUpperCase() || classDoc.section,
        academicYear: req.body.academicYear || classDoc.academicYear
      });

      if (existingClass) {
        return res.status(400).json({
          success: false,
          message: 'Class with this section already exists for the academic year'
        });
      }
    }

    // Convert section to uppercase if provided
    if (req.body.section) {
      req.body.section = req.body.section.toUpperCase();
    }

    // Update class
    const updatedClass = await Class.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      message: 'Class updated successfully',
      data: updatedClass
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete class permanently from tenant database
 * @route   DELETE /api/admin/classes/:id
 * @access  Private (Admin only)
 */
export const deleteClass = async (req, res, next) => {
  try {
    const Class = await getModel(req.schoolId, 'classes');
    const Student = await getModel(req.schoolId, 'students');
    const Attendance = await getModel(req.schoolId, 'attendance');

    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Count students in this class
    const studentCount = await Student.countDocuments({
      classId: req.params.id
    });

    // PERMANENT DELETE: Remove from database completely
    // Delete all related data
    if (studentCount > 0) {
      // Delete all students in this class
      await Student.deleteMany({ classId: req.params.id });

      // Delete all attendance records for this class
      await Attendance.deleteMany({ classId: req.params.id });
    }

    // Permanently delete the class from database
    await Class.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: studentCount > 0
        ? `Class and ${studentCount} student(s) permanently deleted from database`
        : 'Class permanently deleted from database',
      data: { _id: req.params.id }
    });

  } catch (error) {
    console.error('Delete class error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete class'
    });
  }
};

/**
 * @desc    Permanently delete class from tenant database
 * @route   DELETE /api/admin/classes/:id/permanent
 * @access  Private (Admin only)
 */
export const permanentDeleteClass = async (req, res, next) => {
  try {
    const Class = await getModel(req.schoolId, 'classes');
    const Student = await getModel(req.schoolId, 'students');
    const Attendance = await getModel(req.schoolId, 'attendance');

    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Count students and related data
    const studentCount = await Student.countDocuments({
      classId: req.params.id
    });

    // Delete all related data
    if (studentCount > 0) {
      // Delete all students in this class
      await Student.deleteMany({ classId: req.params.id });

      // Delete all attendance records for this class
      await Attendance.deleteMany({ classId: req.params.id });
    }

    // Permanently delete the class
    await Class.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: studentCount > 0
        ? `Class, ${studentCount} student(s), and related records permanently deleted`
        : 'Class permanently deleted'
    });

  } catch (error) {
    console.error('Permanent delete class error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to permanently delete class'
    });
  }
};

/**
 * @desc    Get class statistics from tenant database
 * @route   GET /api/admin/classes/:id/stats
 * @access  Private (Admin only)
 */
export const getClassStats = async (req, res, next) => {
  try {
    const Class = await getModel(req.schoolId, 'classes');
    const Student = await getModel(req.schoolId, 'students');

    const classDoc = await Class.findById(req.params.id);

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Get student statistics
    const totalStudents = await Student.countDocuments({
      classId: classDoc._id
    });

    const activeStudents = await Student.countDocuments({
      classId: classDoc._id,
      isActive: true
    });

    const genderStats = await Student.aggregate([
      {
        $match: {
          classId: classDoc._id,
          isActive: true
        }
      },
      {
        $group: {
          _id: '$gender',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        class: classDoc,
        statistics: {
          totalStudents,
          activeStudents,
          inactiveStudents: totalStudents - activeStudents,
          capacity: classDoc.capacity,
          availableSeats: classDoc.capacity - activeStudents,
          genderDistribution: genderStats
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

export default {
  createClass,
  getClasses,
  getClassById,
  updateClass,
  deleteClass,
  permanentDeleteClass,
  getClassStats
};
