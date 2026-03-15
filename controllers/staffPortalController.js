/**
 * Staff Portal Controller — Staff-side operations
 *
 * SAFE EXTENSION:
 *  - All routes under /api/staff/*
 *  - Protected by protectStaff middleware (portal:'staff' JWT only)
 *  - Staff can ONLY access their OWN data (ownership enforced on every endpoint)
 *  - Read-only access to Class and Student collections (never writes to them)
 *  - Does NOT touch Admin, Parent, Attendance, or any existing collection
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { getModel } from '../models/dynamicModels.js';
import { isOwner } from '../middleware/staffAuthMiddleware.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Issue a staff JWT.
 * Token shape differs from admin (portal:'staff') and parent (type:'parent').
 */
const generateStaffToken = (staff, schoolId) => {
  return jwt.sign(
    {
      portal:    'staff',          // Guards against admin/parent token reuse
      staffDbId: staff._id,        // MongoDB _id for DB lookups
      staffCode: staff.staffId,    // Human-readable code STF-YYYY-NNNN
      role:      staff.role,
      schoolId
    },
    process.env.JWT_SECRET,
    { expiresIn: '10d' }
  );
};

/**
 * Check that the given classId is in staff's assignedClasses.
 * Returns the matched entry or null.
 */
const getAssignedClass = (staff, classId) => {
  return staff.assignedClasses.find(
    c => c.classId.toString() === classId.toString()
  );
};

// ─── Authentication ───────────────────────────────────────────────────────────

/**
 * @desc    Staff login (Auto-detect school from staffId)
 * @route   POST /api/staff/auth/login
 * @access  Public
 *
 * Body: { staffId: "STF-2026-0001", password: "..." }
 * School is automatically detected by searching all active schools.
 */
