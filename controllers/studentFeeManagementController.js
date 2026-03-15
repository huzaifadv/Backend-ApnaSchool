import { getModel } from '../models/dynamicModels.js';
import mongoose from 'mongoose';

/**
 * Student Fee Management Controller
 * Handles fee profile setup, monthly fee generation, and dues carry-forward
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. UPDATE STUDENT FEE PROFILE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set or update student's fee profile
 * @route PUT /api/admin/student-fees/:studentId/profile
 */
export const updateStudentFeeProfile = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { tuitionFee, fundFee, hostelFee, transportFee, feeDueDate } = req.body;

    const Student = await getModel(req.schoolId, 'students');
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Update fee profile
    student.feeProfile = {
      tuitionFee: tuitionFee || 0,
      fundFee: fundFee || 0,
      hostelFee: hostelFee || 0,
      transportFee: transportFee || 0
    };

    // Calculate total monthly fee
    student.totalMonthlyFee =
      (student.feeProfile.tuitionFee || 0) +
      (student.feeProfile.fundFee || 0) +
      (student.feeProfile.hostelFee || 0) +
      (student.feeProfile.transportFee || 0);

    // Update legacy monthlyFee for backward compatibility
    student.monthlyFee = student.totalMonthlyFee;

    // Update due date if provided
    if (feeDueDate !== undefined) {
      student.feeDueDate = feeDueDate;
    }

    await student.save();

    res.status(200).json({
      success: true,
      message: 'Fee profile updated successfully',
      data: {
        studentId: student._id,
        studentName: student.fullName,
        feeProfile: student.feeProfile,
        totalMonthlyFee: student.totalMonthlyFee,
        feeDueDate: student.feeDueDate
      }
    });
  } catch (error) {
    console.error('Update student fee profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update fee profile'
    });
  }
};

/**
 * Get student's fee profile
 * @route GET /api/admin/student-fees/:studentId/profile
 */
