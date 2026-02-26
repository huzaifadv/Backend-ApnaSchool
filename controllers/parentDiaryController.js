import { getModel } from '../models/dynamicModels.js';

// @desc    Get diary entries for parent's child's class
// @route   GET /api/parent/diary
// @access  Private (Parent only)
export const getParentDiaryEntries = async (req, res, next) => {
  try {
    console.log('=== PARENT DIARY FETCH DEBUG ===');
    console.log('schoolId:', req.schoolId);
    console.log('studentId:', req.studentId);

    // Get tenant models
    const Student = await getModel(req.schoolId, 'students');
    const Diary = await getModel(req.schoolId, 'diary');

    // Get student information to find their class
    const student = await Student.findOne({
      _id: req.studentId,
      isActive: true
    }).select('classId');

    console.log('Student found:', student);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const { startDate, endDate } = req.query;

    // Build filter for diary entries
    const filter = {
      classId: student.classId,
      isActive: true
    };

    // Date range filter.
    // Frontend sends 'YYYY-MM-DD'. new Date('YYYY-MM-DD') → midnight UTC,
    // same as how diary dates are stored — always matches.
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(startDate.split('T')[0]);
      }
      if (endDate) {
        const e = new Date(endDate.split('T')[0]);
        e.setUTCHours(23, 59, 59, 999);
        filter.date.$lte = e;
      }
    }

    // Get diary entries with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const diaries = await Diary.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Manually populate classId using tenant Class model
    const Class = await getModel(req.schoolId, 'classes');

    for (let diary of diaries) {
      if (diary.classId) {
        const classData = await Class.findById(diary.classId)
          .select('className section grade')
          .lean();
        diary.classId = classData;
      }
    }

    const total = await Diary.countDocuments(filter);

    console.log('Diaries found:', diaries.length);

    res.status(200).json({
      success: true,
      count: diaries.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: diaries
    });

  } catch (error) {
    console.error('Parent diary fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch diary entries',
      error: error.message
    });
  }
};

// @desc    Get single diary entry by ID for parent
// @route   GET /api/parent/diary/:id
// @access  Private (Parent only)
export const getParentDiaryById = async (req, res, next) => {
  try {
    // Get tenant models
    const Student = await getModel(req.schoolId, 'students');
    const Diary = await getModel(req.schoolId, 'diary');

    // Get student information to find their class
    const student = await Student.findOne({
      _id: req.studentId,
      isActive: true
    }).select('classId');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Find diary entry that belongs to student's class
    const diary = await Diary.findOne({
      _id: req.params.id,
      classId: student.classId,
      isActive: true
    }).lean();

    if (!diary) {
      return res.status(404).json({
        success: false,
        message: 'Diary entry not found'
      });
    }

    // Manually populate classId
    const Class = await getModel(req.schoolId, 'classes');
    if (diary.classId) {
      const classData = await Class.findById(diary.classId)
        .select('className section grade academicYear')
        .lean();
      diary.classId = classData;
    }

    res.status(200).json({
      success: true,
      data: diary
    });

  } catch (error) {
    next(error);
  }
};
