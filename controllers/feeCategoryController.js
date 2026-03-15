/**
 * Fee Category Controller
 * Manages custom fee categories (Tuition, Admission, Lab Fee, etc.)
 */

import { getModel } from '../models/dynamicModels.js';

/**
 * @desc    Get all fee categories
 * @route   GET /api/admin/fee-categories
 * @access  Admin
 */
export const getFeeCategories = async (req, res) => {
  try {
    const FeeCategory = await getModel(req.schoolId, 'feecategories');

    const categories = await FeeCategory.find()
      .sort({ sortOrder: 1, name: 1 })
      .populate('applicableClasses', 'className section');

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories
    });
  } catch (error) {
    console.error('getFeeCategories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fee categories',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get single fee category
 * @route   GET /api/admin/fee-categories/:id
 * @access  Admin
 */
export const getFeeCategory = async (req, res) => {
  try {
    const FeeCategory = await getModel(req.schoolId, 'feecategories');

    const category = await FeeCategory.findById(req.params.id)
      .populate('applicableClasses', 'className section');

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Fee category not found'
      });
    }

    res.status(200).json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('getFeeCategory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fee category',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Create new fee category
 * @route   POST /api/admin/fee-categories
 * @access  Admin
 */
export const createFeeCategory = async (req, res) => {
  try {
    const { name, description, amount, isRecurring, applicableClasses, sortOrder } = req.body;

    if (!name || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name and amount are required'
      });
    }

    const FeeCategory = await getModel(req.schoolId, 'feecategories');

    // Check for duplicate name
    const existing = await FeeCategory.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Fee category with this name already exists'
      });
    }

    const category = await FeeCategory.create({
      name: name.trim(),
      description: description?.trim(),
      amount,
      isRecurring: isRecurring !== undefined ? isRecurring : true,
      applicableClasses: applicableClasses || [],
      sortOrder: sortOrder || 0,
      createdBy: req.admin?._id,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Fee category created successfully',
      data: category
    });
  } catch (error) {
    console.error('createFeeCategory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create fee category',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update fee category
 * @route   PUT /api/admin/fee-categories/:id
 * @access  Admin
 */
export const updateFeeCategory = async (req, res) => {
  try {
    const { name, description, amount, isRecurring, applicableClasses, sortOrder, isActive } = req.body;

    const FeeCategory = await getModel(req.schoolId, 'feecategories');

    const category = await FeeCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Fee category not found'
      });
    }

    // Check for duplicate name (excluding current)
    if (name && name.trim() !== category.name) {
      const existing = await FeeCategory.findOne({
        name: name.trim(),
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Fee category with this name already exists'
        });
      }
    }

    // Update fields
    if (name) category.name = name.trim();
    if (description !== undefined) category.description = description.trim();
    if (amount !== undefined) category.amount = amount;
    if (isRecurring !== undefined) category.isRecurring = isRecurring;
    if (applicableClasses !== undefined) category.applicableClasses = applicableClasses;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();

    res.status(200).json({
      success: true,
      message: 'Fee category updated successfully',
      data: category
    });
  } catch (error) {
    console.error('updateFeeCategory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update fee category',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Delete fee category
 * @route   DELETE /api/admin/fee-categories/:id
 * @access  Admin
 */
export const deleteFeeCategory = async (req, res) => {
  try {
    const FeeCategory = await getModel(req.schoolId, 'feecategories');
    const FeeStructure = await getModel(req.schoolId, 'feestructures');

    const category = await FeeCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Fee category not found'
      });
    }

    // Check if category is used in any fee structure
    const usageCount = await FeeStructure.countDocuments({
      'categories.categoryId': req.params.id
    });

    if (usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: This category is used in ${usageCount} fee structure(s). Please remove it from fee structures first.`
      });
    }

    await FeeCategory.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Fee category deleted successfully'
    });
  } catch (error) {
    console.error('deleteFeeCategory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete fee category',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Toggle fee category active status
 * @route   PATCH /api/admin/fee-categories/:id/toggle
 * @access  Admin
 */
export const toggleFeeCategoryStatus = async (req, res) => {
  try {
    const FeeCategory = await getModel(req.schoolId, 'feecategories');

    const category = await FeeCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Fee category not found'
      });
    }

    category.isActive = !category.isActive;
    await category.save();

    res.status(200).json({
      success: true,
      message: `Fee category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
      data: category
    });
  } catch (error) {
    console.error('toggleFeeCategoryStatus error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle category status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
