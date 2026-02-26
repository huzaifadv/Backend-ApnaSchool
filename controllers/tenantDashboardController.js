import { getModel } from '../models/dynamicModels.js';
import School from '../models/School.js';

/**
 * Tenant-aware Dashboard Controller
 */

export const getDashboardStats = async (req, res, next) => {
  try {
    // Get models from tenant database
    const Student = await getModel(req.schoolId, 'students');
    const Class = await getModel(req.schoolId, 'classes');
    const Notice = await getModel(req.schoolId, 'notices');
    const Attendance = await getModel(req.schoolId, 'attendance');

    // Get total students count
    const totalStudents = await Student.countDocuments({ isActive: true });

    // Get total classes count
    const totalClasses = await Class.countDocuments({ isActive: true });

    // Get active notices count
    const today = new Date();
    const totalNotices = await Notice.countDocuments({
      isActive: true,
      $or: [
        { expiryDate: { $gte: today } },
        { expiryDate: null }
      ]
    });

    // Get today's attendance
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const presentToday = await Attendance.countDocuments({
      date: { $gte: todayStart, $lte: todayEnd },
      status: 'Present'
    });

    // Get school plan information from main database
    const school = await School.findById(req.schoolId);
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

export const getRecentActivity = async (req, res, next) => {
  try {
    const Notice = await getModel(req.schoolId, 'notices');
    const Student = await getModel(req.schoolId, 'students');

    // Get recent notices
    const recentNotices = await Notice.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('createdBy', 'name')
      .populate('classId', 'className section');

    // Get recently added students
    const recentStudents = await Student.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('firstName lastName rollNumber classId')
      .populate('classId', 'className section');

    res.status(200).json({
      success: true,
      data: {
        recentNotices,
        recentStudents
      }
    });

  } catch (error) {
    next(error);
  }
};

export default {
  getDashboardStats,
  getRecentActivity
};