export const getStudentFeeProfile = async (req, res) => {
  try {
    const { studentId } = req.params;

    console.log('📥 Get Student Fee Profile Request:', {
      studentId,
      schoolId: req.schoolId
    });

    const Student = await getModel(req.schoolId, 'students');
    const student = await Student.findById(studentId)
      .select('fullName rollNumber className section feeProfile totalMonthlyFee monthlyFee feeDueDate');

    console.log('📊 Student found:', student);

    if (!student) {
      console.log('❌ Student not found');
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Ensure feeProfile exists (for students created before this feature)
    if (!student.feeProfile || Object.keys(student.feeProfile).length === 0) {
      student.feeProfile = {
        tuitionFee: student.monthlyFee || 0,
        fundFee: 0,
        hostelFee: 0,
        transportFee: 0
      };
      student.totalMonthlyFee = student.monthlyFee || 0;
      await student.save();
      console.log('✅ Initialized fee profile for existing student');
    }

    res.status(200).json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error('❌ Get student fee profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch fee profile'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. GENERATE MONTHLY FEE RECORD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate monthly fee for a student
 * Automatically carries forward previous unpaid dues
 * @route POST /api/admin/student-fees/:studentId/generate-monthly-fee
 */
export const generateMonthlyFee = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const Student = await getModel(req.schoolId, 'students');
    const FeePayment = await getModel(req.schoolId, 'feepayments');

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Check if fee already exists for this month
    const existingFee = await FeePayment.findOne({
      studentId,
      month,
      year
    });

    if (existingFee) {
      return res.status(400).json({
        success: false,
        message: `Fee for ${getMonthName(month)} ${year} already exists`
      });
    }

    // Calculate previous month's unpaid dues
    const previousDues = await calculatePreviousDues(FeePayment, studentId, month, year);

    // Calculate due date
    const dueDate = new Date(year, month - 1, student.feeDueDate || 1);

    // Create fee breakdown from student's fee profile
    const feeBreakdown = {
      tuitionFee: student.feeProfile?.tuitionFee || 0,
      fundFee: student.feeProfile?.fundFee || 0,
      hostelFee: student.feeProfile?.hostelFee || 0,
      transportFee: student.feeProfile?.transportFee || 0
    };

    // Calculate base amount
    const baseAmount =
      feeBreakdown.tuitionFee +
      feeBreakdown.fundFee +
      feeBreakdown.hostelFee +
      feeBreakdown.transportFee;

    // Calculate total (base + previous dues)
    const totalAmount = baseAmount + previousDues;

    // Create monthly fee record
    const feeRecord = await FeePayment.create({
      studentId: student._id,
      classId: student.classId,
      month,
      year,
      amount: baseAmount, // Legacy field
      feeBreakdown,
      previousDues,
      totalAmount,
      dueDate,
      status: 'Pending',
      remainingAmount: totalAmount,
      amountPaid: 0,
      extraCharges: [],
      lateFee: 0,
      fine: 0,
      discount: 0,
      partialPayments: []
    });

    res.status(201).json({
      success: true,
      message: 'Monthly fee generated successfully',
      data: feeRecord
    });
  } catch (error) {
    console.error('Generate monthly fee error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate monthly fee'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. ADD EXTRA CHARGES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add extra charges to existing fee record (books, exams, etc.)
 * @route POST /api/admin/student-fees/:feeId/extra-charges
 */
export const addExtraCharges = async (req, res) => {
  try {
    const { feeId } = req.params;
    const { charges } = req.body; // Array of { name, amount, description }

    if (!charges || !Array.isArray(charges) || charges.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Charges array is required'
      });
    }

    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const feeRecord = await FeePayment.findById(feeId);

    if (!feeRecord) {
      return res.status(404).json({
        success: false,
        message: 'Fee record not found'
      });
    }

    // Add new charges
    const newCharges = charges.map(charge => ({
      name: charge.name,
      amount: charge.amount,
      description: charge.description || '',
      addedBy: req.user.id,
      addedAt: new Date()
    }));

    feeRecord.extraCharges.push(...newCharges);

    // Recalculate total
    const extraTotal = feeRecord.extraCharges.reduce((sum, c) => sum + c.amount, 0);
    const baseAmount =
      (feeRecord.feeBreakdown?.tuitionFee || 0) +
      (feeRecord.feeBreakdown?.fundFee || 0) +
      (feeRecord.feeBreakdown?.hostelFee || 0) +
      (feeRecord.feeBreakdown?.transportFee || 0);

    feeRecord.totalAmount =
      baseAmount +
      extraTotal +
      (feeRecord.previousDues || 0) +
      (feeRecord.lateFee || 0) +
      (feeRecord.fine || 0) -
      (feeRecord.discount || 0);

    feeRecord.remainingAmount = feeRecord.totalAmount - (feeRecord.amountPaid || 0);

    await feeRecord.save();

    res.status(200).json({
      success: true,
      message: 'Extra charges added successfully',
      data: feeRecord
    });
  } catch (error) {
    console.error('Add extra charges error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add extra charges'
    });
  }
};

/**
 * Remove extra charge from fee record
 * @route DELETE /api/admin/student-fees/:feeId/extra-charges/:chargeId
 */
export const removeExtraCharge = async (req, res) => {
  try {
    const { feeId, chargeId } = req.params;

    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const feeRecord = await FeePayment.findById(feeId);

    if (!feeRecord) {
      return res.status(404).json({
        success: false,
        message: 'Fee record not found'
      });
    }

    // Remove charge
    feeRecord.extraCharges = feeRecord.extraCharges.filter(
      c => c._id.toString() !== chargeId
    );

    // Recalculate total
    const extraTotal = feeRecord.extraCharges.reduce((sum, c) => sum + c.amount, 0);
    const baseAmount =
      (feeRecord.feeBreakdown?.tuitionFee || 0) +
      (feeRecord.feeBreakdown?.fundFee || 0) +
      (feeRecord.feeBreakdown?.hostelFee || 0) +
      (feeRecord.feeBreakdown?.transportFee || 0);

    feeRecord.totalAmount =
      baseAmount +
      extraTotal +
      (feeRecord.previousDues || 0) +
      (feeRecord.lateFee || 0) +
      (feeRecord.fine || 0) -
      (feeRecord.discount || 0);

    feeRecord.remainingAmount = feeRecord.totalAmount - (feeRecord.amountPaid || 0);

    await feeRecord.save();

    res.status(200).json({
      success: true,
      message: 'Extra charge removed successfully',
      data: feeRecord
    });
  } catch (error) {
    console.error('Remove extra charge error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove extra charge'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. RECORD PAYMENT (WITHOUT OVERWRITING HISTORY)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record a payment for a fee record
 * Maintains complete payment history using partialPayments array
 * @route POST /api/admin/student-fees/:feeId/record-payment
 */
export const recordPayment = async (req, res) => {
  try {
    const { feeId } = req.params;
    const { amount, paymentMethod, transactionId, remarks, paymentDate } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required'
      });
    }

    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const feeRecord = await FeePayment.findById(feeId);

    if (!feeRecord) {
      return res.status(404).json({
        success: false,
        message: 'Fee record not found'
      });
    }

    if (amount > feeRecord.remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (${amount}) cannot exceed remaining amount (${feeRecord.remainingAmount})`
      });
    }

    // Add payment to history
    feeRecord.partialPayments.push({
      amount,
      paymentDate: paymentDate || new Date(),
      paymentMethod: paymentMethod || 'Cash',
      transactionId: transactionId || '',
      remarks: remarks || '',
      markedBy: req.user.id
    });

    // Update totals
    feeRecord.amountPaid += amount;
    feeRecord.remainingAmount = feeRecord.totalAmount - feeRecord.amountPaid;

    // Update status
    if (feeRecord.remainingAmount <= 0) {
      feeRecord.status = 'Paid';
      feeRecord.paymentDate = paymentDate || new Date();
    } else {
      feeRecord.status = 'Partial';
    }

    feeRecord.markedBy = req.user.id;

    await feeRecord.save();

    res.status(200).json({
      success: true,
      message: 'Payment recorded successfully',
      data: feeRecord
    });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to record payment'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. GET STUDENT FEE HISTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get complete fee history for a student
 * @route GET /api/admin/student-fees/:studentId/history
 */
export const getStudentFeeHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { year } = req.query;

    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const Student = await getModel(req.schoolId, 'students');

    const student = await Student.findById(studentId)
      .select('fullName rollNumber className section feeProfile totalMonthlyFee');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Build query
    const query = { studentId };
    if (year) {
      query.year = parseInt(year);
    }

    const feeRecords = await FeePayment.find(query)
      .sort({ year: -1, month: -1 })
      .populate('markedBy', 'fullName email');

    // Calculate summary
    const summary = {
      totalFees: 0,
      totalPaid: 0,
      totalPending: 0,
      recordCount: feeRecords.length
    };

    feeRecords.forEach(record => {
      summary.totalFees += record.totalAmount || 0;
      summary.totalPaid += record.amountPaid || 0;
      summary.totalPending += record.remainingAmount || 0;
    });

    res.status(200).json({
      success: true,
      data: {
        student,
        summary,
        feeRecords
      }
    });
  } catch (error) {
    console.error('Get student fee history error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch fee history'
    });
  }
};

/**
 * Get single fee record details
 * @route GET /api/admin/student-fees/record/:feeId
 */
export const getFeeRecordDetails = async (req, res) => {
  try {
    const { feeId } = req.params;

    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const feeRecord = await FeePayment.findById(feeId)
      .populate('studentId', 'fullName rollNumber className section')
      .populate('classId', 'className section')
      .populate('markedBy', 'fullName email')
      .populate('partialPayments.markedBy', 'fullName email')
      .populate('extraCharges.addedBy', 'fullName email');

    if (!feeRecord) {
      return res.status(404).json({
        success: false,
        message: 'Fee record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: feeRecord
    });
  } catch (error) {
    console.error('Get fee record details error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch fee record'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate previous unpaid dues for a student
 */
async function calculatePreviousDues(FeePayment, studentId, currentMonth, currentYear) {
  try {
    // Find all unpaid/partial records before this month
    const previousRecords = await FeePayment.find({
      studentId,
      $or: [
        { year: { $lt: currentYear } },
        { year: currentYear, month: { $lt: currentMonth } }
      ],
      status: { $in: ['Pending', 'Partial', 'Overdue'] }
    });

    // Sum up all remaining amounts
    const totalDues = previousRecords.reduce((sum, record) => {
      return sum + (record.remainingAmount || 0);
    }, 0);

    return totalDues;
  } catch (error) {
    console.error('Calculate previous dues error:', error);
    return 0;
  }
}

/**
 * Get month name from number
 */
function getMonthName(monthNumber) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[monthNumber - 1] || 'Unknown';
}
