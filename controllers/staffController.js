/**
 * Staff Controller — Admin-side operations
 *
 * SAFE EXTENSION:
 *  - All routes are under /api/admin/staff/*
 *  - Protected by existing `protect` middleware (admin JWT)
 *  - Uses only new collections (staffs, staffsalaryhistory, staffattendance)
 *  - References existing Class collection READ-ONLY (never writes to it)
 *  - Does NOT modify any existing controller, model, or middleware
 */

import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import { getModel } from '../models/dynamicModels.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Auto-generate a unique Staff ID in format STF-YYYY-NNNN
 * Reads existing staffs to determine the next sequence number.
 */
const generateStaffId = async (Staff, year) => {
  const prefix = `STF-${year}-`;
  // Find the highest existing sequence for this year
  const last = await Staff.findOne(
    { staffId: { $regex: `^${prefix}` } },
    { staffId: 1 },
    { sort: { staffId: -1 } }
  );

  let seq = 1;
  if (last) {
    const parts = last.staffId.split('-');
    seq = parseInt(parts[2], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * @desc    Create a new staff member
 * @route   POST /api/admin/staff
 * @access  Admin only
 */
export const createStaff = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      name,
      cnic,
      contact,
      qualification,
      joiningDate,
      status,
      role,
      baseSalary,
      password
    } = req.body;

    const Staff = await getModel(req.schoolId, 'staffs');

    // ── Duplicate CNIC check within this tenant ──────────────────────────
    const existing = await Staff.findOne({ cnic });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A staff member with this CNIC already exists'
      });
    }

    // ── Generate staffId ─────────────────────────────────────────────────
    const year = new Date().getFullYear();
    const staffId = await generateStaffId(Staff, year);

    // ── Hash password ─────────────────────────────────────────────────────
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const staff = await Staff.create({
      staffId,
      name,
      cnic,
      contact,
      qualification,
      joiningDate: joiningDate || Date.now(),
      status: status || 'active',
      role: role || 'teacher',
      baseSalary: baseSalary || 0,
      password: passwordHash,
      assignedClasses: [],
      assignedSubjects: []
    });

    // Never return password in response
    const staffObj = staff.toObject();
    delete staffObj.password;

    return res.status(201).json({
      success: true,
      message: 'Staff member created successfully',
      data: staffObj
    });
  } catch (error) {
    console.error('createStaff error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while creating staff',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get all staff members (paginated)
 * @route   GET /api/admin/staff
 * @access  Admin only
 */
export const getAllStaff = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, role, search } = req.query;

    const Staff = await getModel(req.schoolId, 'staffs');

    const query = {};
    if (status)  query.status = status;
    if (role)    query.role   = role;
    if (search) {
      query.$or = [
        { name:    { $regex: search, $options: 'i' } },
        { staffId: { $regex: search, $options: 'i' } },
        { cnic:    { $regex: search, $options: 'i' } }
      ];
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Staff.countDocuments(query);
    const staff = await Staff.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Attach latest salary info for each staff member
    const SalaryHistory = await getModel(req.schoolId, 'staffsalaryhistory');
    const staffWithSalary = await Promise.all(staff.map(async (s) => {
      const latestSalary = await SalaryHistory.findOne({ staffId: s._id })
        .sort({ year: -1, month: -1 })
        .select('_id status');
      const obj = s.toObject();
      obj.latestSalaryStatus = latestSalary?.status || null;
      obj.latestSalaryId     = latestSalary?._id || null;
      return obj;
    }));

    return res.status(200).json({
      success: true,
      data: staffWithSalary,
      pagination: {
        total,
        page:       parseInt(page),
        limit:      parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('getAllStaff error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching staff',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get a single staff member by DB _id
 * @route   GET /api/admin/staff/:id
 * @access  Admin only
 */
export const getStaffById = async (req, res) => {
  try {
    const Staff = await getModel(req.schoolId, 'staffs');
    const staff = await Staff.findById(req.params.id).select('-password');

    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    return res.status(200).json({ success: true, data: staff });
  } catch (error) {
    console.error('getStaffById error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update staff details (admin can update everything except staffId)
 * @route   PUT /api/admin/staff/:id
 * @access  Admin only
 */
export const updateStaff = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Prevent client from changing staffId or password through this endpoint
    const { staffId: _staffId, password: _pw, ...updateData } = req.body;

    const Staff = await getModel(req.schoolId, 'staffs');
    const staff = await Staff.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Staff updated successfully',
      data: staff
    });
  } catch (error) {
    console.error('updateStaff error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Assign classes and subjects to a staff member
 * @route   PUT /api/admin/staff/:id/assign
 * @access  Admin only
 *
 * Body: { classIds: [ObjectId], subjects: [String] }
 * Classes are verified to exist in the tenant's Class collection before assignment.
 */
export const assignClassesAndSubjects = async (req, res) => {
  try {
    const { classIds = [], subjects = [] } = req.body;

    const Staff = await getModel(req.schoolId, 'staffs');
    const Class = await getModel(req.schoolId, 'classes');

    // ── Verify each classId exists in this tenant ─────────────────────────
    const classObjects = await Class.find({ _id: { $in: classIds } });
    if (classObjects.length !== classIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more classIds are invalid'
      });
    }

    const assignedClasses = classObjects.map(c => ({
      classId:   c._id,
      className: c.className,
      section:   c.section || ''
    }));

    const staff = await Staff.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          assignedClasses,
          assignedSubjects: subjects
        }
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Classes and subjects assigned successfully',
      data: staff
    });
  } catch (error) {
    console.error('assignClassesAndSubjects error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Reset staff password (admin action)
 * @route   PUT /api/admin/staff/:id/reset-password
 * @access  Admin only
 */
export const resetStaffPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const Staff = await getModel(req.schoolId, 'staffs');
    const staff = await Staff.findByIdAndUpdate(
      req.params.id,
      { $set: { password: passwordHash } },
      { new: true }
    ).select('-password');

    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('resetStaffPassword error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Deactivate / activate staff
 * @route   PUT /api/admin/staff/:id/toggle-status
 * @access  Admin only
 */
export const toggleStaffStatus = async (req, res) => {
  try {
    const Staff = await getModel(req.schoolId, 'staffs');
    const staff = await Staff.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    staff.status   = staff.status === 'active' ? 'inactive' : 'active';
    staff.isActive = staff.status === 'active';
    await staff.save();

    return res.status(200).json({
      success: true,
      message: `Staff ${staff.status === 'active' ? 'activated' : 'deactivated'} successfully`,
      data: { staffId: staff.staffId, status: staff.status }
    });
  } catch (error) {
    console.error('toggleStaffStatus error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ─── Salary Management (Admin) ───────────────────────────────────────────────

/**
 * @desc    Add monthly salary record for a staff member
 * @route   POST /api/admin/staff/:id/salary
 * @access  Admin only
 */
export const addSalaryRecord = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { month, year, basicSalary, allowances = 0, deductions = 0, amountPaid = 0, remarks, status } = req.body;

    const Staff = await getModel(req.schoolId, 'staffs');
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    const SalaryHistory = await getModel(req.schoolId, 'staffsalaryhistory');

    // Prevent duplicate record for same month/year
    const existing = await SalaryHistory.findOne({
      staffId: staff._id,
      month,
      year
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Salary record for this month/year already exists'
      });
    }

    const netSalary = basicSalary + allowances - deductions;
    const paid      = Number(amountPaid) || 0;

    // Auto-calculate status from amountPaid
    let autoStatus = 'pending';
    if (paid >= netSalary && netSalary > 0) autoStatus = 'paid';
    else if (paid > 0) autoStatus = 'partial';
    // Allow frontend to override if explicitly passed (but we prefer auto)
    const finalStatus = status || autoStatus;

    const record = await SalaryHistory.create({
      staffId:    staff._id,
      month,
      year,
      basicSalary,
      allowances,
      deductions,
      netSalary,
      amountPaid:  paid,
      status:      finalStatus,
      paidAt:      finalStatus === 'paid' ? new Date() : undefined,
      remarks,
      createdBy:   req.admin._id
    });

    return res.status(201).json({
      success: true,
      message: 'Salary record added successfully',
      data: record
    });
  } catch (error) {
    console.error('addSalaryRecord error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Toggle salary payment status (paid ↔ pending)
 * @route   PUT /api/admin/staff/:id/salary/:salaryId/toggle-status
 * @access  Admin only
 */
export const toggleSalaryStatus = async (req, res) => {
  try {
    const SalaryHistory = await getModel(req.schoolId, 'staffsalaryhistory');
    const record = await SalaryHistory.findById(req.params.salaryId);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Salary record not found' });
    }

    // Verify this record belongs to the specified staff member
    if (record.staffId.toString() !== req.params.id) {
      return res.status(400).json({ success: false, message: 'Salary record does not belong to this staff' });
    }

    // Toggle status
    if (record.status === 'paid') {
      record.status = 'pending';
      record.paidAt = undefined;
    } else {
      record.status = 'paid';
      record.paidAt = new Date();
    }

    await record.save();

    return res.status(200).json({
      success: true,
      message: `Salary status updated to ${record.status}`,
      data: record
    });
  } catch (error) {
    console.error('toggleSalaryStatus error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Delete a salary record permanently
 * @route   DELETE /api/admin/staff/:id/salary/:salaryId
 * @access  Admin only
 */
export const deleteSalaryRecord = async (req, res) => {
  try {
    const SalaryHistory = await getModel(req.schoolId, 'staffsalaryhistory');
    const record = await SalaryHistory.findById(req.params.salaryId);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Salary record not found' });
    }

    if (record.staffId.toString() !== req.params.id) {
      return res.status(400).json({ success: false, message: 'Salary record does not belong to this staff' });
    }

    await SalaryHistory.findByIdAndDelete(req.params.salaryId);

    return res.status(200).json({ success: true, message: 'Salary record deleted successfully' });
  } catch (error) {
    console.error('deleteSalaryRecord error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update an existing salary record (amount, allowances, deductions, status, remarks)
 * @route   PUT /api/admin/staff/:id/salary/:salaryId
 * @access  Admin only
 */
export const updateSalaryRecord = async (req, res) => {
  try {
    const { basicSalary, allowances, deductions, amountPaid, status, remarks } = req.body;

    const SalaryHistory = await getModel(req.schoolId, 'staffsalaryhistory');
    const record = await SalaryHistory.findById(req.params.salaryId);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Salary record not found' });
    }

    // Verify this record belongs to the specified staff member
    if (record.staffId.toString() !== req.params.id) {
      return res.status(400).json({ success: false, message: 'Salary record does not belong to this staff' });
    }

    // Update fields if provided
    if (basicSalary !== undefined) record.basicSalary = basicSalary;
    if (allowances  !== undefined) record.allowances  = allowances;
    if (deductions  !== undefined) record.deductions  = deductions;
    if (remarks     !== undefined) record.remarks     = remarks;
    if (amountPaid  !== undefined) record.amountPaid  = Number(amountPaid) || 0;

    // Recalculate netSalary
    record.netSalary = record.basicSalary + record.allowances - record.deductions;

    // Auto-calculate status from amountPaid (override manual status)
    const paid = record.amountPaid || 0;
    const net  = record.netSalary  || 0;
    let autoStatus = 'pending';
    if (paid >= net && net > 0) autoStatus = 'paid';
    else if (paid > 0) autoStatus = 'partial';
    // Use auto status (or manual override if amountPaid not sent)
    const finalStatus = (amountPaid !== undefined) ? autoStatus : (status || record.status);
    if (finalStatus !== record.status) {
      record.status = finalStatus;
      record.paidAt = finalStatus === 'paid' ? new Date() : undefined;
    }

    await record.save();

    return res.status(200).json({
      success: true,
      message: 'Salary record updated successfully',
      data: record
    });
  } catch (error) {
    console.error('updateSalaryRecord error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get salary history for a staff member (admin view — full details)
 * @route   GET /api/admin/staff/:id/salary
 * @access  Admin only
 */
export const getStaffSalaryHistory = async (req, res) => {
  try {
    const Staff = await getModel(req.schoolId, 'staffs');
    const staff = await Staff.findById(req.params.id).select('-password');
    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    const SalaryHistory = await getModel(req.schoolId, 'staffsalaryhistory');
    const history = await SalaryHistory.find({ staffId: staff._id })
      .sort({ year: -1, month: -1 });

    return res.status(200).json({
      success: true,
      data: {
        staff:  { name: staff.name, staffId: staff.staffId },
        salary: history
      }
    });
  } catch (error) {
    console.error('getStaffSalaryHistory error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ─── Staff Self-Attendance Verification (Admin) ───────────────────────────────

/**
 * @desc    Get all pending staff self-attendance records
 * @route   GET /api/admin/staff/attendance/pending
 * @access  Admin only
 */
export const getPendingAttendance = async (req, res) => {
  try {
    const StaffAttendance = await getModel(req.schoolId, 'staffattendance');
    const Staff           = await getModel(req.schoolId, 'staffs');

    const records = await StaffAttendance.find({ verificationStatus: 'pending' })
      .sort({ date: -1 })
      .populate({ path: 'staffId', model: Staff, select: 'name staffId role' });

    return res.status(200).json({
      success: true,
      count: records.length,
      data:  records
    });
  } catch (error) {
    console.error('getPendingAttendance error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Verify or reject a staff self-attendance record
 * @route   PUT /api/admin/staff/attendance/:attendanceId/verify
 * @access  Admin only
 *
 * Body: { action: 'verified' | 'rejected', remarks?: String }
 */
export const verifyStaffAttendance = async (req, res) => {
  try {
    const { action, remarks } = req.body;

    if (!['verified', 'rejected'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be 'verified' or 'rejected'"
      });
    }

    const StaffAttendance = await getModel(req.schoolId, 'staffattendance');
    const record = await StaffAttendance.findById(req.params.attendanceId);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    if (record.verificationStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'This record has already been processed'
      });
    }

    record.verificationStatus = action;
    record.verifiedBy         = req.admin._id;
    record.verifiedAt         = new Date();
    if (remarks) record.remarks = remarks;

    await record.save();

    return res.status(200).json({
      success: true,
      message: `Attendance ${action} successfully`,
      data:    record
    });
  } catch (error) {
    console.error('verifyStaffAttendance error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get all staff marks (admin overview)
 * @route   GET /api/admin/staff/marks
 * @access  Admin only
 */
export const getAllStaffMarks = async (req, res) => {
  try {
    const { classId, examType, subject } = req.query;

    const StaffMarks = await getModel(req.schoolId, 'staffmarks');
    const query = {};
    if (classId)  query.classId  = classId;
    if (examType) query.examType = examType;
    if (subject)  query.subject  = { $regex: subject, $options: 'i' };

    const marks = await StaffMarks.find(query).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: marks.length, data: marks });
  } catch (error) {
    console.error('getAllStaffMarks error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get all monthly reports submitted by staff (admin overview)
 * @route   GET /api/admin/staff/reports
 * @access  Admin only
 */
export const getAllStaffMonthlyReports = async (req, res) => {
  try {
    const { month, year, status } = req.query;

    const StaffMonthlyReport = await getModel(req.schoolId, 'staffmonthlyreports');
    const query = {};
    if (month)  query.month  = parseInt(month);
    if (year)   query.year   = parseInt(year);
    if (status) query.status = status;

    const reports = await StaffMonthlyReport.find(query).sort({ year: -1, month: -1 });

    return res.status(200).json({ success: true, count: reports.length, data: reports });
  } catch (error) {
    console.error('getAllStaffMonthlyReports error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Delete a staff member permanently
 * @route   DELETE /api/admin/staff/:id
 * @access  Admin only
 */
export const deleteStaff = async (req, res) => {
  try {
    const Staff = await getModel(req.schoolId, 'staffs');
    const staff = await Staff.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff member not found' });
    }

    await Staff.findByIdAndDelete(req.params.id);

    return res.status(200).json({ success: true, message: 'Staff member deleted successfully' });
  } catch (error) {
    console.error('deleteStaff error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
