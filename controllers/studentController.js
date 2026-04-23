import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { generateParentAccessCode } from '../utils/generateAccessCode.js';

// @desc    Create a new student
// @route   POST /api/students
// @access  Private (Admin only)
export const createStudent = async (req, res, next) => {
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
      classId,
      rollNumber,
      fullName,
      email,
      password,
      gender,
      bloodGroup,
      address,
      state,
      pincode,
      parentName,
      parentPhone,
      parentEmail,
      monthlyFee,
      feeDueDate,
      currentAcademicYear
    } = req.body;

    // Verify class belongs to admin's school
    const classDoc = await Class.findOne({ _id: classId, schoolId: req.schoolId });
    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found or does not belong to your school'
      });
    }

    // Normalize roll number: remove leading zeros for comparison (e.g. "01" == "1")
    const normalizedRollNumber = rollNumber.toString().replace(/^0+(\d)/, '$1');

    // Check if roll number already exists in this class (normalized)
    const allClassStudents = await Student.find({ schoolId: req.schoolId, classId });
    const existingStudent = allClassStudents.find(s =>
      s.rollNumber.toString().replace(/^0+(\d)/, '$1') === normalizedRollNumber
    );

    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: 'Roll number already exists in this class'
      });
    }

    // Generate unique parent access code
    const parentAccessCode = await generateParentAccessCode(req.schoolId);

    // Hash password if provided
    let hashedPassword;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    // Create student
    const studentCreateData = {
      schoolId: req.schoolId,
      classId,
      rollNumber,
      fullName,
      email,
      gender,
      bloodGroup,
      address,
      state,
      pincode,
      parentName,
      parentPhone,
      parentEmail,
      parentAccessCode,
      monthlyFee: monthlyFee || 0,
      feeDueDate: feeDueDate || 1,
      currentAcademicYear
    };

    // Add password only if provided
    if (hashedPassword) {
      studentCreateData.password = hashedPassword;
    }

    // Add profile picture if uploaded
    if (req.file && req.file.path) {
      studentCreateData.profilePicture = req.file.path;
    }

    const student = await Student.create(studentCreateData);

    // Populate class details
    await student.populate('classId', 'className section grade');

    // Return student data without password
    const responseData = {
      _id: student._id,
      schoolId: student.schoolId,
      classId: student.classId,
      rollNumber: student.rollNumber,
      fullName: student.fullName,
      email: student.email,
      gender: student.gender,
      bloodGroup: student.bloodGroup,
      address: student.address,
      state: student.state,
      pincode: student.pincode,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      parentEmail: student.parentEmail,
      parentAccessCode: student.parentAccessCode,
      monthlyFee: student.monthlyFee,
      feeDueDate: student.feeDueDate,
      admissionDate: student.admissionDate,
      isActive: student.isActive,
      createdAt: student.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: responseData
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get all students for admin's school
// @route   GET /api/students
// @access  Private (Admin only)
export const getStudents = async (req, res, next) => {
  try {
    const { classId, isActive, search } = req.query;

    // Build filter
    const filter = { schoolId: req.schoolId };

    if (classId) {
      filter.classId = classId;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { rollNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Get students with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const students = await Student.find(filter)
      .select('-password')
      .populate('classId', 'className section grade academicYear')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Student.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: students.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: students
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get single student by ID
// @route   GET /api/students/:id
// @access  Private (Admin only)
export const getStudentById = async (req, res, next) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    })
      .select('-password')
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
    next(error);
  }
};

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private (Admin only)
export const updateStudent = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const student = await Student.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // If updating classId, verify it belongs to admin's school
    const targetClassId = req.body.classId || student.classId.toString();
    if (req.body.classId && req.body.classId !== student.classId.toString()) {
      const classDoc = await Class.findOne({
        _id: req.body.classId,
        schoolId: req.schoolId
      });

      if (!classDoc) {
        return res.status(404).json({
          success: false,
          message: 'Class not found or does not belong to your school'
        });
      }
    }

    // If updating roll number, check it doesn't conflict with another student
    if (req.body.rollNumber) {
      const newRollNormalized = req.body.rollNumber.toString().replace(/^0+(\d)/, '$1');
      const classStudents = await Student.find({ schoolId: req.schoolId, classId: targetClassId });
      const conflict = classStudents.find(s =>
        s._id.toString() !== req.params.id &&
        s.rollNumber.toString().replace(/^0+(\d)/, '$1') === newRollNormalized
      );

      if (conflict) {
        return res.status(400).json({
          success: false,
          message: 'Roll number already exists in this class'
        });
      }
    }

    // If updating password, hash it
    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      req.body.password = await bcrypt.hash(req.body.password, salt);
    }

    // Prevent changing parentAccessCode and schoolId
    delete req.body.parentAccessCode;
    delete req.body.schoolId;

    // Add profile picture if uploaded
    if (req.file && req.file.path) {
      req.body.profilePicture = req.file.path;
    }

    // Update student
    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    )
      .select('-password')
      .populate('classId', 'className section grade');

    res.status(200).json({
      success: true,
      message: 'Student updated successfully',
      data: updatedStudent
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Delete student (soft delete)
// @route   DELETE /api/students/:id
// @access  Private (Admin only)
export const deleteStudent = async (req, res, next) => {
  try {
    const student = await Student.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Soft delete - set isActive to false
    student.isActive = false;
    await student.save();

    res.status(200).json({
      success: true,
      message: 'Student deactivated successfully'
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Permanently delete student
// @route   DELETE /api/students/:id/permanent
// @access  Private (Admin only)
export const permanentDeleteStudent = async (req, res, next) => {
  try {
    const student = await Student.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Student permanently deleted'
    });

  } catch (error) {
    next(error);
  }
};
