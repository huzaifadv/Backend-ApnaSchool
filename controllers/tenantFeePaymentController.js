import { validationResult } from 'express-validator';
import { getModel } from '../models/dynamicModels.js';
import School from '../models/School.js';
import { reportToFBR } from '../services/fbrService.js';

/**
 * @desc    Get students with fee status for a class
 * @route   GET /api/admin/fees/class/:classId
 * @access  Private (Admin only)
 */
export const getClassFeeStatus = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { month, year } = req.query;

    // Default to current month and year if not provided
    const currentDate = new Date();
    const selectedMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const selectedYear = year ? parseInt(year) : currentDate.getFullYear();

    const Student = await getModel(req.schoolId, 'students');
    const FeePayment = await getModel(req.schoolId, 'feepayments');

    // Get all students in the class
    const students = await Student.find({ classId, isActive: true })
      .select('fullName rollNumber monthlyFee feeDueDate')
      .sort({ rollNumber: 1 });

    // Get fee payment records for these students for the selected month/year
    const studentIds = students.map(s => s._id);
    const feePayments = await FeePayment.find({
      studentId: { $in: studentIds },
      month: selectedMonth,
      year: selectedYear
    });

    // Create a map of student ID to fee payment
    const feePaymentMap = {};
    feePayments.forEach(payment => {
      feePaymentMap[payment.studentId.toString()] = payment;
    });

    // Combine student data with fee payment status
    const studentsWithFeeStatus = students.map(student => {
      const payment = feePaymentMap[student._id.toString()];

      return {
        _id: student._id,
        fullName: student.fullName,
        rollNumber: student.rollNumber,
        monthlyFee: student.monthlyFee,
        feeDueDate: student.feeDueDate,
        status: payment ? payment.status : 'Pending',
        paymentDate: payment ? payment.paymentDate : null,
        paymentId: payment ? payment._id : null,
        // FBR fields (additive - won't break existing functionality)
        isFbrReported: payment ? payment.isFbrReported : false,
        fbrInvoiceNumber: payment?.fbrData?.invoiceNumber || null,
        fbrStatus: payment?.fbrData?.responseStatus || null
      };
    });

    res.status(200).json({
      success: true,
      month: selectedMonth,
      year: selectedYear,
      count: studentsWithFeeStatus.length,
      data: studentsWithFeeStatus
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark fee payment status for a student
 * @route   POST /api/admin/fees/mark
 * @access  Private (Admin only)
 */
export const markFeePayment = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { studentId, classId, month, year, status, remarks } = req.body;

    const Student = await getModel(req.schoolId, 'students');
    const FeePayment = await getModel(req.schoolId, 'feepayments');

    // Get student to get fee amount and name
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Helper function to generate local invoice number
    const generateInvoiceNumber = async () => {
      // Use last 6 characters of schoolId as identifier
      const schoolIdentifier = req.schoolId.toString().slice(-6).toUpperCase();

      // Get count of invoices for this school to generate sequential number
      const count = await FeePayment.countDocuments({
        schoolId: req.schoolId,
        invoiceNumber: { $ne: null }
      });

      const incrementNumber = String(count + 1).padStart(4, '0');
      return `INV-${schoolIdentifier}-${incrementNumber}`;
    };

    // STEP 1: Always save fee locally first (backward compatible)
    // Check if payment record already exists
    let feePayment = await FeePayment.findOne({
      schoolId: req.schoolId,
      studentId,
      month,
      year
    });

    if (feePayment) {
      // Update existing record
      console.log(`🔄 Updating existing fee payment ID: ${feePayment._id} to status: ${status}`);

      feePayment.status = status;
      feePayment.paymentDate = status === 'Paid' ? new Date() : null;
      feePayment.markedBy = req.admin._id;
      feePayment.remarks = remarks || feePayment.remarks;

      // Generate invoice number if marking as paid and no invoice exists
      if (status === 'Paid' && !feePayment.invoiceNumber) {
        feePayment.invoiceNumber = await generateInvoiceNumber();
      }

      await feePayment.save();
      console.log(`✅ Fee payment updated successfully - Status: ${feePayment.status}, ID: ${feePayment._id}`);
    } else {
      // Create new record
      console.log(`📝 Creating new fee payment record for student ${studentId}`);

      const invoiceNumber = status === 'Paid' ? await generateInvoiceNumber() : null;

      feePayment = await FeePayment.create({
        schoolId: req.schoolId,
        studentId,
        classId,
        month,
        year,
        amount: student.monthlyFee,
        status,
        paymentDate: status === 'Paid' ? new Date() : null,
        markedBy: req.admin._id,
        remarks,
        invoiceNumber
      });

      console.log(`✅ Fee payment created successfully - Status: ${feePayment.status}, ID: ${feePayment._id}`);
    }

    // STEP 2: Conditional FBR Integration (Only if status is 'Paid')
    let fbrResult = null;

    if (status === 'Paid') {
      // Get school FBR configuration
      const school = await School.findById(req.schoolId).select('fbrEnabled fbrConfig schoolName');

      // Check if FBR is enabled and configured
      const isFBREnabled = school?.fbrEnabled === true;
      const isFBRConfigured = !!(
        school?.fbrConfig?.apiUrl &&
        school?.fbrConfig?.posId &&
        school?.fbrConfig?.token &&
        school?.fbrConfig?.registrationNumber
      );

      if (isFBREnabled && isFBRConfigured) {
        // Report to FBR
        console.log(`📤 Reporting fee payment to FBR for student: ${student.fullName}`);

        try {
          fbrResult = await reportToFBR(school, {
            amount: student.monthlyFee,
            studentName: student.fullName
          });

          if (fbrResult.success) {
            // Update fee payment with FBR data
            feePayment.isFbrReported = true;
            feePayment.fbrData = {
              invoiceNumber: fbrResult.invoiceNumber,
              qrCodeString: fbrResult.qrCodeString,
              syncDateTime: fbrResult.syncDateTime,
              responseStatus: 'Success',
              fullResponse: fbrResult.fullResponse
            };
            await feePayment.save();

            console.log(`✅ FBR reporting successful. Invoice: ${fbrResult.invoiceNumber}`);
          } else {
            // FBR call failed - but fee is still recorded locally
            feePayment.isFbrReported = false;
            feePayment.fbrData = {
              syncDateTime: fbrResult.syncDateTime,
              responseStatus: 'Failed',
              fullResponse: fbrResult.fullResponse || { error: fbrResult.error }
            };
            await feePayment.save();

            console.error(`❌ FBR reporting failed: ${fbrResult.error}`);
          }
        } catch (fbrError) {
          // Catch any unexpected errors during FBR call
          console.error('FBR Integration Error:', fbrError);

          feePayment.isFbrReported = false;
          feePayment.fbrData = {
            syncDateTime: new Date(),
            responseStatus: 'Failed',
            fullResponse: { error: fbrError.message }
          };
          await feePayment.save();
        }
      } else {
        // FBR not enabled or not configured - normal behavior (backward compatible)
        console.log('📋 FBR integration not active. Fee recorded locally only.');
      }
    }

    // Populate student and class details for invoice generation
    await feePayment.populate([
      { path: 'studentId', select: 'fullName rollNumber guardianName guardianPhone' },
      { path: 'classId', select: 'className section' }
    ]);

    // Verify data was saved by querying again
    const verifyPayment = await FeePayment.findById(feePayment._id);
    console.log(`🔍 Verification - Fee payment in DB: Status=${verifyPayment.status}, InvoiceCreated=${verifyPayment.invoiceCreated}`);

    // Prepare response
    const response = {
      success: true,
      message: `Fee status marked as ${status}`,
      data: feePayment
    };

    // Include FBR status in response if applicable
    if (fbrResult) {
      response.fbrStatus = {
        reported: fbrResult.success,
        invoiceNumber: fbrResult.invoiceNumber || null,
        error: fbrResult.error || null
      };
    }

    console.log(`📤 Sending response - Status: ${feePayment.status}, InvoiceNumber: ${feePayment.invoiceNumber}, InvoiceCreated: ${feePayment.invoiceCreated}`);

    res.status(200).json(response);

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get fee payment history for a student
 * @route   GET /api/admin/fees/student/:studentId
 * @access  Private (Admin only)
 */
export const getStudentFeeHistory = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const Student = await getModel(req.schoolId, 'students');

    const student = await Student.findById(studentId)
      .select('fullName rollNumber monthlyFee feeDueDate');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const feePayments = await FeePayment.find({ studentId })
      .sort({ year: -1, month: -1 })
      .populate('markedBy', 'name email');

    res.status(200).json({
      success: true,
      student,
      count: feePayments.length,
      data: feePayments
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get fee statistics for a class
 * @route   GET /api/admin/fees/stats/class/:classId
 * @access  Private (Admin only)
 */
export const getClassFeeStats = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { month, year } = req.query;

    const currentDate = new Date();
    const selectedMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const selectedYear = year ? parseInt(year) : currentDate.getFullYear();

    const Student = await getModel(req.schoolId, 'students');
    const FeePayment = await getModel(req.schoolId, 'feepayments');

    // Get total students
    const totalStudents = await Student.countDocuments({ classId, isActive: true });

    // Get fee payments for the month
    const students = await Student.find({ classId, isActive: true }).select('_id monthlyFee');
    const studentIds = students.map(s => s._id);

    const paidPayments = await FeePayment.countDocuments({
      studentId: { $in: studentIds },
      month: selectedMonth,
      year: selectedYear,
      status: 'Paid'
    });

    const totalFeeAmount = students.reduce((sum, student) => sum + (student.monthlyFee || 0), 0);

    const collectedPayments = await FeePayment.find({
      studentId: { $in: studentIds },
      month: selectedMonth,
      year: selectedYear,
      status: 'Paid'
    });

    const collectedAmount = collectedPayments.reduce((sum, payment) => sum + payment.amount, 0);

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        paidCount: paidPayments,
        pendingCount: totalStudents - paidPayments,
        totalFeeAmount,
        collectedAmount,
        pendingAmount: totalFeeAmount - collectedAmount
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a single fee payment record by ID
 * @route   GET /api/admin/fees/payment/:paymentId
 * @access  Private (Admin only)
 */
export const getFeePaymentById = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    const FeePayment = await getModel(req.schoolId, 'feepayments');

    const feePayment = await FeePayment.findById(paymentId)
      .populate('studentId', 'fullName rollNumber guardianName guardianPhone')
      .populate('classId', 'className section');

    if (!feePayment) {
      return res.status(404).json({
        success: false,
        message: 'Fee payment record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: feePayment
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create invoice for a paid fee
 * @route   POST /api/admin/fees/create-invoice/:paymentId
 * @access  Private (Admin only)
 */
export const createInvoice = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    const FeePayment = await getModel(req.schoolId, 'feepayments');

    const feePayment = await FeePayment.findById(paymentId)
      .populate('studentId', 'fullName rollNumber guardianName guardianPhone')
      .populate('classId', 'className section');

    if (!feePayment) {
      return res.status(404).json({
        success: false,
        message: 'Fee payment record not found'
      });
    }

    // Check if fee is paid
    if (feePayment.status !== 'Paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot create invoice for unpaid fee'
      });
    }

    // If invoice already created, return existing invoice data
    if (feePayment.invoiceCreated && feePayment.invoiceNumber) {
      return res.status(200).json({
        success: true,
        message: 'Invoice already exists',
        data: feePayment,
        alreadyCreated: true
      });
    }

    // Helper function to generate local invoice number
    const generateInvoiceNumber = async () => {
      const schoolIdentifier = req.schoolId.toString().slice(-6).toUpperCase();
      const count = await FeePayment.countDocuments({
        schoolId: req.schoolId,
        invoiceNumber: { $ne: null }
      });
      const incrementNumber = String(count + 1).padStart(4, '0');
      return `INV-${schoolIdentifier}-${incrementNumber}`;
    };

    // Generate invoice number if not exists
    if (!feePayment.invoiceNumber) {
      feePayment.invoiceNumber = await generateInvoiceNumber();
    }

    // Mark invoice as created
    feePayment.invoiceCreated = true;
    await feePayment.save();

    console.log(`✅ Invoice created: ${feePayment.invoiceNumber} for student: ${feePayment.studentId.fullName}`);

    res.status(200).json({
      success: true,
      message: 'Invoice created successfully',
      data: feePayment,
      alreadyCreated: false
    });

  } catch (error) {
    next(error);
  }
};

export default {
  getClassFeeStatus,
  markFeePayment,
  getStudentFeeHistory,
  getClassFeeStats,
  getFeePaymentById,
  createInvoice
};
