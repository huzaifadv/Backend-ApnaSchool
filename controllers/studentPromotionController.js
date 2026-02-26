import { getModel } from '../models/dynamicModels.js';
import mongoose from 'mongoose';

// @desc    Promote students in bulk
// @route   POST /api/admin/students/promote/bulk
// @access  Private (Admin only)
export const bulkPromoteStudents = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { promotions, targetAcademicYear } = req.body;

    // Validation
    if (!promotions || !Array.isArray(promotions) || promotions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Promotions array is required and must not be empty'
      });
    }

    if (!targetAcademicYear) {
      return res.status(400).json({
        success: false,
        message: 'Target academic year is required'
      });
    }

    // Get tenant models
    const Student = await getModel(schoolId, 'students');
    const Class = await getModel(schoolId, 'classes');
    const AcademicYear = await getModel(schoolId, 'academicyears');

    // Verify target academic year exists
    const academicYear = await AcademicYear.findOne({
      year: targetAcademicYear
    });

    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: 'Target academic year not found'
      });
    }

    const results = [];
    const errors = [];

    // Process each promotion
    for (const promotion of promotions) {
      try {
        const { studentId, targetClassId, promotionType, rollNumber, remarks } = promotion;

        // Validate required fields
        if (!studentId || !promotionType) {
          errors.push({
            studentId,
            error: 'Student ID and promotion type are required'
          });
          continue;
        }

        // Find student
        const student = await Student.findById(studentId);
        if (!student) {
          errors.push({
            studentId,
            error: 'Student not found'
          });
          continue;
        }

        // Get current class details
        const currentClass = await Class.findById(student.classId);
        if (!currentClass) {
          errors.push({
            studentId,
            error: 'Current class not found'
          });
          continue;
        }

        let targetClass = null;
        let newClassId = student.classId;
        let newRollNumber = student.rollNumber;

        // Handle different promotion types
        if (promotionType === 'promoted' || promotionType === 'repeated') {
          if (!targetClassId) {
            errors.push({
              studentId,
              error: 'Target class ID is required for promotion/repetition'
            });
            continue;
          }

          // Verify target class exists
          targetClass = await Class.findById(targetClassId);
          if (!targetClass) {
            errors.push({
              studentId,
              error: 'Target class not found'
            });
            continue;
          }

          // Ensure target class belongs to target academic year
          // Exception: For repeated students, allow current class even if it's in different year
          if (targetClass.academicYear !== targetAcademicYear && promotionType !== 'repeated') {
            errors.push({
              studentId,
              error: `Target class belongs to ${targetClass.academicYear}, not ${targetAcademicYear}`
            });
            continue;
          }

          newClassId = targetClassId;
          newRollNumber = rollNumber || student.rollNumber;
        } else if (promotionType === 'passedOut') {
          // Student passed out - mark as inactive
          student.status = 'passedOut';
          student.isActive = false;
        }

        // Add to enrollment history
        student.enrollmentHistory.push({
          academicYear: targetAcademicYear,
          classId: newClassId,
          className: targetClass ? targetClass.className : currentClass.className,
          section: targetClass ? targetClass.section : currentClass.section,
          rollNumber: newRollNumber,
          promotionType,
          promotionDate: new Date(),
          remarks: remarks || ''
        });

        // Update current academic year and class
        student.currentAcademicYear = targetAcademicYear;
        if (promotionType !== 'passedOut') {
          student.classId = newClassId;
          student.rollNumber = newRollNumber;
        }

        await student.save();

        results.push({
          studentId: student._id,
          fullName: student.fullName,
          promotionType,
          success: true
        });
      } catch (error) {
        errors.push({
          studentId: promotion.studentId,
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Promoted ${results.length} students successfully`,
      data: {
        successCount: results.length,
        errorCount: errors.length,
        results,
        errors
      }
    });
  } catch (error) {
    console.error('Error in bulk promotion:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to promote students'
    });
  }
};

// @desc    Promote single student
// @route   POST /api/admin/students/:id/promote
// @access  Private (Admin only)
export const promoteStudent = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { id } = req.params;
    const { targetClassId, targetAcademicYear, promotionType, rollNumber, remarks } = req.body;

    // Validation
    if (!targetAcademicYear || !promotionType) {
      return res.status(400).json({
        success: false,
        message: 'Target academic year and promotion type are required'
      });
    }

    // Get tenant models
    const Student = await getModel(schoolId, 'students');
    const Class = await getModel(schoolId, 'classes');
    const AcademicYear = await getModel(schoolId, 'academicyears');

    // Verify target academic year exists
    const academicYear = await AcademicYear.findOne({
      year: targetAcademicYear
    });

    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: 'Target academic year not found'
      });
    }

    // Find student
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get current class details
    const currentClass = await Class.findById(student.classId);
    if (!currentClass) {
      return res.status(404).json({
        success: false,
        message: 'Current class not found'
      });
    }

    let targetClass = null;
    let newClassId = student.classId;
    let newRollNumber = student.rollNumber;

    // Handle different promotion types
    if (promotionType === 'promoted' || promotionType === 'repeated') {
      if (!targetClassId) {
        return res.status(400).json({
          success: false,
          message: 'Target class ID is required for promotion/repetition'
        });
      }

      // Verify target class exists
      targetClass = await Class.findById(targetClassId);
      if (!targetClass) {
        return res.status(404).json({
          success: false,
          message: 'Target class not found'
        });
      }

      // Ensure target class belongs to target academic year
      if (targetClass.academicYear !== targetAcademicYear) {
        return res.status(400).json({
          success: false,
          message: `Target class belongs to ${targetClass.academicYear}, not ${targetAcademicYear}`
        });
      }

      newClassId = targetClassId;
      newRollNumber = rollNumber || student.rollNumber;
    } else if (promotionType === 'passedOut') {
      // Student passed out - mark as inactive
      student.status = 'passedOut';
      student.isActive = false;
    }

    // Add to enrollment history
    student.enrollmentHistory.push({
      academicYear: targetAcademicYear,
      classId: newClassId,
      className: targetClass ? targetClass.className : currentClass.className,
      section: targetClass ? targetClass.section : currentClass.section,
      rollNumber: newRollNumber,
      promotionType,
      promotionDate: new Date(),
      remarks: remarks || ''
    });

    // Update current academic year and class
    student.currentAcademicYear = targetAcademicYear;
    if (promotionType !== 'passedOut') {
      student.classId = newClassId;
      student.rollNumber = newRollNumber;
    }

    await student.save();

    // Populate student with class details
    await student.populate('classId');

    res.status(200).json({
      success: true,
      message: 'Student promoted successfully',
      data: student
    });
  } catch (error) {
    console.error('Error promoting student:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to promote student'
    });
  }
};

// @desc    Get student enrollment history
// @route   GET /api/admin/students/:id/enrollment-history
// @access  Private (Admin only)
export const getStudentEnrollmentHistory = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { id } = req.params;

    // Get tenant model
    const Student = await getModel(schoolId, 'students');

    const student = await Student.findById(id)
      .select('fullName rollNumber enrollmentHistory currentAcademicYear status')
      .populate('classId', 'className section grade academicYear');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.status(200).json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error('Error fetching enrollment history:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch enrollment history'
    });
  }
};

// @desc    Get students by academic year
// @route   GET /api/admin/students/by-academic-year/:year
// @access  Private (Admin only)
export const getStudentsByAcademicYear = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { year } = req.params;
    const { status, classId } = req.query;

    // Get tenant model
    const Student = await getModel(schoolId, 'students');

    const filter = {
      currentAcademicYear: year
    };

    if (status) filter.status = status;
    if (classId) filter.classId = classId;

    const students = await Student.find(filter)
      .populate('classId', 'className section grade academicYear')
      .sort({ rollNumber: 1 });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students
    });
  } catch (error) {
    console.error('Error fetching students by academic year:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch students'
    });
  }
};

// @desc    Get promotion statistics for a class
// @route   GET /api/admin/classes/:id/promotion-stats
// @access  Private (Admin only)
export const getClassPromotionStats = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { id } = req.params;

    // Get tenant models
    const Student = await getModel(schoolId, 'students');
    const Class = await getModel(schoolId, 'classes');

    // Verify class exists
    const classDoc = await Class.findById(id);
    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Get all students in this class
    const students = await Student.find({ classId: id });

    // Count students by status
    const stats = {
      totalStudents: students.length,
      active: students.filter(s => s.status === 'active').length,
      passedOut: students.filter(s => s.status === 'passedOut').length,
      inactive: students.filter(s => s.status === 'inactive').length,
      notYetPromoted: students.filter(s => !s.currentAcademicYear).length,
      className: classDoc.className,
      section: classDoc.section,
      academicYear: classDoc.academicYear
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching promotion stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch promotion statistics'
    });
  }
};
