/**
 * Discount Policy Controller
 * Manages discount policies (Sibling, Merit, Financial, Custom)
 */

import { getModel } from '../models/dynamicModels.js';

/**
 * @desc    Get all discount policies
 * @route   GET /api/admin/discount-policies
 * @access  Admin
 */
export const getDiscountPolicies = async (req, res) => {
  try {
    const DiscountPolicy = await getModel(req.schoolId, 'discountpolicies');

    const policies = await DiscountPolicy.find()
      .populate('applicableCategories', 'name')
      .sort({ type: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: policies.length,
      data: policies
    });
  } catch (error) {
    console.error('getDiscountPolicies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch discount policies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get single discount policy
 * @route   GET /api/admin/discount-policies/:id
 * @access  Admin
 */
export const getDiscountPolicy = async (req, res) => {
  try {
    const DiscountPolicy = await getModel(req.schoolId, 'discountpolicies');

    const policy = await DiscountPolicy.findById(req.params.id)
      .populate('applicableCategories', 'name');

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Discount policy not found'
      });
    }

    res.status(200).json({
      success: true,
      data: policy
    });
  } catch (error) {
    console.error('getDiscountPolicy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch discount policy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Create new discount policy
 * @route   POST /api/admin/discount-policies
 * @access  Admin
 */
export const createDiscountPolicy = async (req, res) => {
  try {
    const {
      name,
      type,
      discountMode,
      value,
      description,
      conditions,
      applicableCategories
    } = req.body;

    if (!name || !type || !discountMode || value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name, type, discount mode, and value are required'
      });
    }

    if (!['Sibling', 'Merit', 'Financial', 'Custom'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid discount type'
      });
    }

    if (!['Percentage', 'Flat'].includes(discountMode)) {
      return res.status(400).json({
        success: false,
        message: 'Discount mode must be Percentage or Flat'
      });
    }

    if (discountMode === 'Percentage' && (value < 0 || value > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Percentage value must be between 0 and 100'
      });
    }

    const DiscountPolicy = await getModel(req.schoolId, 'discountpolicies');

    // Check for duplicate name
    const existing = await DiscountPolicy.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Discount policy with this name already exists'
      });
    }

    const policy = await DiscountPolicy.create({
      name: name.trim(),
      type,
      discountMode,
      value,
      description: description?.trim(),
      conditions: conditions || {},
      applicableCategories: applicableCategories || [],
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Discount policy created successfully',
      data: policy
    });
  } catch (error) {
    console.error('createDiscountPolicy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create discount policy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update discount policy
 * @route   PUT /api/admin/discount-policies/:id
 * @access  Admin
 */
export const updateDiscountPolicy = async (req, res) => {
  try {
    const {
      name,
      type,
      discountMode,
      value,
      description,
      conditions,
      applicableCategories,
      isActive
    } = req.body;

    const DiscountPolicy = await getModel(req.schoolId, 'discountpolicies');

    const policy = await DiscountPolicy.findById(req.params.id);
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Discount policy not found'
      });
    }

    // Check for duplicate name (excluding current)
    if (name && name.trim() !== policy.name) {
      const existing = await DiscountPolicy.findOne({
        name: name.trim(),
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Discount policy with this name already exists'
        });
      }
    }

    // Validate percentage value
    if (discountMode === 'Percentage' && value !== undefined && (value < 0 || value > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Percentage value must be between 0 and 100'
      });
    }

    // Update fields
    if (name) policy.name = name.trim();
    if (type) policy.type = type;
    if (discountMode) policy.discountMode = discountMode;
    if (value !== undefined) policy.value = value;
    if (description !== undefined) policy.description = description.trim();
    if (conditions !== undefined) policy.conditions = conditions;
    if (applicableCategories !== undefined) policy.applicableCategories = applicableCategories;
    if (isActive !== undefined) policy.isActive = isActive;

    await policy.save();

    res.status(200).json({
      success: true,
      message: 'Discount policy updated successfully',
      data: policy
    });
  } catch (error) {
    console.error('updateDiscountPolicy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update discount policy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Delete discount policy
 * @route   DELETE /api/admin/discount-policies/:id
 * @access  Admin
 */
export const deleteDiscountPolicy = async (req, res) => {
  try {
    const DiscountPolicy = await getModel(req.schoolId, 'discountpolicies');

    const policy = await DiscountPolicy.findById(req.params.id);
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Discount policy not found'
      });
    }

    await DiscountPolicy.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Discount policy deleted successfully'
    });
  } catch (error) {
    console.error('deleteDiscountPolicy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete discount policy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Toggle discount policy active status
 * @route   PATCH /api/admin/discount-policies/:id/toggle
 * @access  Admin
 */
export const toggleDiscountPolicyStatus = async (req, res) => {
  try {
    const DiscountPolicy = await getModel(req.schoolId, 'discountpolicies');

    const policy = await DiscountPolicy.findById(req.params.id);
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Discount policy not found'
      });
    }

    policy.isActive = !policy.isActive;
    await policy.save();

    res.status(200).json({
      success: true,
      message: `Discount policy ${policy.isActive ? 'activated' : 'deactivated'} successfully`,
      data: policy
    });
  } catch (error) {
    console.error('toggleDiscountPolicyStatus error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle policy status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