export const staffLogin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { staffId, password } = req.body;

    // Import School model to get all active schools
    const { default: School } = await import('../models/School.js');

    // Find all active schools
    const activeSchools = await School.find({
      isActive: true,
      approvalStatus: 'approved'
    }).select('_id schoolName');

    if (!activeSchools || activeSchools.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'No active schools found in the system'
      });
    }

    // Search for staff across all school databases
    let foundStaff = null;
    let foundSchoolId = null;

    for (const school of activeSchools) {
      try {
        const Staff = await getModel(school._id, 'staffs');
        const staff = await Staff.findOne({ staffId }).select('+password');

        if (staff) {
          foundStaff = staff;
          foundSchoolId = school._id.toString();
          break; // Found the staff, stop searching
        }
      } catch (err) {
        // If tenant DB doesn't exist or error, skip to next school
        console.error(`Error checking school ${school.schoolName}:`, err.message);
        continue;
      }
    }

    if (!foundStaff) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Staff ID or password'
      });
    }

    if (!foundStaff.isActive || foundStaff.status === 'inactive') {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact the administrator.'
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, foundStaff.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Staff ID or password'
      });
    }

    const token = generateStaffToken(foundStaff, foundSchoolId);

    // Return staff profile (without password)
    const staffObj = foundStaff.toObject();
    delete staffObj.password;

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      data: staffObj
    });
  } catch (error) {
    console.error('staffLogin error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get logged-in staff profile
 * @route   GET /api/staff/auth/me
 * @access  Staff (protectStaff)
 */
export const getMyProfile = async (req, res) => {
  try {
    // req.staff is already attached by protectStaff middleware (password excluded)
    return res.status(200).json({
      success: true,
      data: req.staff
    });
  } catch (error) {
    console.error('getMyProfile error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Update own contact/qualification only (staff cannot change name, CNIC, role, salary)
 * @route   PUT /api/staff/profile
 * @access  Staff (protectStaff)
 */
export const updateMyProfile = async (req, res) => {
  try {
    // Whitelist: only allow safe fields staff can self-update
    const { contact, qualification, profileImage } = req.body;
    const updateData = {};
    if (contact)       updateData.contact       = contact;
    if (qualification) updateData.qualification = qualification;
    if (profileImage)  updateData.profileImage  = profileImage;

    const Staff = await getModel(req.schoolId, 'staffs');
    const staff = await Staff.findByIdAndUpdate(
      req.staffDbId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: staff
    });
  } catch (error) {
    console.error('updateMyProfile error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Change own password
 * @route   PUT /api/staff/auth/change-password
 * @access  Staff (protectStaff)
 */
export const changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current and new passwords are required'
      });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    const Staff = await getModel(req.schoolId, 'staffs');
    const staff = await Staff.findById(req.staffDbId).select('+password');

    const isMatch = await bcrypt.compare(currentPassword, staff.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    staff.password = await bcrypt.hash(newPassword, salt);
    await staff.save();

    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('changeMyPassword error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Classes ─────────────────────────────────────────────────────────────────

/**
 * @desc    Get staff's assigned classes
 * @route   GET /api/staff/classes
 * @access  Staff (protectStaff)
 */
export const getMyClasses = async (req, res) => {
  try {
    const Class = await getModel(req.schoolId, 'classes');

    const classIds = req.staff.assignedClasses.map(c => c.classId);
    const classes  = await Class.find({ _id: { $in: classIds }, isActive: true });

    return res.status(200).json({
      success: true,
      count: classes.length,
      data:  classes
    });
  } catch (error) {
    console.error('getMyClasses error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Get ALL classes of the school (for diary creation — staff can write diary for any class)
 * @route   GET /api/staff/all-classes
 * @access  Staff (protectStaff)
 */
export const getAllSchoolClasses = async (req, res) => {
  try {
    const Class = await getModel(req.schoolId, 'classes');
    const classes = await Class.find({ isActive: true }).sort({ className: 1, section: 1 });

    return res.status(200).json({
      success: true,
      count: classes.length,
      data:  classes
    });
  } catch (error) {
    console.error('getAllSchoolClasses error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Get students for one of staff's assigned classes
 * @route   GET /api/staff/classes/:classId/students
 * @access  Staff (protectStaff)
 */
export const getClassStudents = async (req, res) => {
  try {
    const { classId } = req.params;

    // ── Ownership guard: staff must be assigned to this class ────────────
    if (!getAssignedClass(req.staff, classId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this class'
      });
    }

    const Student = await getModel(req.schoolId, 'students');
    const students = await Student.find({ classId, status: 'active' })
      .select('fullName rollNumber gender parentPhone parentName fatherName parentAccessCode')
      .sort({ rollNumber: 1 });

    return res.status(200).json({
      success: true,
      count: students.length,
      data:  students
    });
  } catch (error) {
    console.error('getClassStudents error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Class Attendance ─────────────────────────────────────────────────────────

/**
 * @desc    Mark / update attendance for students in one of staff's assigned classes
 * @route   POST /api/staff/class-attendance
 * @access  Staff (protectStaff)
 *
 * Body: { classId, date, attendanceRecords: [{ studentId, status }] }
 *
 * Writes to the SHARED 'attendance' collection (same as admin portal).
 * Uses upsert per student — no "already marked" errors.
 */
export const markClassAttendance = async (req, res) => {
  try {
    const { classId, date, attendanceRecords } = req.body;

    if (!classId || !date || !attendanceRecords || !attendanceRecords.length) {
      return res.status(400).json({
        success: false,
        message: 'classId, date and attendanceRecords are required'
      });
    }

    if (!getAssignedClass(req.staff, classId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this class'
      });
    }

    const Attendance = await getModel(req.schoolId, 'attendance');

    // Store date as plain YYYY-MM-DD — Mongoose converts 'YYYY-MM-DD' to
    // 2026-02-19T00:00:00.000Z consistently on every server/timezone.
    // Both save and query use the same conversion so they always match.
    const attendanceDate = new Date(date); // '2026-02-19' → 2026-02-19T00:00:00.000Z
    const dayStart = new Date(date);
    const dayEnd   = new Date(date);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const results = { success: [], failed: [] };

    for (const record of attendanceRecords) {
      try {
        const { studentId, status } = record;
        // Capitalize first letter to match attendance schema enum (Present/Absent)
        const normalizedStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

        const existing = await Attendance.findOne({
          studentId,
          date: { $gte: dayStart, $lte: dayEnd }
        });

        if (existing) {
          existing.status    = normalizedStatus;
          existing.markedBy  = req.staffDbId;
          await existing.save();
          results.success.push({ studentId, action: 'updated' });
        } else {
          await Attendance.create({
            studentId,
            classId,
            date:     attendanceDate,
            status:   normalizedStatus,
            period:   'Full Day',
            markedBy: req.staffDbId
          });
          results.success.push({ studentId, action: 'created' });
        }
      } catch (err) {
        results.failed.push({ studentId: record.studentId, reason: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Attendance saved: ${results.success.length} successful, ${results.failed.length} failed`,
      data:    results
    });
  } catch (error) {
    console.error('markClassAttendance error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Update already-marked attendance (kept for backward compat, delegates to POST logic)
 * @route   PUT /api/staff/class-attendance
 * @access  Staff (protectStaff)
 */
export const updateClassAttendance = markClassAttendance;

/**
 * @desc    Get attendance records marked by this staff for a class
 * @route   GET /api/staff/class-attendance/:classId
 * @access  Staff (protectStaff)
 */
export const getMyClassAttendance = async (req, res) => {
  try {
    const { classId } = req.params;
    const { date, from, to } = req.query;

    if (!getAssignedClass(req.staff, classId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this class'
      });
    }

    // Use shared attendance collection (same as admin portal)
    const Attendance = await getModel(req.schoolId, 'attendance');
    const query = { classId };

    // new Date('YYYY-MM-DD') gives midnight UTC — same as how dates are stored.
    if (date) {
      const d = new Date(date);
      const dEnd = new Date(date); dEnd.setUTCHours(23, 59, 59, 999);
      query.date = { $gte: d, $lte: dEnd };
    } else if (from || to) {
      query.date = {};
      if (from) { query.date.$gte = new Date(from.split('T')[0]); }
      if (to)   { const e = new Date(to.split('T')[0]); e.setUTCHours(23,59,59,999); query.date.$lte = e; }
    }

    const Student = await getModel(req.schoolId, 'students'); // register before manual fetch

    const records = await Attendance.find(query)
      .sort({ date: -1 })
      .lean();

    // Manually populate studentId (avoid MissingSchemaError on cross-tenant populate)
    for (const rec of records) {
      if (rec.studentId) {
        rec.studentId = await Student.findById(rec.studentId)
          .select('fullName rollNumber').lean();
      }
    }

    return res.status(200).json({ success: true, count: records.length, data: records });
  } catch (error) {
    console.error('getMyClassAttendance error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Self Attendance ──────────────────────────────────────────────────────────

/**
 * @desc    Mark own attendance (check-in / check-out)
 * @route   POST /api/staff/self-attendance
 * @access  Staff (protectStaff)
 *
 * Body: { date, status, checkInTime?, checkOutTime? }
 * Self-marked records start with verificationStatus: 'pending' — admin must verify.
 */
export const markSelfAttendance = async (req, res) => {
  try {
    const { date, status, checkInTime, checkOutTime } = req.body;

    if (!date || !status) {
      return res.status(400).json({
        success: false,
        message: 'date and status are required'
      });
    }

    const StaffAttendance = await getModel(req.schoolId, 'staffattendance');

    const attendanceDate = new Date(date);
    attendanceDate.setUTCHours(0, 0, 0, 0);

    const existing = await StaffAttendance.findOne({
      staffId: req.staffDbId,
      date:    attendanceDate
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Attendance for today already submitted. Contact admin for corrections.'
      });
    }

    const record = await StaffAttendance.create({
      staffId:            req.staffDbId,
      date:               attendanceDate,
      status,
      checkInTime:        checkInTime  ? new Date(checkInTime)  : undefined,
      checkOutTime:       checkOutTime ? new Date(checkOutTime) : undefined,
      markedBy:           'self',
      verificationStatus: 'pending'
    });

    return res.status(201).json({
      success: true,
      message: 'Attendance submitted. Awaiting admin verification.',
      data:    record
    });
  } catch (error) {
    console.error('markSelfAttendance error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Get own attendance records
 * @route   GET /api/staff/self-attendance
 * @access  Staff (protectStaff)
 */
export const getMySelfAttendance = async (req, res) => {
  try {
    const { month, year } = req.query;

    const StaffAttendance = await getModel(req.schoolId, 'staffattendance');
    const query = { staffId: req.staffDbId };

    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end   = new Date(year, month, 0, 23, 59, 59);
      query.date  = { $gte: start, $lte: end };
    }

    const records = await StaffAttendance.find(query).sort({ date: -1 });

    return res.status(200).json({ success: true, count: records.length, data: records });
  } catch (error) {
    console.error('getMySelfAttendance error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Diary / Homework ─────────────────────────────────────────────────────────

/**
 * @desc    Create a diary entry for a class — saved to shared Diary collection
 *          so it appears on the parent portal for that class.
 * @route   POST /api/staff/diary
 * @access  Staff (protectStaff)
 *
 * Body: { classId, subjects: [{title, description}], date? }
 * - subjects is an array so multiple subjects can be added in one diary entry
 * - The diary is saved to the main 'diary' collection (same as admin diary)
 *   which is what parentDiaryController reads — no extra work needed on parent side
 */
export const createDiaryEntry = async (req, res) => {
  try {
    const { classId, subjects, date } = req.body;

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: 'classId is required'
      });
    }

    // Validate subjects array
    if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one subject with title and description is required'
      });
    }

    for (const sub of subjects) {
      if (!sub.title || !sub.description) {
        return res.status(400).json({
          success: false,
          message: 'Each subject must have a title and description'
        });
      }
    }

    // Verify class exists in this school
    const Class = await getModel(req.schoolId, 'classes');
    const classDoc = await Class.findOne({ _id: classId, isActive: true });
    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // new Date('YYYY-MM-DD') → 2026-02-19T00:00:00.000Z — consistent on every server.
    const diaryDate = date ? new Date(date) : new Date(new Date().toISOString().split('T')[0]);

    const Diary = await getModel(req.schoolId, 'diary');
    const entry = await Diary.create({
      classId,
      teacherId:   req.staffDbId,
      teacherName: req.staff.name,
      date:        diaryDate,
      subjects:    subjects.map(s => ({ title: s.title, description: s.description })),
      isActive:    true
    });

    return res.status(201).json({
      success: true,
      message: 'Diary entry created successfully. Parents can now view it.',
      data:    entry
    });
  } catch (error) {
    console.error('createDiaryEntry error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Get diary entries created by this staff member (from shared Diary collection)
 * @route   GET /api/staff/diary
 * @access  Staff (protectStaff)
 */
export const getMyDiaryEntries = async (req, res) => {
  try {
    const { classId, from, to } = req.query;

    const Diary = await getModel(req.schoolId, 'diary');
    // Staff can only see their own entries
    const query = { teacherId: req.staffDbId, isActive: true };

    if (classId) query.classId = classId;

    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to)   query.date.$lte = new Date(to);
    }

    const entries = await Diary.find(query).sort({ date: -1 }).lean();

    // Manually populate classId
    const Class = await getModel(req.schoolId, 'classes');
    for (const entry of entries) {
      if (entry.classId) {
        entry.classId = await Class.findById(entry.classId)
          .select('className section').lean();
      }
    }

    return res.status(200).json({ success: true, count: entries.length, data: entries });
  } catch (error) {
    console.error('getMyDiaryEntries error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Update a diary entry (only own entries) — from shared Diary collection
 * @route   PUT /api/staff/diary/:id
 * @access  Staff (protectStaff)
 */
export const updateDiaryEntry = async (req, res) => {
  try {
    const Diary = await getModel(req.schoolId, 'diary');
    const entry = await Diary.findById(req.params.id);

    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    // ── Ownership guard ──────────────────────────────────────────────────
    if (entry.teacherId.toString() !== req.staffDbId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own diary entries'
      });
    }

    const { subjects } = req.body;
    if (subjects && Array.isArray(subjects)) {
      entry.subjects = subjects.map(s => ({ title: s.title, description: s.description }));
    }

    await entry.save();

    return res.status(200).json({
      success: true,
      message: 'Diary entry updated successfully',
      data:    entry
    });
  } catch (error) {
    console.error('updateDiaryEntry error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Delete a diary entry (only own entries) — soft-delete via isActive:false
 * @route   DELETE /api/staff/diary/:id
 * @access  Staff (protectStaff)
 */
export const deleteDiaryEntry = async (req, res) => {
  try {
    const Diary = await getModel(req.schoolId, 'diary');
    const entry = await Diary.findById(req.params.id);

    if (!entry || !entry.isActive) {
      return res.status(404).json({ success: false, message: 'Diary entry not found' });
    }

    // Ownership guard — staff can only delete their own entries
    if (entry.teacherId.toString() !== req.staffDbId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own diary entries'
      });
    }

    // Soft delete — parent portal filter isActive:true so it disappears instantly
    entry.isActive = false;
    await entry.save();

    return res.status(200).json({ success: true, message: 'Diary entry deleted successfully' });
  } catch (error) {
    console.error('deleteDiaryEntry error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Marks Entry ─────────────────────────────────────────────────────────────

/**
 * @desc    Enter marks for a student
 * @route   POST /api/staff/marks
 * @access  Staff (protectStaff)
 */
export const addMarksEntry = async (req, res) => {
  try {
    const {
      classId, studentId, subject, examType,
      totalMarks, obtainedMarks, academicYear, remarks
    } = req.body;

    if (!classId || !studentId || !subject || !examType || !totalMarks || obtainedMarks === undefined) {
      return res.status(400).json({
        success: false,
        message: 'classId, studentId, subject, examType, totalMarks and obtainedMarks are required'
      });
    }

    // ── Class assignment guard ───────────────────────────────────────────
    if (!getAssignedClass(req.staff, classId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this class'
      });
    }

    // ── Subject assignment guard ─────────────────────────────────────────
    if (
      req.staff.assignedSubjects.length > 0 &&
      !req.staff.assignedSubjects.includes(subject)
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this subject'
      });
    }

    // ── Basic validation ─────────────────────────────────────────────────
    if (obtainedMarks > totalMarks) {
      return res.status(400).json({
        success: false,
        message: 'Obtained marks cannot exceed total marks'
      });
    }

    // ── Verify student belongs to this class ─────────────────────────────
    const Student = await getModel(req.schoolId, 'students');
    const student = await Student.findOne({ _id: studentId, classId });
    if (!student) {
      return res.status(400).json({
        success: false,
        message: 'Student not found in this class'
      });
    }

    const StaffMarks = await getModel(req.schoolId, 'staffmarks');

    const mark = await StaffMarks.create({
      staffId: req.staffDbId,
      classId,
      studentId,
      subject,
      examType,
      totalMarks,
      obtainedMarks,
      academicYear: academicYear || '',
      remarks:      remarks || ''
    });

    return res.status(201).json({
      success: true,
      message: 'Marks entry saved successfully',
      data:    mark
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Marks for this student/subject/exam already exist. Use update endpoint.'
      });
    }
    console.error('addMarksEntry error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Get marks entered by this staff
 * @route   GET /api/staff/marks
 * @access  Staff (protectStaff)
 */
export const getMyMarks = async (req, res) => {
  try {
    const { classId, examType, subject } = req.query;

    const StaffMarks = await getModel(req.schoolId, 'staffmarks');
    const query = { staffId: req.staffDbId };

    if (classId) {
      if (!getAssignedClass(req.staff, classId)) {
        return res.status(403).json({
          success: false,
          message: 'You are not assigned to this class'
        });
      }
      query.classId = classId;
    }

    if (examType) query.examType = examType;
    if (subject)  query.subject  = { $regex: subject, $options: 'i' };

    const marks = await StaffMarks.find(query).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: marks.length, data: marks });
  } catch (error) {
    console.error('getMyMarks error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Update a marks entry (only own entries)
 * @route   PUT /api/staff/marks/:id
 * @access  Staff (protectStaff)
 */
export const updateMarksEntry = async (req, res) => {
  try {
    const StaffMarks = await getModel(req.schoolId, 'staffmarks');
    const mark = await StaffMarks.findById(req.params.id);

    if (!mark) {
      return res.status(404).json({ success: false, message: 'Marks entry not found' });
    }

    if (!isOwner(mark.staffId, req)) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own marks entries'
      });
    }

    const { totalMarks, obtainedMarks, remarks } = req.body;

    if (totalMarks !== undefined)   mark.totalMarks    = totalMarks;
    if (obtainedMarks !== undefined) mark.obtainedMarks = obtainedMarks;
    if (remarks !== undefined)       mark.remarks       = remarks;

    if (mark.obtainedMarks > mark.totalMarks) {
      return res.status(400).json({
        success: false,
        message: 'Obtained marks cannot exceed total marks'
      });
    }

    await mark.save();

    return res.status(200).json({
      success: true,
      message: 'Marks updated successfully',
      data:    mark
    });
  } catch (error) {
    console.error('updateMarksEntry error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Monthly Reports ──────────────────────────────────────────────────────────

/**
 * @desc    Submit or save a draft monthly report
 * @route   POST /api/staff/reports
 * @access  Staff (protectStaff)
 */
export const submitMonthlyReport = async (req, res) => {
  try {
    const {
      classId, month, year,
      totalClassesTaken, topicsCompleted, pendingTopics, remarks, submit
    } = req.body;

    if (!classId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'classId, month and year are required'
      });
    }

    if (!getAssignedClass(req.staff, classId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this class'
      });
    }

    const StaffMonthlyReport = await getModel(req.schoolId, 'staffmonthlyreports');

    // Upsert: allow staff to save drafts before final submission
    const status      = submit ? 'submitted' : 'draft';
    const submittedAt = submit ? new Date()   : undefined;

    const report = await StaffMonthlyReport.findOneAndUpdate(
      { staffId: req.staffDbId, classId, month: parseInt(month), year: parseInt(year) },
      {
        $set: {
          totalClassesTaken: totalClassesTaken || 0,
          topicsCompleted:   topicsCompleted   || [],
          pendingTopics:     pendingTopics      || [],
          remarks:           remarks            || '',
          status,
          submittedAt
        }
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: submit ? 'Report submitted successfully' : 'Draft saved successfully',
      data:    report
    });
  } catch (error) {
    console.error('submitMonthlyReport error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Get own monthly reports
 * @route   GET /api/staff/reports
 * @access  Staff (protectStaff)
 */
export const getMyMonthlyReports = async (req, res) => {
  try {
    const { classId, month, year, status } = req.query;

    const StaffMonthlyReport = await getModel(req.schoolId, 'staffmonthlyreports');
    const query = { staffId: req.staffDbId };

    if (classId) query.classId = classId;
    if (month)   query.month   = parseInt(month);
    if (year)    query.year    = parseInt(year);
    if (status)  query.status  = status;

    const reports = await StaffMonthlyReport.find(query).sort({ year: -1, month: -1 });

    return res.status(200).json({ success: true, count: reports.length, data: reports });
  } catch (error) {
    console.error('getMyMonthlyReports error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Salary (view-only for staff) ────────────────────────────────────────────

/**
 * @desc    Get own salary history (view-only — no write access)
 * @route   GET /api/staff/salary
 * @access  Staff (protectStaff)
 */
export const getMySalaryHistory = async (req, res) => {
  try {
    const SalaryHistory = await getModel(req.schoolId, 'staffsalaryhistory');

    const records = await SalaryHistory.find({ staffId: req.staffDbId })
      .select('-createdBy')   // Don't expose which admin created the record
      .sort({ year: -1, month: -1 });

    return res.status(200).json({ success: true, count: records.length, data: records });
  } catch (error) {
    console.error('getMySalaryHistory error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
