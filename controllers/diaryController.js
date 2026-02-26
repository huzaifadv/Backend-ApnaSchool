import { validationResult } from 'express-validator';
import { getModel } from '../models/dynamicModels.js';

// @desc    Create a new diary entry
// @route   POST /api/admin/diary
// @access  Private (Admin only)
export const createDiary = async (req, res, next) => {
  try {
    console.log('=== CREATE DIARY DEBUG ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request files:', req.files);

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', JSON.stringify(errors.array(), null, 2));
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    let { classId, title, content, subjects, date } = req.body;

    // Parse subjects if it's a JSON string (from FormData)
    if (typeof subjects === 'string') {
      try {
        subjects = JSON.parse(subjects);
      } catch (e) {
        console.error('Failed to parse subjects:', e);
        return res.status(400).json({
          success: false,
          message: 'Invalid subjects format'
        });
      }
    }

    console.log('classId from request:', classId);
    console.log('subjects from request:', subjects);
    console.log('subjects type:', typeof subjects);
    console.log('schoolId from req:', req.schoolId);
    console.log('admin info:', req.admin);

    // Get tenant models
    const Class = await getModel(req.schoolId, 'classes');
    const Diary = await getModel(req.schoolId, 'diary');

    // Verify class exists in tenant database
    const classData = await Class.findById(classId);

    console.log('Class found:', classData);

    if (!classData) {
      return res.status(400).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Validate that either subjects array or content is provided
    if (!subjects || subjects.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one subject is required'
      });
    }

    // Use class teacher name if available, otherwise use logged-in admin name
    const teacherName = classData.classTeacher || req.admin.name;

    // Handle file attachments if uploaded
    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => ({
        fileName: file.originalname,
        fileUrl: `/uploads/diary/${file.filename}`,
        fileType: file.mimetype
      }));
    }

    // Create diary entry
    const diary = await Diary.create({
      classId,
      teacherId: req.admin._id,
      teacherName: teacherName,
      subjects: subjects || [],
      content: content || '',
      date: date || new Date(),
      attachments
    });

    // Manually populate classId using tenant Class model
    const diaryObj = diary.toObject();
    if (diaryObj.classId) {
      const classData = await Class.findById(diaryObj.classId)
        .select('className section grade')
        .lean();
      diaryObj.classId = classData;
    }

    res.status(201).json({
      success: true,
      message: 'Diary entry created successfully',
      data: diaryObj
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get all diary entries for admin's school
// @route   GET /api/admin/diary
// @access  Private (Admin only)
export const getDiaries = async (req, res, next) => {
  try {
    console.log('=== ADMIN GET DIARIES DEBUG ===');
    console.log('schoolId:', req.schoolId);

    const { classId, startDate, endDate, isActive } = req.query;

    // Get tenant model
    const Diary = await getModel(req.schoolId, 'diary');

    // Build filter - by default show only active diaries
    const filter = {
      isActive: true
    };

    if (classId) {
      filter.classId = classId;
    }

    // Allow overriding isActive filter if explicitly provided
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

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

    // Get diary entries with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Fetch diaries without populate first
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

    console.log('Found diaries:', diaries.length);

    res.status(200).json({
      success: true,
      count: diaries.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: diaries
    });

  } catch (error) {
    console.error('Admin get diaries error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch diary entries',
      error: error.message
    });
  }
};

// @desc    Get single diary entry by ID
// @route   GET /api/admin/diary/:id
// @access  Private (Admin only)
export const getDiaryById = async (req, res, next) => {
  try {
    // Get tenant model
    const Diary = await getModel(req.schoolId, 'diary');

    const diary = await Diary.findById(req.params.id).lean();

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

// @desc    Update diary entry
// @route   PUT /api/admin/diary/:id
// @access  Private (Admin only)
export const updateDiary = async (req, res, next) => {
  try {
    console.log('=== UPDATE DIARY DEBUG ===');
    console.log('Diary ID:', req.params.id);
    console.log('Request body:', req.body);
    console.log('Files:', req.files);

    // Parse subjects if it's a JSON string (from FormData)
    if (req.body.subjects && typeof req.body.subjects === 'string') {
      try {
        req.body.subjects = JSON.parse(req.body.subjects);
      } catch (e) {
        console.error('Failed to parse subjects:', e);
        return res.status(400).json({
          success: false,
          message: 'Invalid subjects format'
        });
      }
    }

    // Get tenant models
    const Diary = await getModel(req.schoolId, 'diary');
    const Class = await getModel(req.schoolId, 'classes');

    const diary = await Diary.findById(req.params.id);

    if (!diary) {
      return res.status(404).json({
        success: false,
        message: 'Diary entry not found'
      });
    }

    // Verify class exists (if updating classId)
    if (req.body.classId) {
      const classData = await Class.findById(req.body.classId);

      if (!classData) {
        return res.status(400).json({
          success: false,
          message: 'Class not found'
        });
      }

      // Update teacher name if class is being changed
      if (classData.classTeacher) {
        req.body.teacherName = classData.classTeacher;
      }
    }

    // Handle file attachments if uploaded
    if (req.files && req.files.length > 0) {
      const newAttachments = req.files.map(file => ({
        fileName: file.originalname,
        fileUrl: `/uploads/diary/${file.filename}`,
        fileType: file.mimetype
      }));

      // Append new attachments to existing ones
      req.body.attachments = [...(diary.attachments || []), ...newAttachments];
    }

    // Prevent changing teacherId
    delete req.body.teacherId;

    const updatedDiary = await Diary.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).lean();

    // Manually populate classId
    if (updatedDiary.classId) {
      const classData = await Class.findById(updatedDiary.classId)
        .select('className section grade')
        .lean();
      updatedDiary.classId = classData;
    }

    res.status(200).json({
      success: true,
      message: 'Diary entry updated successfully',
      data: updatedDiary
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Delete diary entry
// @route   DELETE /api/admin/diary/:id
// @access  Private (Admin only)
export const deleteDiary = async (req, res, next) => {
  try {
    console.log('=== DELETE DIARY DEBUG ===');
    console.log('Diary ID to delete:', req.params.id);

    // Get tenant model
    const Diary = await getModel(req.schoolId, 'diary');

    const diary = await Diary.findById(req.params.id);

    if (!diary) {
      return res.status(404).json({
        success: false,
        message: 'Diary entry not found'
      });
    }

    // Permanent delete - remove from database
    await Diary.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Diary entry deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Permanently delete diary entry
// @route   DELETE /api/admin/diary/:id/permanent
// @access  Private (Admin only)
export const permanentDeleteDiary = async (req, res, next) => {
  try {
    // Get tenant model
    const Diary = await getModel(req.schoolId, 'diary');

    const diary = await Diary.findByIdAndDelete(req.params.id);

    if (!diary) {
      return res.status(404).json({
        success: false,
        message: 'Diary entry not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Diary entry permanently deleted'
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Migrate old diary entries - add title field to existing entries
// @route   POST /api/admin/diary/migrate
// @access  Private (Admin only)
export const migrateDiaryData = async (req, res, next) => {
  try {
    const Diary = await getModel(req.schoolId, 'diary');

    // Find all diaries where title is missing
    const diariesToUpdate = await Diary.find({
      $or: [
        { title: { $exists: false } },
        { title: null },
        { title: '' }
      ]
    });

    console.log(`Found ${diariesToUpdate.length} diaries to migrate`);

    let updatedCount = 0;

    for (const diary of diariesToUpdate) {
      // Set default title
      diary.title = 'Class Diary';
      await diary.save();
      updatedCount++;
    }

    res.status(200).json({
      success: true,
      message: `Successfully migrated ${updatedCount} diary entries`,
      data: {
        totalFound: diariesToUpdate.length,
        updated: updatedCount
      }
    });

  } catch (error) {
    console.error('Diary migration error:', error);
    next(error);
  }
};

// @desc    Auto-delete diary entries older than 7 days
// @note    This function should be called by a cron job
export const autoDeleteOldDiaries = async () => {
  try {
    console.log('=== AUTO-DELETE OLD DIARIES ===');
    console.log('Running at:', new Date().toISOString());

    // Import School model to get all schools
    const School = (await import('../models/School.js')).default;
    const schools = await School.find({ isActive: true });

    console.log(`Found ${schools.length} active schools`);

    let totalDeleted = 0;

    for (const school of schools) {
      try {
        // Get diary model for this school
        const Diary = await getModel(school._id, 'diary');

        // Calculate date 7 days ago
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        console.log(`School ${school.name}: Deleting diaries older than ${sevenDaysAgo.toISOString()}`);

        // Delete diaries older than 7 days
        const result = await Diary.deleteMany({
          createdAt: { $lt: sevenDaysAgo }
        });

        console.log(`School ${school.name}: Deleted ${result.deletedCount} old diaries`);
        totalDeleted += result.deletedCount;

      } catch (schoolError) {
        console.error(`Error processing school ${school.name}:`, schoolError.message);
        // Continue with next school even if one fails
      }
    }

    console.log(`Total diaries deleted across all schools: ${totalDeleted}`);
    return { success: true, deletedCount: totalDeleted };

  } catch (error) {
    console.error('Auto-delete old diaries error:', error);
    return { success: false, error: error.message };
  }
};
