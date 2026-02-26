import Report from '../models/Report.js';
import Notice from '../models/Notice.js';
import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';

// Helper function to validate studentId matches token
const validateStudentAccess = (tokenStudentId, requestedStudentId) => {
  return tokenStudentId.toString() === requestedStudentId.toString();
};

// @desc    Get student reports
// @route   GET /api/student/:id/reports
// @access  Private (Parent only)
export const getStudentReports = async (req, res, next) => {
  try {
    const { id: studentId } = req.params;

    // Validate that requested studentId matches token-scoped studentId
    if (!validateStudentAccess(req.studentId, studentId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own student\'s data'
      });
    }

    // Verify student belongs to the school
    const student = await Student.findOne({
      _id: studentId,
      schoolId: req.schoolId,
      isActive: true
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get query parameters for filtering
    const { academicYear, examType, isPublished } = req.query;

    // Build filter
    const filter = {
      studentId,
      schoolId: req.schoolId
    };

    if (academicYear) {
      filter.academicYear = academicYear;
    }

    if (examType) {
      filter.examType = examType;
    }

    // Parents can only see published reports
    if (isPublished !== undefined) {
      filter.isPublished = isPublished === 'true';
    } else {
      filter.isPublished = true; // Default to only published
    }

    // Get reports
    const reports = await Report.find(filter)
      .populate('classId', 'className section grade')
      .sort({ publishedDate: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get student notices
// @route   GET /api/student/:id/notices
// @access  Private (Parent only)
export const getStudentNotices = async (req, res, next) => {
  try {
    const { id: studentId } = req.params;

    // Validate that requested studentId matches token-scoped studentId
    if (!validateStudentAccess(req.studentId, studentId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own student\'s data'
      });
    }

    // Verify student belongs to the school
    const student = await Student.findOne({
      _id: studentId,
      schoolId: req.schoolId,
      isActive: true
    }).populate('classId');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get query parameters for filtering
    const { category, priority } = req.query;

    // Build filter for notices
    const filter = {
      schoolId: req.schoolId,
      isActive: true,
      validFrom: { $lte: new Date() },
      $or: [
        { validUntil: { $gte: new Date() } },
        { validUntil: null }
      ],
      $and: [
        {
          $or: [
            { targetAudience: 'All' },
            { targetAudience: 'Students' },
            { targetAudience: 'Parents' }
          ]
        },
        {
          $or: [
            { targetClasses: { $size: 0 } },
            { targetClasses: student.classId._id }
          ]
        }
      ]
    };

    if (category) {
      filter.category = category;
    }

    if (priority) {
      filter.priority = priority;
    }

    // Get notices
    const notices = await Notice.find(filter)
      .populate('postedBy', 'name role')
      .populate('targetClasses', 'className section grade')
      .sort({ isPinned: -1, validFrom: -1 });

    res.status(200).json({
      success: true,
      count: notices.length,
      data: notices
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get student attendance
// @route   GET /api/student/:id/attendance
// @access  Private (Parent only)
export const getStudentAttendance = async (req, res, next) => {
  try {
    const { id: studentId } = req.params;

    // Validate that requested studentId matches token-scoped studentId
    if (!validateStudentAccess(req.studentId, studentId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own student\'s data'
      });
    }

    // Verify student belongs to the school
    const student = await Student.findOne({
      _id: studentId,
      schoolId: req.schoolId,
      isActive: true
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get query parameters for filtering
    const { startDate, endDate, status } = req.query;

    // Build filter
    const filter = {
      studentId,
      schoolId: req.schoolId
    };

    // Date range filter
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.date.$lte = new Date(endDate);
      }
    }

    if (status) {
      filter.status = status;
    }

    // Get attendance records
    const attendance = await Attendance.find(filter)
      .populate('classId', 'className section grade')
      .sort({ date: -1 });

    // Calculate statistics
    const totalDays = attendance.length;
    const presentDays = attendance.filter(a => a.status === 'Present').length;
    const absentDays = attendance.filter(a => a.status === 'Absent').length;
    const lateDays = attendance.filter(a => a.status === 'Late').length;
    const halfDays = attendance.filter(a => a.status === 'Half Day').length;
    const excusedDays = attendance.filter(a => a.status === 'Excused').length;

    const attendancePercentage = totalDays > 0
      ? ((presentDays + (halfDays * 0.5)) / totalDays * 100).toFixed(2)
      : 0;

    res.status(200).json({
      success: true,
      count: attendance.length,
      statistics: {
        totalDays,
        presentDays,
        absentDays,
        lateDays,
        halfDays,
        excusedDays,
        attendancePercentage: parseFloat(attendancePercentage)
      },
      data: attendance
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get student diary/homework (placeholder - model not yet created)
// @route   GET /api/student/:id/diary
// @access  Private (Parent only)
export const getStudentDiary = async (req, res, next) => {
  try {
    const { id: studentId } = req.params;

    // Validate that requested studentId matches token-scoped studentId
    if (!validateStudentAccess(req.studentId, studentId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own student\'s data'
      });
    }

    // Verify student belongs to the school
    const student = await Student.findOne({
      _id: studentId,
      schoolId: req.schoolId,
      isActive: true
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Placeholder response - implement when Diary/Homework model is created
    res.status(200).json({
      success: true,
      message: 'Diary/Homework feature coming soon',
      count: 0,
      data: []
    });

  } catch (error) {
    next(error);
  }
};
