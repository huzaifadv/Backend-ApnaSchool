import { validationResult } from 'express-validator';
import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';

// @desc    Mark attendance for multiple students (bulk)
// @route   POST /api/attendance/mark
// @access  Private (Admin only)
export const markAttendance = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { classId, date, attendance } = req.body;

    const classDoc = await Class.findOne({ _id: classId, schoolId: req.schoolId });
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found or does not belong to your school' });

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const studentIds = attendance.map(a => a.studentId);
    const students = await Student.find({ _id: { $in: studentIds }, classId, schoolId: req.schoolId, isActive: true });

    if (students.length !== studentIds.length) {
      return res.status(400).json({ success: false, message: 'One or more students do not belong to this class or school' });
    }

    const attendanceRecords = [];
    const attendanceErrors = [];

    for (const record of attendance) {
      try {
        const existingAttendance = await Attendance.findOne({ schoolId: req.schoolId, studentId: record.studentId, date: attendanceDate });

        if (existingAttendance) {
          existingAttendance.status = record.status;
          existingAttendance.remarks = record.remarks || '';
          existingAttendance.period = record.period || 'Full Day';
          existingAttendance.markedBy = req.admin._id;
          await existingAttendance.save();
          attendanceRecords.push(existingAttendance);
        } else {
          const newAttendance = await Attendance.create({
            schoolId: req.schoolId,
            classId,
            studentId: record.studentId,
            date: attendanceDate,
            status: record.status,
            remarks: record.remarks || '',
            period: record.period || 'Full Day',
            markedBy: req.admin._id
          });
          attendanceRecords.push(newAttendance);
        }
      } catch (error) {
        attendanceErrors.push({ studentId: record.studentId, error: error.message });
      }
    }

    const populatedRecords = await Attendance.find({ _id: { $in: attendanceRecords.map(r => r._id) } })
      .populate('studentId', 'firstName lastName rollNumber')
      .populate('classId', 'className section grade');

    res.status(201).json({
      success: true,
      message: `Attendance marked for ${attendanceRecords.length} students`,
      data: { successful: populatedRecords, failed: attendanceErrors },
      summary: { total: attendance.length, successful: attendanceRecords.length, failed: attendanceErrors.length }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get attendance for a class
// @route   GET /api/attendance/class/:classId
// @access  Private (Admin only)
export const getClassAttendance = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { date, startDate, endDate } = req.query;

    const classDoc = await Class.findOne({ _id: classId, schoolId: req.schoolId });
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found or does not belong to your school' });

    const filter = { schoolId: req.schoolId, classId };
    if (date) {
      const targetDate = new Date(date); targetDate.setHours(0, 0, 0, 0); filter.date = targetDate;
    } else if (startDate || endDate) {
      filter.date = {};
      if (startDate) { const start = new Date(startDate); start.setHours(0, 0, 0, 0); filter.date.$gte = start; }
      if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); filter.date.$lte = end; }
    }

    const attendance = await Attendance.find(filter)
      .populate('studentId', 'firstName lastName rollNumber')
      .populate('classId', 'className section grade')
      .populate('markedBy', 'name email')
      .sort({ date: -1, 'studentId.rollNumber': 1 });

    res.status(200).json({ success: true, count: attendance.length, data: attendance });
  } catch (error) { next(error); }
};

// @desc    Get attendance for a student
// @route   GET /api/attendance/student/:studentId
// @access  Private (Admin only)
export const getStudentAttendance = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate, status } = req.query;

    const student = await Student.findOne({ _id: studentId, schoolId: req.schoolId });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found or does not belong to your school' });

    const filter = { schoolId: req.schoolId, studentId };
    if (startDate || endDate) { filter.date = {}; if (startDate) { const start = new Date(startDate); start.setHours(0,0,0,0); filter.date.$gte = start; } if (endDate) { const end = new Date(endDate); end.setHours(23,59,59,999); filter.date.$lte = end; } }
    if (status) filter.status = status;

    const attendance = await Attendance.find(filter)
      .populate('classId', 'className section grade')
      .populate('markedBy', 'name email')
      .sort({ date: -1 });

    const totalDays = attendance.length;
    const presentDays = attendance.filter(a => a.status === 'Present').length;
    const absentDays = attendance.filter(a => a.status === 'Absent').length;
    const lateDays = attendance.filter(a => a.status === 'Late').length;
    const halfDays = attendance.filter(a => a.status === 'Half Day').length;
    const excusedDays = attendance.filter(a => a.status === 'Excused').length;
    const attendancePercentage = totalDays > 0 ? ((presentDays + (halfDays*0.5))/totalDays*100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      count: attendance.length,
      statistics: { totalDays, presentDays, absentDays, lateDays, halfDays, excusedDays, attendancePercentage: parseFloat(attendancePercentage) },
      data: attendance
    });
  } catch (error) { next(error); }
};

// @desc    Update attendance record
// @route   PUT /api/attendance/:id
// @access  Private (Admin only)
export const updateAttendance = async (req, res, next) => {
  try {
    const attendance = await Attendance.findOne({ _id: req.params.id, schoolId: req.schoolId });
    if (!attendance) return res.status(404).json({ success: false, message: 'Attendance record not found' });

    delete req.body.schoolId;
    delete req.body.studentId;
    delete req.body.classId;
    delete req.body.date;

    req.body.markedBy = req.admin._id;

    const updatedAttendance = await Attendance.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('studentId', 'firstName lastName rollNumber')
      .populate('classId', 'className section grade')
      .populate('markedBy', 'name email');

    res.status(200).json({ success: true, message: 'Attendance updated successfully', data: updatedAttendance });
  } catch (error) { next(error); }
};

// @desc    Delete attendance record
// @route   DELETE /api/attendance/:id
// @access  Private (Admin only)
export const deleteAttendance = async (req, res, next) => {
  try {
    const attendance = await Attendance.findOneAndDelete({ _id: req.params.id, schoolId: req.schoolId });
    if (!attendance) return res.status(404).json({ success: false, message: 'Attendance record not found' });
    res.status(200).json({ success: true, message: 'Attendance record deleted successfully' });
  } catch (error) { next(error); }
};
