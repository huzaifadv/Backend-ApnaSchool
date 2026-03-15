/**
 * Fee Structure Controller
 * Manages class-wise fee configuration with categories and late fee policies
 */

import { getModel } from '../models/dynamicModels.js';

/**
 * @desc    Get all fee structures
 * @route   GET /api/admin/fee-structures
 * @access  Admin
 */
export const getFeeStructures = async (req, res) => {
  try {
    const FeeStructure = await getModel(req.schoolId, 'feestructures');

    const structures = await FeeStructure.find()
      .populate('classId', 'className section')
      .populate('categories.categoryId', 'name description')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: structures.length,
      data: structures
    });
  } catch (error) {
    console.error('getFeeStructures error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fee structures',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get fee structure by class
 * @route   GET /api/admin/fee-structures/class/:classId
 * @access  Admin
 */
export const getFeeStructureByClass = async (req, res) => {
  try {
    const FeeStructure = await getModel(req.schoolId, 'feestructures');

    const structure = await FeeStructure.findOne({
      classId: req.params.classId,
      isActive: true
    })
      .populate('classId', 'className section')
      .populate('categories.categoryId', 'name description');

    if (!structure) {
      return res.status(404).json({
        success: false,
        message: 'No active fee structure found for this class'
      });
    }

    res.status(200).json({
      success: true,
      data: structure
    });
  } catch (error) {
    console.error('getFeeStructureByClass error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fee structure',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Create or update fee structure for a class
 * @route   POST /api/admin/fee-structures
 * @access  Admin
 */
export const createOrUpdateFeeStructure = async (req, res) => {
  try {
    const {
      classId,
      academicYear,
      categories,
      lateFeePolicy,
      dueDate
    } = req.body;

    if (!classId || !academicYear) {
      return res.status(400).json({
        success: false,
        message: 'Class ID and academic year are required'
      });
    }

    const FeeStructure = await getModel(req.schoolId, 'feestructures');
    const Class = await getModel(req.schoolId, 'classes');
    const FeeCategory = await getModel(req.schoolId, 'feecategories');

    // Verify class exists
    const classDoc = await Class.findById(classId);
    if (!classDoc) {
      return res.status(404).json({
        success: false,
        message: 'Class not found'
      });
    }

    // Process categories and calculate total
    let processedCategories = [];
    let totalMonthlyFee = 0;

    if (categories && Array.isArray(categories)) {
      for (const cat of categories) {
        const category = await FeeCategory.findById(cat.categoryId);
        if (category && category.isActive) {
          processedCategories.push({
            categoryId: category._id,
            categoryName: category.name,
            amount: cat.amount || category.amount,
            isRecurring: category.isRecurring
          });

          if (category.isRecurring) {
            totalMonthlyFee += cat.amount || category.amount;
          }
        }
      }
    }

    // Check if structure already exists for this class and year
    const existing = await FeeStructure.findOne({ classId, academicYear });

    if (existing) {
      // Update existing
      existing.className = classDoc.className;
      existing.categories = processedCategories;
      existing.totalMonthlyFee = totalMonthlyFee;
      existing.lateFeePolicy = lateFeePolicy || existing.lateFeePolicy;
      existing.dueDate = dueDate !== undefined ? dueDate : existing.dueDate;

      await existing.save();

      return res.status(200).json({
        success: true,
        message: 'Fee structure updated successfully',
        data: existing
      });
    }

    // Create new
    const structure = await FeeStructure.create({
      classId,
      className: classDoc.className,
      academicYear,
      categories: processedCategories,
      totalMonthlyFee,
      lateFeePolicy: lateFeePolicy || {
        enabled: true,
        gracePeriodDays: 5,
        flatAmount: 0,
        percentageAmount: 0
      },
      dueDate: dueDate || 10,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Fee structure created successfully',
      data: structure
    });
  } catch (error) {
    console.error('createOrUpdateFeeStructure error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create/update fee structure',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update late fee policy for a class
 * @route   PATCH /api/admin/fee-structures/:id/late-fee-policy
 * @access  Admin
 */
export const updateLateFeePolicy = async (req, res) => {
  try {
    const { enabled, gracePeriodDays, flatAmount, percentageAmount } = req.body;

    const FeeStructure = await getModel(req.schoolId, 'feestructures');

    const structure = await FeeStructure.findById(req.params.id);
    if (!structure) {
      return res.status(404).json({
        success: false,
        message: 'Fee structure not found'
      });
    }

    structure.lateFeePolicy = {
      enabled: enabled !== undefined ? enabled : structure.lateFeePolicy.enabled,
      gracePeriodDays: gracePeriodDays !== undefined ? gracePeriodDays : structure.lateFeePolicy.gracePeriodDays,
      flatAmount: flatAmount !== undefined ? flatAmount : structure.lateFeePolicy.flatAmount,
      percentageAmount: percentageAmount !== undefined ? percentageAmount : structure.lateFeePolicy.percentageAmount
    };

    await structure.save();

    res.status(200).json({
      success: true,
      message: 'Late fee policy updated successfully',
      data: structure
    });
  } catch (error) {
    console.error('updateLateFeePolicy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update late fee policy',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Delete fee structure
 * @route   DELETE /api/admin/fee-structures/:id
 * @access  Admin
 */
export const deleteFeeStructure = async (req, res) => {
  try {
    const FeeStructure = await getModel(req.schoolId, 'feestructures');

    const structure = await FeeStructure.findById(req.params.id);
    if (!structure) {
      return res.status(404).json({
        success: false,
        message: 'Fee structure not found'
      });
    }

    await FeeStructure.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Fee structure deleted successfully'
    });
  } catch (error) {
    console.error('deleteFeeStructure error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete fee structure',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Clone fee structure to multiple classes
 * @route   POST /api/admin/fee-structures/:id/clone
 * @access  Admin
 */
export const cloneFeeStructure = async (req, res) => {
  try {
    const { targetClassIds } = req.body;

    if (!targetClassIds || !Array.isArray(targetClassIds) || targetClassIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Target class IDs are required'
      });
    }

    const FeeStructure = await getModel(req.schoolId, 'feestructures');
    const Class = await getModel(req.schoolId, 'classes');

    const sourceStructure = await FeeStructure.findById(req.params.id);
    if (!sourceStructure) {
      return res.status(404).json({
        success: false,
        message: 'Source fee structure not found'
      });
    }

    const createdStructures = [];

    for (const classId of targetClassIds) {
      const classDoc = await Class.findById(classId);
      if (!classDoc) continue;

      // Check if structure already exists
      const existing = await FeeStructure.findOne({
        classId,
        academicYear: sourceStructure.academicYear
      });

      if (existing) {
        // Update existing
        existing.categories = sourceStructure.categories;
        existing.totalMonthlyFee = sourceStructure.totalMonthlyFee;
        existing.lateFeePolicy = sourceStructure.lateFeePolicy;
        existing.dueDate = sourceStructure.dueDate;
        await existing.save();
        createdStructures.push(existing);
      } else {
        // Create new
        const newStructure = await FeeStructure.create({
          classId,
          className: classDoc.className,
          academicYear: sourceStructure.academicYear,
          categories: sourceStructure.categories,
          totalMonthlyFee: sourceStructure.totalMonthlyFee,
          lateFeePolicy: sourceStructure.lateFeePolicy,
          dueDate: sourceStructure.dueDate,
          isActive: true
        });
        createdStructures.push(newStructure);
      }
    }

    res.status(200).json({
      success: true,
      message: `Fee structure cloned to ${createdStructures.length} class(es)`,
      data: createdStructures
    });
  } catch (error) {
    console.error('cloneFeeStructure error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clone fee structure',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
