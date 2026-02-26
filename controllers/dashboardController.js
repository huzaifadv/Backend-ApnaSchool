import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Notice from '../models/Notice.js';
import Attendance from '../models/Attendance.js';
import School from '../models/School.js';

// @desc    Get dashboard stats
// @route   GET /api/admin/dashboard/stats
// @access  Private (Admin only)
export const getDashboardStats = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;

    // Get total students count
    const totalStudents = await Student.countDocuments({
      schoolId,
      isActive: true
    });

    // Get total classes count
    const totalClasses = await Class.countDocuments({
      schoolId,
      isActive: true
    });

    // Get active notices count (notices that are currently valid)
    const today = new Date();
    const totalNotices = await Notice.countDocuments({
      schoolId,
      isActive: true,
      $or: [
        { validUntil: { $gte: today } },
        { validUntil: null }
      ]
    });

    // Get today's attendance - count students marked present today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayAttendance = await Attendance.find({
      schoolId,
      date: { $gte: todayStart, $lte: todayEnd },
      status: 'present'
    });

    const presentToday = todayAttendance.length;

    // Get school plan information
    const school = await School.findById(schoolId);
    const planInfo = school ? {
      selectedPlan: school.selectedPlan,
      planType: school.planType,
      studentLimit: school.studentLimit,
      remainingDays: school.remainingDays,
      planStartDate: school.planType === 'trial' ? school.trial?.startDate : school.planStartDate,
      planEndDate: school.planType === 'trial' ? school.trial?.endDate : school.planEndDate,
      isPlanExpired: school.isPlanExpired
    } : null;

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        totalClasses,
        totalNotices,
        presentToday,
        planInfo
      }
    });

  } catch (error) {
    next(error);
  }
};
