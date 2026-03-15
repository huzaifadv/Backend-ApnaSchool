/**
 * Enhanced Fee Payment Controller
 * Advanced fee operations: installments, discounts, auto-generation
 */

import { getModel } from '../models/dynamicModels.js';
import {
  generateMonthlyFee,
  createInstallmentPlan,
  recordPayment,
  applyManualDiscount
} from '../services/feeCalculationService.js';

/**
 * @desc    Generate monthly fees for all students in a class
 * @route   POST /api/admin/fees/generate
 * @access  Admin
 */
export const generateClassFees = async (req, res) => {
  try {
    const { classId, month, year } = req.body;

    if (!classId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Class ID, month, and year are required'
      });
    }

    const Student = await getModel(req.schoolId, 'students');

    // Get all active students in the class
    const students = await Student.find({ classId, isActive: true });

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active students found in this class'
      });
    }

    const results = {
      success: [],
      failed: [],
      skipped: []
    };

    for (const student of students) {
      try {
        const fee = await generateMonthlyFee(
          req.schoolId,
          student._id,
          classId,
          month,
          year
        );
        results.success.push({
          studentId: student._id,
          studentName: student.name,
          amount: fee.totalAmount
        });
      } catch (error) {
        if (error.message.includes('already generated')) {
          results.skipped.push({
            studentId: student._id,
            studentName: student.name,
            reason: 'Already exists'
          });
        } else {
          results.failed.push({
            studentId: student._id,
            studentName: student.name,
            error: error.message
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Generated ${results.success.length} fees, ${results.skipped.length} skipped, ${results.failed.length} failed`,
      data: results
    });
  } catch (error) {
    console.error('generateClassFees error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate fees',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Create installment plan for a fee
 * @route   POST /api/admin/fees/:id/installment
 * @access  Admin
 */
export const setupInstallmentPlan = async (req, res) => {
  try {
    const { numberOfInstallments } = req.body;

    if (!numberOfInstallments || numberOfInstallments < 2 || numberOfInstallments > 12) {
      return res.status(400).json({
        success: false,
        message: 'Number of installments must be between 2 and 12'
      });
    }

    const payment = await createInstallmentPlan(
      req.schoolId,
      req.params.id,
      numberOfInstallments
    );

    res.status(200).json({
      success: true,
      message: 'Installment plan created successfully',
      data: payment
    });
  } catch (error) {
    console.error('setupInstallmentPlan error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create installment plan',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Record a partial/full payment
 * @route   POST /api/admin/fees/:id/payment
 * @access  Admin
 */
export const recordFeePayment = async (req, res) => {
  try {
    const { amount, paymentMethod, remarks } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required'
      });
    }

    const payment = await recordPayment(
      req.schoolId,
      req.params.id,
      amount,
      paymentMethod || 'Cash',
      remarks || '',
      req.admin?._id
    );

    res.status(200).json({
      success: true,
      message: payment.status === 'Paid' ? 'Payment completed successfully' : 'Partial payment recorded',
      data: payment
    });
  } catch (error) {
    console.error('recordFeePayment error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to record payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Apply manual discount to a fee
 * @route   PATCH /api/admin/fees/:id/discount
 * @access  Admin
 */
export const applyDiscount = async (req, res) => {
  try {
    const { discountAmount, discountType, reason } = req.body;

    if (discountAmount === undefined || discountAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid discount amount is required'
      });
    }

    const payment = await applyManualDiscount(
      req.schoolId,
      req.params.id,
      discountAmount,
      discountType || 'Custom',
      reason || 'Manual adjustment',
      req.admin?._id
    );

    res.status(200).json({
      success: true,
      message: 'Discount applied successfully',
      data: payment
    });
  } catch (error) {
    console.error('applyDiscount error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to apply discount',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get fee statistics for dashboard
 * @route   GET /api/admin/fees/statistics
 * @access  Admin
 */
export const getFeeStatistics = async (req, res) => {
  try {
    const { month, year } = req.query;

    const FeePayment = await getModel(req.schoolId, 'feepayments');

    const query = {};
    if (month) query.month = parseInt(month);
    if (year) query.year = parseInt(year);

    const stats = await FeePayment.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalFees: { $sum: '$totalAmount' },
          totalCollected: { $sum: '$amountPaid' },
          totalPending: { $sum: '$remainingAmount' },
          totalDiscounts: { $sum: '$discount' },
          totalLateFees: { $sum: '$lateFee' },
          paidCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, 1, 0] }
          },
          partialCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Partial'] }, 1, 0] }
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] }
          },
          overdueCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Overdue'] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalFees: 0,
      totalCollected: 0,
      totalPending: 0,
      totalDiscounts: 0,
      totalLateFees: 0,
      paidCount: 0,
      partialCount: 0,
      pendingCount: 0,
      overdueCount: 0
    };

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('getFeeStatistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get student's complete fee history
 * @route   GET /api/admin/fees/student/:studentId/history
 * @access  Admin
 */
export const getStudentFeeHistory = async (req, res) => {
  try {
    const FeePayment = await getModel(req.schoolId, 'feepayments');

    const fees = await FeePayment.find({ studentId: req.params.studentId })
      .sort({ year: -1, month: -1 })
      .populate('classId', 'className section');

    const summary = fees.reduce((acc, fee) => {
      acc.totalFees += fee.totalAmount || 0;
      acc.totalPaid += fee.amountPaid || 0;
      acc.totalPending += fee.remainingAmount || 0;
      acc.totalDiscounts += fee.discount || 0;
      return acc;
    }, {
      totalFees: 0,
      totalPaid: 0,
      totalPending: 0,
      totalDiscounts: 0
    });

    res.status(200).json({
      success: true,
      count: fees.length,
      summary,
      data: fees
    });
  } catch (error) {
    console.error('getStudentFeeHistory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fee history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
