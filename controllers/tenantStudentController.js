import { validationResult } from 'express-validator';
import { getModel } from '../models/dynamicModels.js';
import crypto from 'crypto';
import School from '../models/School.js';
import { resolveAcademicYear } from '../utils/academicYearResolver.js';

/**
 * Tenant-aware Student Controller
 * All operations use dynamic database connections based on schoolId
 */

/**
 * Generate a unique 8-character alphanumeric parent access code for tenant database
 */
const generateParentAccessCodeForTenant = async (Student) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const codeLength = 8;
  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Generate random code
    code = '';
    const randomBytes = crypto.randomBytes(codeLength);

    for (let i = 0; i < codeLength; i++) {
      const randomIndex = randomBytes[i] % characters.length;
      code += characters[randomIndex];
    }

    // Check if code already exists in tenant database
    const existingStudent = await Student.findOne({
      parentAccessCode: code
    });

    if (!existingStudent) {
      isUnique = true;
    }

    attempts++;
  }

  if (!isUnique) {
    throw new Error('Failed to generate unique access code. Please try again.');
  }

  return code;
};

/**
 * @desc    Create a new student in tenant database
 * @route   POST /api/admin/students
 * @access  Private (Admin only)
 */
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
      phone,
      gender,
      address,
      fatherName,
      parentName,
      parentPhone,
      monthlyFee,
      feeDueDate,
      currentAcademicYear,
      academicYearId
    } = req.body;

    // Get models from tenant database
    const Student = await getModel(req.schoolId, 'students');
    const Class = await getModel(req.schoolId, 'classes');

    // Check student limit before adding
    const school = await School.findById(req.schoolId);
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Get current student count
    const currentStudentCount = await Student.countDocuments();

    // Check if limit is reached
    const limitReached = await school.isStudentLimitReached(currentStudentCount);
    if (limitReached) {
      const planLimits = school.getPlanLimits();
      return res.status(403).json({
        success: false,
        message: 'Your student limit has been reached. Please upgrade your plan.',
        studentLimitReached: true,
        currentCount: currentStudentCount,
        limit: planLimits.students,
        currentPlan: planLimits.name
      });
    }

    // Verify class exists in tenant database
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found in your school'
      });
    }

    const yearDoc = classDoc.academicYearId
      ? await resolveAcademicYear(req.schoolId, { academicYearId: classDoc.academicYearId })
      : await resolveAcademicYear(req.schoolId, { academicYearId, academicYear: currentAcademicYear });

    if (!yearDoc) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid academic year'
      });
    }

    // Normalize roll number: remove leading zeros for comparison (e.g. "01" == "1")
    const normalizedRollNumber = rollNumber.toString().replace(/^0+(\d)/, '$1');

    // Check if roll number already exists in this class (case-insensitive, normalized)
    const allClassStudents = await Student.find({ classId });
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
    const parentAccessCode = await generateParentAccessCodeForTenant(Student);

    // Create student in tenant database
    const student = await Student.create({
      classId,
      rollNumber,
      fullName,
      email,
      phone,
      gender,
      address,
      fatherName,
      parentName,
      parentPhone,
      parentAccessCode,
      currentAcademicYear: yearDoc.year,
      academicYearId: yearDoc._id,
      monthlyFee: monthlyFee || 0,
      feeDueDate: feeDueDate || 1,
      ...(req.file && { profilePicture: req.file.path })
    });

    // Manually attach class details instead of populate to avoid schema registration issues
    const classDetails = await Class.findById(classId).select('className section grade');
    const studentWithClass = student.toObject();
    studentWithClass.classId = classDetails;

    // Use the student with class details
    const studentData = studentWithClass;

    console.log('Student created with parentAccessCode:', studentData.parentAccessCode);

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: studentData,
      parentAccessCode: studentData.parentAccessCode
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all students from tenant database
 * @route   GET /api/admin/students
 * @access  Private (Admin only)
 */
