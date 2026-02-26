import { validationResult } from 'express-validator';
import Class from '../models/Class.js';
import Student from '../models/Student.js';

// @desc    Create a new class
// @route   POST /api/classes
// @access  Private (Admin only)
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

    // Check if class-section combination already exists for this school and academic year
    const existingClass = await Class.findOne({
      schoolId: req.schoolId,
      className,
      section,
      academicYear
    });

    if (existingClass) {
      return res.status(400).json({
        success: false,
        message: 'Class with this section already exists for the academic year'
      });
    }

    // Create class
    const newClass = await Class.create({
      schoolId: req.schoolId,
      className,
      section: section.toUpperCase(),
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

// @desc    Get all classes for admin's school
// @route   GET /api/classes
// @access  Private (Admin only)
export const getClasses = async (req, res, next) => {
  try {
    const { academicYear, grade, isActive } = req.query;

    // Build filter for admin's school only
    const filter = { schoolId: req.schoolId };

    if (academicYear) {
      filter.academicYear = academicYear;
    }

    if (grade) {
      filter.grade = grade;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    // Get classes with student count
    const classes = await Class.find(filter).sort({ grade: 1, section: 1 });

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
      data: classesWithCount
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get single class by ID
// @route   GET /api/classes/:id
// @access  Private (Admin only)
export const getClassById = async (req, res, next) => {
  try {
    const classDoc = await Class.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

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

// @desc    Update class
// @route   PUT /api/classes/:id
// @access  Private (Admin only)
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

    const classDoc = await Class.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

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
        schoolId: req.schoolId,
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

    // Prevent changing schoolId
    delete req.body.schoolId;

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

// @desc    Delete class (soft delete)
// @route   DELETE /api/classes/:id
// @access  Private (Admin only)
export const deleteClass = async (req, res, next) => {
  try {
    const classDoc = await Class.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if class has active students
    const activeStudentCount = await Student.countDocuments({
      classId: classDoc._id,
      isActive: true
    });

    if (activeStudentCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete class with ${activeStudentCount} active students. Please transfer or deactivate students first.`
      });
    }

    // Soft delete - set isActive to false
    classDoc.isActive = false;
    await classDoc.save();

    res.status(200).json({
      success: true,
      message: 'Class deactivated successfully'
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Permanently delete class
// @route   DELETE /api/classes/:id/permanent
// @access  Private (Admin only)
export const permanentDeleteClass = async (req, res, next) => {
  try {
    const classDoc = await Class.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Check if class has any students
    const studentCount = await Student.countDocuments({
      classId: classDoc._id
    });

    if (studentCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot permanently delete class with ${studentCount} students. Please delete or transfer students first.`
      });
    }

    await Class.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Class permanently deleted'
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get class statistics
// @route   GET /api/classes/:id/stats
// @access  Private (Admin only)
export const getClassStats = async (req, res, next) => {
  try {
    const classDoc = await Class.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

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
