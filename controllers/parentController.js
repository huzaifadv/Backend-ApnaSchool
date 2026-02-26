import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import Student from '../models/Student.js';

// @desc    Verify parent access code and return JWT
// @route   POST /api/parent/verify
// @access  Public
export const verifyParentCode = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { schoolId, parentCode } = req.body;

    // Find student with matching schoolId and parentAccessCode
    const student = await Student.findOne({
      schoolId,
      parentAccessCode: parentCode,
      isActive: true
    })
      .select('-password')
      .populate('classId', 'className section grade academicYear')
      .populate('schoolId', 'schoolName email phone');

    if (!student) {
      return res.status(401).json({
        success: false,
        message: 'Invalid parent access code or school'
      });
    }

    // Generate JWT token for parent (expires in 10 days)
    const token = jwt.sign(
      {
        studentId: student._id,
        schoolId: student.schoolId._id,
        parentName: student.parentName,
        type: 'parent'
      },
      process.env.JWT_SECRET,
      { expiresIn: '10d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Parent verification successful',
      token,
      data: {
        studentId: student._id,
        schoolId: student.schoolId._id,
        schoolName: student.schoolId.schoolName,
        student: {
          fullName: student.fullName,
          rollNumber: student.rollNumber,
          class: student.classId,
          email: student.email,
          gender: student.gender
        },
        parent: {
          name: student.parentName,
          phone: student.parentPhone,
          email: student.parentEmail
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get student profile for parent
// @route   GET /api/parent/student
// @access  Private (Parent only)
export const getStudentProfile = async (req, res, next) => {
  try {
    const student = await Student.findOne({
      _id: req.studentId,
      schoolId: req.schoolId,
      isActive: true
    })
      .select('-password -parentAccessCode')
      .populate('classId', 'className section grade academicYear classTeacher room')
      .populate('schoolId', 'schoolName email phone address city state');

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
    next(error);
  }
};
