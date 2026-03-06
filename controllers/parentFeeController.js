import { getModel } from '../models/dynamicModels.js';

/**
 * @desc    Get fee details for parent's child
 * @route   GET /api/parent/fees
 * @access  Private (Parent only)
 */
export const getParentChildFees = async (req, res, next) => {
  try {
    console.log('Parent Fee Controller - req.studentId:', req.studentId);
    console.log('Parent Fee Controller - req.schoolId:', req.schoolId);

    const Student    = await getModel(req.schoolId, 'students');
    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const Class      = await getModel(req.schoolId, 'classes');   // register before manual fetch

    // Get student details (lean — no populate, manual fetch below)
    const student = await Student.findById(req.studentId)
      .select('fullName rollNumber monthlyFee feeDueDate classId')
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Manually fetch class info to avoid MissingSchemaError
    let classData = null;
    if (student.classId) {
      classData = await Class.findById(student.classId)
        .select('className section').lean();
    }

    // Get current month and year
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Get current month fee status
    const currentMonthFee = await FeePayment.findOne({
      studentId: student._id,
      month: currentMonth,
      year: currentYear
    });

    console.log('Current month fee:', currentMonthFee);

    // Get all fee payment history (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const feeHistory = await FeePayment.find({
      studentId: student._id,
      $or: [
        { year: currentYear },
        { year: currentYear - 1, month: { $gte: currentMonth } }
      ]
    }).sort({ year: -1, month: -1 });

    console.log('Fee history count:', feeHistory.length);

    // Include invoice data in fee history
    const feeHistoryWithInvoice = feeHistory.map(fee => ({
      _id: fee._id,
      month: fee.month,
      year: fee.year,
      amount: fee.amount,
      amountPaid: fee.amountPaid,
      remainingAmount: fee.remainingAmount,
      status: fee.status,
      paymentDate: fee.paymentDate,
      invoiceNumber: fee.invoiceNumber,
      invoiceCreated: fee.invoiceCreated,
      partialPayments: fee.partialPayments
    }));

    res.status(200).json({
      success: true,
      data: {
        student: {
          fullName:   student.fullName,
          rollNumber: student.rollNumber,
          class:      classData ? `${classData.className}-${classData.section}` : 'N/A',
          monthlyFee: student.monthlyFee,
          feeDueDate: student.feeDueDate
        },
        currentMonth: {
          month: currentMonth,
          year: currentYear,
          status: currentMonthFee ? currentMonthFee.status : 'Pending',
          paymentDate: currentMonthFee ? currentMonthFee.paymentDate : null,
          amount: student.monthlyFee,
          invoiceNumber: currentMonthFee ? currentMonthFee.invoiceNumber : null,
          invoiceCreated: currentMonthFee ? currentMonthFee.invoiceCreated : false,
          paymentId: currentMonthFee ? currentMonthFee._id : null
        },
        feeHistory: feeHistoryWithInvoice
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get invoice details for a specific payment
 * @route   GET /api/parent/fees/invoice/:paymentId
 * @access  Private (Parent only)
 */
export const getParentInvoice = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const Student    = await getModel(req.schoolId, 'students');
    const Class      = await getModel(req.schoolId, 'classes');

    // Find the fee payment record
    const payment = await FeePayment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Verify this payment belongs to the parent's child
    if (payment.studentId.toString() !== req.studentId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this invoice'
      });
    }

    // Check if invoice has been created
    if (!payment.invoiceCreated) {
      return res.status(400).json({
        success: false,
        message: 'Invoice has not been created yet'
      });
    }

    // Get student and class details
    const student = await Student.findById(payment.studentId)
      .select('fullName rollNumber fatherName motherName monthlyFee')
      .lean();

    const classData = await Class.findById(payment.classId)
      .select('className section')
      .lean();

    // Parse invoice metadata from remarks field
    let invoiceMetadata = {};
    try {
      if (payment.remarks && payment.remarks.includes('---INVOICE_METADATA---')) {
        // Extract JSON part after the metadata marker
        const metadataStart = payment.remarks.indexOf('---INVOICE_METADATA---');
        const metadataString = payment.remarks.substring(metadataStart + '---INVOICE_METADATA---'.length + 1);
        invoiceMetadata = JSON.parse(metadataString.trim());
      }
    } catch (e) {
      // If remarks is not JSON or parsing fails, use default structure
      console.log('Failed to parse invoice metadata:', e.message);
      invoiceMetadata = {};
    }

    res.status(200).json({
      success: true,
      data: {
        _id: payment._id,
        invoiceNumber: payment.invoiceNumber,
        student: {
          fullName: student.fullName,
          rollNumber: student.rollNumber,
          fatherName: student.fatherName,
          motherName: student.motherName,
          class: classData ? `${classData.className}-${classData.section}` : 'N/A'
        },
        month: payment.month,
        year: payment.year,
        monthlyFee: invoiceMetadata.monthlyFee || student.monthlyFee || payment.amount,
        additionalCharges: invoiceMetadata.additionalCharges || [],
        totalFee: payment.amount,
        amountPaid: payment.amountPaid,
        remainingAmount: payment.remainingAmount,
        status: payment.status,
        paymentDate: payment.paymentDate,
        dueDate: invoiceMetadata.dueDate || null,
        note: invoiceMetadata.note || '',
        partialPayments: payment.partialPayments || []
      }
    });

  } catch (error) {
    next(error);
  }
};

export default {
  getParentChildFees,
  getParentInvoice
};
