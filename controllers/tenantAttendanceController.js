import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { getModel } from '../models/dynamicModels.js';

/**
 * Tenant-aware Attendance Controller
 * All operations use dynamic database connections based on schoolId
 */

/**
 * @desc    Mark attendance for students in tenant database
 * @route   POST /api/admin/attendance
 * @access  Private (Admin only)
 */
export const markAttendance = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { classId, date, attendance } = req.body;
    // attendance format: [{ studentId, status, period, remarks }]

    if (!Array.isArray(attendance) || attendance.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Attendance records array is required'
      });
    }

    // Get models from tenant database
    const Attendance = await getModel(req.schoolId, 'attendance');
    const Student = await getModel(req.schoolId, 'students');
    const Class = await getModel(req.schoolId, 'classes');

    const results = {
      success: [],
      failed: []
    };

    // Process each attendance record
    for (const record of attendance) {
      try {
        const { studentId, status, remarks, period } = record;

        // Verify student exists
        const student = await Student.findById(studentId);
        if (!student) {
          results.failed.push({
            studentId,
            reason: 'Student not found'
          });
          continue;
        }

        // Verify class exists
        const classDoc = await Class.findById(classId);
        if (!classDoc) {
          results.failed.push({
            studentId,
            reason: 'Class not found'
          });
          continue;
        }

        // Check if attendance already exists for this date (range to avoid timezone mismatch)
        const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
        const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);
        const existingAttendance = await Attendance.findOne({
          studentId,
          date: { $gte: dayStart, $lte: dayEnd }
        });

        if (existingAttendance) {
          // Update existing attendance
          existingAttendance.status = status;
          existingAttendance.remarks = remarks;
          existingAttendance.period = period || 'Full Day';
          existingAttendance.markedBy = req.userId;
          await existingAttendance.save();

          results.success.push({
            studentId,
            action: 'updated',
            attendanceId: existingAttendance._id
          });
        } else {
          // Create new attendance record
          const savedDate = new Date(date);
          const attendance = await Attendance.create({
            studentId,
            classId,
            date: savedDate,
            status,
            remarks,
            period: period || 'Full Day',
            markedBy: req.userId
          });

          results.success.push({
            studentId,
            action: 'created',
            attendanceId: attendance._id
          });
        }

      } catch (error) {
        results.failed.push({
          studentId: record.studentId,
          reason: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Attendance marked: ${results.success.length} successful, ${results.failed.length} failed`,
      data: results
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get attendance for a specific date/class from tenant database
 * @route   GET /api/admin/attendance
 * @access  Private (Admin only)
 */
export const getAttendance = async (req, res, next) => {
  try {
    const { classId, date, startDate, endDate, studentId } = req.query;

    const Attendance = await getModel(req.schoolId, 'attendance');

    // Build filter
    const filter = {};

    if (classId) {
      filter.classId = classId;
    }

    if (studentId) {
      filter.studentId = studentId;
    }

    if (date) {
      // Single date
      const targetDate = new Date(date);
      filter.date = {
        $gte: new Date(targetDate.setHours(0, 0, 0, 0)),
        $lte: new Date(targetDate.setHours(23, 59, 59, 999))
      };
    } else if (startDate && endDate) {
      // Date range
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const attendance = await Attendance.find(filter)
      .populate('studentId', 'fullName rollNumber')
      .populate('classId', 'className section')
      .populate('markedBy', 'name')
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get attendance statistics for dashboard graph (daily breakdown)
 * @route   GET /api/admin/attendance/stats
 * @access  Private (Admin only)
 */
export const getAttendanceStats = async (req, res, next) => {
  try {
    const { studentId, classId, startDate, endDate } = req.query;

    const Attendance = await getModel(req.schoolId, 'attendance');

    // Build filter
    const filter = {};

    if (studentId) {
      filter.studentId = studentId;
    }

    if (classId) {
      filter.classId = classId;
    }

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get attendance records
    const records = await Attendance.find(filter);

    // If startDate and endDate provided, return daily breakdown for graph
    if (startDate && endDate) {
      // Group by date
      const dailyStats = {};

      records.forEach(record => {
        const dateStr = record.date.toISOString().split('T')[0];

        if (!dailyStats[dateStr]) {
          dailyStats[dateStr] = {
            date: dateStr,
            present: 0,
            absent: 0,
            late: 0,
            halfDay: 0,
            excused: 0
          };
        }

        const status = record.status.toLowerCase().replace(' ', '');
        if (status === 'present') dailyStats[dateStr].present++;
        else if (status === 'absent') dailyStats[dateStr].absent++;
        else if (status === 'late') dailyStats[dateStr].late++;
        else if (status === 'halfday') dailyStats[dateStr].halfDay++;
        else if (status === 'excused') dailyStats[dateStr].excused++;
      });

      // Convert to array
      const dailyStatsArray = Object.values(dailyStats);

      return res.status(200).json({
        success: true,
        data: dailyStatsArray
      });
    }

    // Calculate overall statistics if no date range
    const stats = {
      total: records.length,
      present: records.filter(r => r.status === 'Present').length,
      absent: records.filter(r => r.status === 'Absent').length,
      late: records.filter(r => r.status === 'Late').length,
      halfDay: records.filter(r => r.status === 'Half Day').length,
      excused: records.filter(r => r.status === 'Excused').length
    };

    stats.attendancePercentage = stats.total > 0
      ? ((stats.present + stats.late + stats.halfDay * 0.5) / stats.total * 100).toFixed(2)
      : 0;

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get attendance for a specific class
 * @route   GET /api/admin/attendance/class/:classId
 * @access  Private (Admin only)
 */
export const getClassAttendance = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { date, startDate, endDate } = req.query;

    const Attendance = await getModel(req.schoolId, 'attendance');

    // Convert classId string to ObjectId for MongoDB query
    const filter = {
      classId: new mongoose.Types.ObjectId(classId)
    };

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      filter.date = {
        $gte: startOfDay,
        $lte: endOfDay
      };
    } else if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Use aggregation to sort by student rollNumber (ascending order)
    const attendance = await Attendance.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'students',
          localField: 'studentId',
          foreignField: '_id',
          as: 'studentId'
        }
      },
      { $unwind: '$studentId' },
      {
        $lookup: {
          from: 'classes',
          localField: 'classId',
          foreignField: '_id',
          as: 'classId'
        }
      },
      { $unwind: '$classId' },
      {
        $project: {
          _id: 1,
          status: 1,
          date: 1,
          remarks: 1,
          period: 1,
          'studentId._id': 1,
          'studentId.fullName': 1,
          'studentId.rollNumber': 1,
          'classId._id': 1,
          'classId.className': 1,
          'classId.section': 1
        }
      },
      { $sort: { 'studentId.rollNumber': 1 } }
    ]);

    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get attendance for a specific student
 * @route   GET /api/admin/attendance/student/:studentId
 * @access  Private (Admin only)
 */
export const getStudentAttendance = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    const Attendance = await getModel(req.schoolId, 'attendance');

    const filter = { studentId };

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const attendance = await Attendance.find(filter)
      .populate('classId', 'className section')
      .sort({ date: -1 });

    // Calculate stats
    const total = attendance.length;
    const present = attendance.filter(a => a.status === 'Present').length;
    const absent = attendance.filter(a => a.status === 'Absent').length;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      data: {
        attendance,
        stats: {
          total,
          present,
          absent,
          percentage
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update attendance record
 * @route   PUT /api/admin/attendance/:id
 * @access  Private (Admin only)
 */
export const updateAttendance = async (req, res, next) => {
  try {
    const Attendance = await getModel(req.schoolId, 'attendance');

    const attendance = await Attendance.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('studentId', 'fullName rollNumber')
      .populate('classId', 'className section');

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Attendance updated successfully',
      data: attendance
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete attendance record from tenant database
 * @route   DELETE /api/admin/attendance/:id
 * @access  Private (Admin only)
 */
export const deleteAttendance = async (req, res, next) => {
  try {
    const Attendance = await getModel(req.schoolId, 'attendance');

    const attendance = await Attendance.findByIdAndDelete(req.params.id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Attendance record deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

export default {
  markAttendance,
  getAttendance,
  getAttendanceStats,
  getClassAttendance,
  getStudentAttendance,
  updateAttendance,
  deleteAttendance
};
