/**
 * Advanced Fee Calculation Service
 * Handles late fees, discounts, installments, and fee generation logic
 */

import { getModel } from '../models/dynamicModels.js';

/**
 * Calculate late fee based on due date and policy
 */
export const calculateLateFee = (dueDate, policyConfig = {}) => {
  if (!dueDate || !policyConfig.enabled) return 0;

  const now = new Date();
  const due = new Date(dueDate);
  const gracePeriodDays = policyConfig.gracePeriodDays || 5;

  // Calculate days overdue (excluding grace period)
  const daysLate = Math.floor((now - due) / (1000 * 60 * 60 * 24)) - gracePeriodDays;

  if (daysLate <= 0) return 0;

  // Calculate late fee
  let lateFee = 0;

  if (policyConfig.flatAmount) {
    lateFee = policyConfig.flatAmount;
  }

  if (policyConfig.percentageAmount) {
    // Percentage can be per day or total
    lateFee += (policyConfig.baseAmount || 0) * (policyConfig.percentageAmount / 100);
  }

  return Math.round(lateFee);
};

/**
 * Calculate discount based on type and policy
 */
export const calculateDiscount = async (schoolId, studentId, baseAmount, discountPolicies = []) => {
  if (!discountPolicies || discountPolicies.length === 0) {
    return { amount: 0, type: 'None', reason: '' };
  }

  const Student = await getModel(schoolId, 'students');
  const student = await Student.findById(studentId);

  if (!student) return { amount: 0, type: 'None', reason: '' };

  let maxDiscount = 0;
  let appliedPolicy = null;

  for (const policy of discountPolicies) {
    if (!policy.isActive) continue;

    let discount = 0;

    switch (policy.type) {
      case 'Sibling':
        // Count siblings in the same school
        const siblings = await Student.find({
          parentName: student.parentName,
          parentContact: student.parentContact,
          _id: { $ne: studentId }
        }).countDocuments();

        if (siblings >= (policy.conditions?.minSiblings || 1)) {
          discount = policy.discountMode === 'Percentage'
            ? (baseAmount * policy.value / 100)
            : policy.value;
        }
        break;

      case 'Merit':
        // Check if student has required percentage
        if (student.lastExamPercentage >= (policy.conditions?.minPercentage || 80)) {
          discount = policy.discountMode === 'Percentage'
            ? (baseAmount * policy.value / 100)
            : policy.value;
        }
        break;

      case 'Financial':
      case 'Custom':
        // Admin manually applies these
        discount = policy.discountMode === 'Percentage'
          ? (baseAmount * policy.value / 100)
          : policy.value;
        break;
    }

    if (discount > maxDiscount) {
      maxDiscount = discount;
      appliedPolicy = policy;
    }
  }

  return {
    amount: Math.round(maxDiscount),
    type: appliedPolicy?.type || 'None',
    reason: appliedPolicy?.name || ''
  };
};

/**
 * Generate monthly fee for a student based on class fee structure
 */
export const generateMonthlyFee = async (schoolId, studentId, classId, month, year) => {
  const FeeStructure = await getModel(schoolId, 'feestructures');
  const FeePayment = await getModel(schoolId, 'feepayments');
  const Student = await getModel(schoolId, 'students');

  // Check if fee already exists
  const existing = await FeePayment.findOne({ studentId, month, year });
  if (existing) {
    throw new Error('Fee already generated for this month');
  }

  // Get fee structure for the class
  const structure = await FeeStructure.findOne({ classId, isActive: true });
  if (!structure) {
    throw new Error('No active fee structure found for this class');
  }

  // Calculate base amount from categories
  let baseAmount = 0;
  const feeCategories = [];

  for (const category of structure.categories) {
    if (category.isRecurring) {
      baseAmount += category.amount || 0;
      feeCategories.push({
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        amount: category.amount,
        isRecurring: true
      });
    }
  }

  // Calculate due date (based on structure's due day)
  const dueDay = structure.dueDate || 10;
  const dueDate = new Date(year, month - 1, dueDay);

  // Calculate late fee if overdue
  const now = new Date();
  const isOverdue = now > dueDate;
  const lateFee = isOverdue ? calculateLateFee(dueDate, {
    enabled: structure.lateFeePolicy?.enabled,
    gracePeriodDays: structure.lateFeePolicy?.gracePeriodDays,
    flatAmount: structure.lateFeePolicy?.flatAmount,
    percentageAmount: structure.lateFeePolicy?.percentageAmount,
    baseAmount
  }) : 0;

  // Get applicable discount policies
  const DiscountPolicy = await getModel(schoolId, 'discountpolicies');
  const policies = await DiscountPolicy.find({ isActive: true });

  const discount = await calculateDiscount(schoolId, studentId, baseAmount, policies);

  // Calculate total
  const totalAmount = baseAmount + lateFee - discount.amount;

  // Create fee payment record
  const feePayment = await FeePayment.create({
    studentId,
    classId,
    month,
    year,
    amount: baseAmount,
    feeCategories,
    lateFee,
    discount: discount.amount,
    discountType: discount.type,
    discountReason: discount.reason,
    dueDate,
    isOverdue,
    totalAmount,
    amountPaid: 0,
    remainingAmount: totalAmount,
    status: 'Pending'
  });

  return feePayment;
};

