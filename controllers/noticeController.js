import { validationResult } from 'express-validator';
import Notice from '../models/Notice.js';
import Class from '../models/Class.js';

// @desc    Create a new notice
// @route   POST /api/notices
// @access  Private (Admin only)
export const createNotice = async (req, res, next) => {
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
      title,
      description,
      category,
      priority,
      targetAudience,
      targetClasses,
      validFrom,
      validUntil,
      isPinned
    } = req.body;

    // Verify target classes belong to admin's school (if provided)
    if (targetClasses && targetClasses.length > 0) {
      const classes = await Class.find({
        _id: { $in: targetClasses },
        schoolId: req.schoolId
      });

      if (classes.length !== targetClasses.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more classes do not belong to your school'
        });
      }
    }

    // Handle file attachments if uploaded
    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => ({
        fileName: file.originalname,
        fileUrl: `/uploads/notices/${file.filename}`,
        fileType: file.mimetype
      }));
    }

    // Create notice
    const notice = await Notice.create({
      schoolId: req.schoolId,
      title,
      description,
      category: category || 'General',
      priority: priority || 'Medium',
      targetAudience: targetAudience || 'All',
      targetClasses: targetClasses || [],
      postedBy: req.admin._id,
      attachments,
      validFrom: validFrom || new Date(),
      validUntil: validUntil || null,
      isPinned: isPinned || false
    });

    await notice.populate('postedBy', 'name email role');
    await notice.populate('targetClasses', 'className section grade');

    res.status(201).json({
      success: true,
      message: 'Notice created successfully',
      data: notice
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get all notices for admin's school
// @route   GET /api/notices
// @access  Private (Admin only)
export const getNotices = async (req, res, next) => {
  try {
    const { category, priority, targetAudience, isActive, isPinned } = req.query;

    // Build filter
    const filter = { schoolId: req.schoolId };

    if (category) {
      filter.category = category;
    }

    if (priority) {
      filter.priority = priority;
    }

    if (targetAudience) {
      filter.targetAudience = targetAudience;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    if (isPinned !== undefined) {
      filter.isPinned = isPinned === 'true';
    }

    // Get notices with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notices = await Notice.find(filter)
      .populate('postedBy', 'name email role')
      .populate('targetClasses', 'className section grade')
      .sort({ isPinned: -1, validFrom: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notice.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: notices.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: notices
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get single notice by ID
// @route   GET /api/notices/:id
// @access  Private (Admin only)
export const getNoticeById = async (req, res, next) => {
  try {
    const notice = await Notice.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    })
      .populate('postedBy', 'name email role phone')
      .populate('targetClasses', 'className section grade academicYear');

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    res.status(200).json({
      success: true,
      data: notice
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Update notice
// @route   PUT /api/notices/:id
// @access  Private (Admin only)
export const updateNotice = async (req, res, next) => {
  try {
    const notice = await Notice.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    // Verify target classes belong to admin's school (if provided)
    if (req.body.targetClasses && req.body.targetClasses.length > 0) {
      const classes = await Class.find({
        _id: { $in: req.body.targetClasses },
        schoolId: req.schoolId
      });

      if (classes.length !== req.body.targetClasses.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more classes do not belong to your school'
        });
      }
    }

    // Prevent changing schoolId and postedBy
    delete req.body.schoolId;
    delete req.body.postedBy;

    const updatedNotice = await Notice.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    )
      .populate('postedBy', 'name email role')
      .populate('targetClasses', 'className section grade');

    res.status(200).json({
      success: true,
      message: 'Notice updated successfully',
      data: updatedNotice
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Delete notice
// @route   DELETE /api/notices/:id
// @access  Private (Admin only)
export const deleteNotice = async (req, res, next) => {
  try {
    const notice = await Notice.findOne({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    // Soft delete - set isActive to false
    notice.isActive = false;
    await notice.save();

    res.status(200).json({
      success: true,
      message: 'Notice deactivated successfully'
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Permanently delete notice
// @route   DELETE /api/notices/:id/permanent
// @access  Private (Admin only)
export const permanentDeleteNotice = async (req, res, next) => {
  try {
    const notice = await Notice.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.schoolId
    });

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notice permanently deleted'
    });

  } catch (error) {
    next(error);
  }
};
