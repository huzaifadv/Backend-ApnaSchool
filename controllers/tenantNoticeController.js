import { validationResult } from 'express-validator';
import { getModel } from '../models/dynamicModels.js';

/**
 * Tenant-aware Notice Controller
 * All operations use dynamic database connections based on schoolId
 */

/**
 * @desc    Create a new notice in tenant database
 * @route   POST /api/admin/notices
 * @access  Private (Admin only)
 */
export const createNotice = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      title,
      content,
      priority,
      targetAudience,
      targetClasses, // Array of class IDs or 'all'
      classId, // Keep for backward compatibility
      expiryDate
    } = req.body;

    const Notice = await getModel(req.schoolId, 'notices');
    const Admin = await getModel(req.schoolId, 'admins'); // Load Admin model for populate

    // Determine which classes to target
    let finalTargetClasses = [];

    // If targetClasses is provided and is 'all', set to empty array (means all classes)
    if (targetClasses === 'all' || targetAudience === 'all') {
      finalTargetClasses = [];
    } else if (targetClasses && Array.isArray(targetClasses) && targetClasses.length > 0) {
      // Validate that all provided class IDs exist
      const Class = await getModel(req.schoolId, 'classes');
      const validClasses = await Class.find({ _id: { $in: targetClasses } });

      if (validClasses.length !== targetClasses.length) {
        return res.status(404).json({
          success: false,
          message: 'One or more classes not found in your school'
        });
      }
      finalTargetClasses = targetClasses;
    } else if (classId) {
      // Backward compatibility: single classId
      const Class = await getModel(req.schoolId, 'classes');
      const classDoc = await Class.findById(classId);
      if (!classDoc) {
        return res.status(404).json({
          success: false,
          message: 'Class not found in your school'
        });
      }
      finalTargetClasses = [classId];
    }

    console.log('=== CREATING NOTICE ===');
    console.log('Target Classes from request:', targetClasses);
    console.log('Final Target Classes:', finalTargetClasses);

    const notice = await Notice.create({
      title,
      content,
      priority: priority || 'medium',
      targetAudience: targetAudience || 'all',
      targetClasses: finalTargetClasses,
      classId: finalTargetClasses.length > 0 ? finalTargetClasses[0] : null, // Keep for backward compatibility
      createdBy: req.userId,
      expiryDate: expiryDate || null
    });

    console.log('Notice created with targetClasses:', notice.targetClasses);

    await notice.populate('createdBy', 'name email');
    if (finalTargetClasses.length > 0) {
      await notice.populate('targetClasses', 'className section grade');
      await notice.populate('classId', 'className section grade');
      console.log('Populated classes:', notice.targetClasses.map(c => `${c.className}-${c.section}`));
    }

    res.status(201).json({
      success: true,
      message: 'Notice created successfully',
      data: notice
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all notices from tenant database
 * @route   GET /api/admin/notices
 * @access  Private
 */
export const getNotices = async (req, res, next) => {
  try {
    const { priority, targetAudience, isActive, classId } = req.query;

    const Notice = await getModel(req.schoolId, 'notices');
    const Admin = await getModel(req.schoolId, 'admins'); // Load Admin model for populate
    const Class = await getModel(req.schoolId, 'classes'); // Load Class model for populate

    const filter = {};

    if (priority) filter.priority = priority;
    if (targetAudience) filter.targetAudience = targetAudience;

    // Filter by class if provided
    if (classId) {
      // Show notices that are either for all classes or include this specific class
      filter.$or = [
        { targetClasses: { $size: 0 } }, // Empty array means all classes
        { targetClasses: classId }, // Array contains this class
        { classId: classId } // Backward compatibility
      ];
    }

    // By default, only show active notices unless explicitly requested otherwise
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    } else {
      filter.isActive = true; // Default to active notices only
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notices = await Notice.find(filter)
      .populate('createdBy', 'name email role')
      .populate('classId', 'className section grade')
      .populate('targetClasses', 'className section grade')
      .sort({ createdAt: -1 })
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

/**
 * @desc    Get single notice by ID
 * @route   GET /api/admin/notices/:id
 * @access  Private
 */
export const getNoticeById = async (req, res, next) => {
  try {
    const Notice = await getModel(req.schoolId, 'notices');
    const Admin = await getModel(req.schoolId, 'admins'); // Load Admin model for populate
    const Class = await getModel(req.schoolId, 'classes'); // Load Class model for populate

    const notice = await Notice.findById(req.params.id)
      .populate('createdBy', 'name email role phone')
      .populate('classId', 'className section grade academicYear')
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

/**
 * @desc    Update notice
 * @route   PUT /api/admin/notices/:id
 * @access  Private (Admin only)
 */
export const updateNotice = async (req, res, next) => {
  try {
    const Notice = await getModel(req.schoolId, 'notices');
    const Admin = await getModel(req.schoolId, 'admins'); // Load Admin model for populate
    const Class = await getModel(req.schoolId, 'classes'); // Load Class model for populate

    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    // If updating targetClasses, verify all classes exist
    if (req.body.targetClasses && Array.isArray(req.body.targetClasses) && req.body.targetClasses.length > 0) {
      const Class = await getModel(req.schoolId, 'classes');
      const validClasses = await Class.find({ _id: { $in: req.body.targetClasses } });
      if (validClasses.length !== req.body.targetClasses.length) {
        return res.status(404).json({
          success: false,
          message: 'One or more classes not found in your school'
        });
      }
      // Update classId for backward compatibility
      req.body.classId = req.body.targetClasses[0];
    }

    // If updating classId (backward compatibility), verify it exists
    if (req.body.classId && !req.body.targetClasses) {
      const Class = await getModel(req.schoolId, 'classes');
      const classDoc = await Class.findById(req.body.classId);
      if (!classDoc) {
        return res.status(404).json({
          success: false,
          message: 'Class not found in your school'
        });
      }
      req.body.targetClasses = [req.body.classId];
    }

    // Prevent changing createdBy
    delete req.body.createdBy;

    const updatedNotice = await Notice.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    )
      .populate('createdBy', 'name email role')
      .populate('classId', 'className section grade')
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

/**
 * @desc    Delete notice (permanently delete from database)
 * @route   DELETE /api/admin/notices/:id
 * @access  Private (Admin only)
 */
export const deleteNotice = async (req, res, next) => {
  try {
    console.log('=== DELETE NOTICE REQUEST ===');
    console.log('School ID:', req.schoolId);
    console.log('Notice ID:', req.params.id);

    const Notice = await getModel(req.schoolId, 'notices');

    // First check if notice exists
    const existingNotice = await Notice.findById(req.params.id);
    console.log('Notice found:', existingNotice ? 'YES' : 'NO');
    if (existingNotice) {
      console.log('Notice title:', existingNotice.title);
    }

    const notice = await Notice.findByIdAndDelete(req.params.id);

    if (!notice) {
      console.log('❌ Notice not found for deletion');
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    console.log('✅ Notice deleted successfully:', notice._id);

    res.status(200).json({
      success: true,
      message: 'Notice deleted successfully',
      data: { deletedId: notice._id }
    });

  } catch (error) {
    console.error('❌ Delete error:', error);
    next(error);
  }
};

/**
 * @desc    Permanently delete notice
 * @route   DELETE /api/admin/notices/:id/permanent
 * @access  Private (Admin only)
 */
export const permanentDeleteNotice = async (req, res, next) => {
  try {
    const Notice = await getModel(req.schoolId, 'notices');
    const notice = await Notice.findByIdAndDelete(req.params.id);

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

export default {
  createNotice,
  getNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
  permanentDeleteNotice
};