/**
 * Create installment plan for a fee payment
 */
export const createInstallmentPlan = async (schoolId, feePaymentId, numberOfInstallments) => {
  const FeePayment = await getModel(schoolId, 'feepayments');

  const payment = await FeePayment.findById(feePaymentId);
  if (!payment) {
    throw new Error('Fee payment not found');
  }

  if (payment.amountPaid > 0) {
    throw new Error('Cannot create installment plan for partially paid fee');
  }

  const installmentAmount = Math.ceil(payment.totalAmount / numberOfInstallments);
  const nextDueDate = new Date();
  nextDueDate.setDate(nextDueDate.getDate() + 15); // 15 days from now

  payment.hasInstallmentPlan = true;
  payment.installmentPlan = {
    totalInstallments: numberOfInstallments,
    installmentAmount,
    completedInstallments: 0,
    nextDueDate
  };

  await payment.save();
  return payment;
};

/**
 * Record a payment (handles partial payments and installments)
 */
export const recordPayment = async (schoolId, feePaymentId, amount, paymentMethod = 'Cash', remarks = '', markedBy = null) => {
  const FeePayment = await getModel(schoolId, 'feepayments');

  const payment = await FeePayment.findById(feePaymentId);
  if (!payment) {
    throw new Error('Fee payment not found');
  }

  if (amount <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  if (amount > payment.remainingAmount) {
    throw new Error('Payment amount exceeds remaining balance');
  }

  // Add to partial payments
  payment.partialPayments.push({
    amount,
    paymentDate: new Date(),
    paymentMethod,
    remarks,
    markedBy
  });

  // Update totals
  payment.amountPaid += amount;
  payment.remainingAmount = payment.totalAmount - payment.amountPaid;

  // Update status
  if (payment.remainingAmount === 0) {
    payment.status = 'Paid';
    payment.paymentDate = new Date();
  } else {
    payment.status = 'Partial';
  }

  // Update installment plan if exists
  if (payment.hasInstallmentPlan && payment.installmentPlan) {
    const plan = payment.installmentPlan;
    const completed = Math.floor(payment.amountPaid / plan.installmentAmount);
    plan.completedInstallments = Math.min(completed, plan.totalInstallments);

    if (plan.completedInstallments < plan.totalInstallments) {
      // Set next due date (15 days from now)
      plan.nextDueDate = new Date();
      plan.nextDueDate.setDate(plan.nextDueDate.getDate() + 15);
    }
  }

  await payment.save();
  return payment;
};

/**
 * Apply manual discount to a fee payment
 */
export const applyManualDiscount = async (schoolId, feePaymentId, discountAmount, discountType, reason, appliedBy) => {
  const FeePayment = await getModel(schoolId, 'feepayments');

  const payment = await FeePayment.findById(feePaymentId);
  if (!payment) {
    throw new Error('Fee payment not found');
  }

  if (discountAmount < 0 || discountAmount > payment.amount) {
    throw new Error('Invalid discount amount');
  }

  payment.discount = discountAmount;
  payment.discountType = discountType;
  payment.discountReason = reason;
  payment.totalAmount = payment.amount + payment.lateFee - discountAmount;
  payment.remainingAmount = payment.totalAmount - payment.amountPaid;

  if (payment.remainingAmount === 0 && payment.amountPaid > 0) {
    payment.status = 'Paid';
  } else if (payment.amountPaid > 0) {
    payment.status = 'Partial';
  }

  await payment.save();
  return payment;
};

export default {
  calculateLateFee,
  calculateDiscount,
  generateMonthlyFee,
  createInstallmentPlan,
  recordPayment,
  applyManualDiscount
};