export const getStudents = async (req, res, next) => {
  try {
    const { classId, isActive, search, academicYearId, academicYear } = req.query;

    // Get models from tenant database
    const Student = await getModel(req.schoolId, 'students');
    const Class = await getModel(req.schoolId, 'classes');

    // Build filter (no schoolId needed - tenant database is isolated)
    const filter = {};

    if (classId) {
      filter.classId = classId;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    if (academicYearId) {
      filter.academicYearId = academicYearId;
    } else if (academicYear) {
      filter.currentAcademicYear = academicYear;
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
    const limit = parseInt(req.query.limit) || 1000; // Default to 1000 to show all students
    const skip = (page - 1) * limit;

    const students = await Student.find(filter)
      .sort({ rollNumber: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Manually populate classId — avoids MissingSchemaError on tenant connections
    for (const s of students) {
      if (s.classId) {
        s.classId = await Class.findById(s.classId)
          .select('className section grade').lean() || s.classId;
      }
    }

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

/**
 * @desc    Get single student by ID from tenant database
 * @route   GET /api/admin/students/:id
 * @access  Private (Admin only)
 */
export const getStudentById = async (req, res, next) => {
  try {
    const Student = await getModel(req.schoolId, 'students');
    const Class = await getModel(req.schoolId, 'classes');

    const student = await Student.findById(req.params.id).lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Manually populate class data (multi-tenant safe)
    if (student.classId) {
      student.classId = await Class.findById(student.classId)
        .select('className section grade academicYear academicYearId')
        .lean();
    }

    res.status(200).json({
      success: true,
      data: student
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update student in tenant database
 * @route   PUT /api/admin/students/:id
 * @access  Private (Admin only)
 */
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

    const Student = await getModel(req.schoolId, 'students');
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const updateData = { ...req.body };

    // If updating classId, verify it exists in tenant database
    const targetClassId = req.body.classId || student.classId.toString();
    const Class = await getModel(req.schoolId, 'classes');
    if (req.body.classId && req.body.classId !== student.classId.toString()) {
      const classDoc = await Class.findById(req.body.classId);

      if (!classDoc) {
        return res.status(404).json({
          success: false,
          message: 'Class not found in your school'
        });
      }

      if (classDoc.academicYearId) {
        updateData.academicYearId = classDoc.academicYearId;
        const yearDoc = await resolveAcademicYear(req.schoolId, { academicYearId: classDoc.academicYearId });
        updateData.currentAcademicYear = yearDoc?.year || updateData.currentAcademicYear || '';
      }
    } else if (req.body.academicYearId) {
      const yearDoc = await resolveAcademicYear(req.schoolId, { academicYearId: req.body.academicYearId });
      if (!yearDoc) {
        return res.status(400).json({
          success: false,
          message: 'Please select a valid academic year'
        });
      }
      updateData.currentAcademicYear = yearDoc.year;
    } else if (req.body.currentAcademicYear) {
      const yearDoc = await resolveAcademicYear(req.schoolId, { academicYear: req.body.currentAcademicYear });
      if (yearDoc) {
        updateData.academicYearId = yearDoc._id;
      }
    }

    // If updating roll number, check it doesn't conflict with another student
    if (req.body.rollNumber) {
      const newRollNormalized = req.body.rollNumber.toString().replace(/^0+(\d)/, '$1');
      const classStudents = await Student.find({ classId: targetClassId });
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

    // Handle profile picture upload
    if (req.file) {
      updateData.profilePicture = req.file.path;
    }

    // Update student
    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    ).lean();

    // Manually populate class data (multi-tenant safe)
    if (updatedStudent && updatedStudent.classId) {
      updatedStudent.classId = await Class.findById(updatedStudent.classId)
        .select('className section grade academicYear academicYearId')
        .lean();
    }

    res.status(200).json({
      success: true,
      message: 'Student updated successfully',
      data: updatedStudent
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete student permanently from tenant database
 * @route   DELETE /api/admin/students/:id
 * @access  Private (Admin only)
 */
export const deleteStudent = async (req, res, next) => {
  try {
    const Student = await getModel(req.schoolId, 'students');
    const Attendance = await getModel(req.schoolId, 'attendance');
    const Report = await getModel(req.schoolId, 'reports');

    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // PERMANENT DELETE: Remove from database completely
    // Delete all related data
    const FeePayment = await getModel(req.schoolId, 'feepayments');
    await Attendance.deleteMany({ studentId: req.params.id });
    await Report.deleteMany({ studentId: req.params.id });
    await FeePayment.deleteMany({ studentId: req.params.id });

    // Permanently delete the student from database
    await Student.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Student permanently deleted from database',
      data: { _id: req.params.id }
    });

  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete student'
    });
  }
};

/**
 * @desc    Permanently delete student from tenant database
 * @route   DELETE /api/admin/students/:id/permanent
 * @access  Private (Admin only)
 */
export const permanentDeleteStudent = async (req, res, next) => {
  try {
    const Student = await getModel(req.schoolId, 'students');
    const Attendance = await getModel(req.schoolId, 'attendance');
    const Report = await getModel(req.schoolId, 'reports');
    const FeePayment = await getModel(req.schoolId, 'feepayments');

    const student = await Student.findByIdAndDelete(req.params.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    await Attendance.deleteMany({ studentId: req.params.id });
    await Report.deleteMany({ studentId: req.params.id });
    await FeePayment.deleteMany({ studentId: req.params.id });

    res.status(200).json({
      success: true,
      message: 'Student permanently deleted'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Migrate old student data - copy parentName to fatherName
 * @route   POST /api/admin/students/migrate
 * @access  Private (Admin only)
 */
export const migrateStudentData = async (req, res, next) => {
  try {
    const Student = await getModel(req.schoolId, 'students');

    // Find all students where fatherName is empty but parentName exists
    const studentsToUpdate = await Student.find({
      $or: [
        { fatherName: { $exists: false } },
        { fatherName: null },
        { fatherName: '' }
      ],
      parentName: { $exists: true, $ne: null, $ne: '' }
    });

    console.log(`Found ${studentsToUpdate.length} students to migrate`);

    let updatedCount = 0;

    for (const student of studentsToUpdate) {
      // Copy parentName to fatherName, clear parentName
      student.fatherName = student.parentName;
      student.parentName = ''; // Clear mother name (can be filled later)
      await student.save();
      updatedCount++;
    }

    res.status(200).json({
      success: true,
      message: `Successfully migrated ${updatedCount} students`,
      data: {
        totalFound: studentsToUpdate.length,
        updated: updatedCount
      }
    });

  } catch (error) {
    console.error('Migration error:', error);
    next(error);
  }
};

export default {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  permanentDeleteStudent,
  migrateStudentData
};
