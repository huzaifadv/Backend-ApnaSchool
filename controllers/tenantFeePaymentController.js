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
    const Class = await getModel(req.schoolId, 'classes'); // Register Class model

    // Get all students in the class
    const students = await Student.find({ classId, isActive: true })
      .select('fullName rollNumber monthlyFee feeDueDate classId')
      .sort({ rollNumber: 1 })
      .lean();

    // Manually fetch class info to avoid populate() issues in multi-tenant setup
    let classData = null;
    if (students.length > 0 && students[0].classId) {
      classData = await Class.findById(classId)
        .select('className section')
        .lean();
    }

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

    // Get previous month's unpaid balances
    const previousMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const previousYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

    const previousMonthPayments = await FeePayment.find({
      studentId: { $in: studentIds },
      month: previousMonth,
      year: previousYear
    });

    // Create map of previous month's remaining amounts
    const previousRemainingMap = {};
    previousMonthPayments.forEach(payment => {
      if (payment.remainingAmount > 0) {
        previousRemainingMap[payment.studentId.toString()] = payment.remainingAmount;
      }
    });

    // Combine student data with fee payment status
    const studentsWithFeeStatus = students.map(student => {
      const payment = feePaymentMap[student._id.toString()];
      const previousRemaining = previousRemainingMap[student._id.toString()] || 0;

      // Calculate total due for current month
      const currentMonthFee = student.monthlyFee;
      const totalDue = currentMonthFee + previousRemaining;

      return {
        _id: student._id,
        fullName: student.fullName,
        rollNumber: student.rollNumber,
        monthlyFee: currentMonthFee,
        previousMonthDues: previousRemaining,
        totalDue: totalDue,
        feeDueDate: student.feeDueDate,
        classId: classData, // Use manually fetched classData instead of populated field
        status: payment ? payment.status : 'Pending',
        paymentDate: payment ? payment.paymentDate : null,
        paymentId: payment ? payment._id : null,
        // Partial payment fields
        amountPaid: payment ? (payment.amountPaid || 0) : 0,
        // IMPORTANT: Preserve 0 values for remainingAmount
        remainingAmount: payment ? (payment.remainingAmount !== undefined ? payment.remainingAmount : totalDue) : totalDue,
        partialPayments: payment ? payment.partialPayments || [] : [],
        // FBR fields (additive - won't break existing functionality)
        isFbrReported: payment ? payment.isFbrReported : false,
        fbrInvoiceNumber: payment?.fbrData?.invoiceNumber || null,
        fbrStatus: payment?.fbrData?.responseStatus || null,
        invoiceCreated: payment?.invoiceCreated || false,
        invoiceNumber: payment?.invoiceNumber || null
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

    const { studentId, classId, month, year, status, remarks, amount: paymentAmount } = req.body;

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

    // Get previous month's remaining balance
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;

    const previousMonthPayment = await FeePayment.findOne({
      studentId,
      month: previousMonth,
      year: previousYear
    });

    const previousRemaining = previousMonthPayment?.remainingAmount || 0;
    const totalDue = student.monthlyFee + previousRemaining;

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
      // Update existing record with partial payment
      console.log(`🔄 Updating existing fee payment ID: ${feePayment._id}`);

      // Add to partial payments array if payment amount is provided
      if (paymentAmount && paymentAmount > 0) {
        feePayment.partialPayments.push({
          amount: paymentAmount,
          paymentDate: new Date(),
          remarks,
          markedBy: req.admin._id
        });

        // Update amountPaid
        feePayment.amountPaid = (feePayment.amountPaid || 0) + paymentAmount;

        // Calculate remaining amount (against totalDue)
        feePayment.remainingAmount = totalDue - feePayment.amountPaid;

        // Auto-determine status based on remaining amount
        if (feePayment.remainingAmount <= 0) {
          feePayment.status = 'Paid';
          feePayment.paymentDate = new Date();
        } else if (feePayment.amountPaid > 0) {
          feePayment.status = 'Partial';
        } else {
          feePayment.status = 'Pending';
        }
      } else {
        // Manual status change without payment amount
        feePayment.status = status;
        feePayment.paymentDate = status === 'Paid' ? new Date() : null;

        // IMPORTANT FIX: If manually marking as "Paid", set amountPaid to totalDue
        if (status === 'Paid') {
          feePayment.amountPaid = totalDue;
          feePayment.remainingAmount = 0;
        } else if (status === 'Pending') {
          feePayment.amountPaid = 0;
          feePayment.remainingAmount = totalDue;
        }
        // For 'Partial' status without amount, keep existing amountPaid
      }

      feePayment.markedBy = req.admin._id;
      feePayment.remarks = remarks || feePayment.remarks;

      // Generate invoice number if marking as paid and no invoice exists
      if (feePayment.status === 'Paid' && !feePayment.invoiceNumber) {
        feePayment.invoiceNumber = await generateInvoiceNumber();
      }

      await feePayment.save();
      console.log(`✅ Fee payment updated - Status: ${feePayment.status}, Paid: Rs ${feePayment.amountPaid}, Remaining: Rs ${feePayment.remainingAmount}`);
    } else {
      // Create new record
      console.log(`📝 Creating new fee payment record for student ${studentId}`);

      // Determine amountPaid based on payment amount or status
      let amountPaid = 0;
      if (paymentAmount && paymentAmount > 0) {
        amountPaid = paymentAmount;
      } else if (status === 'Paid') {
        // IMPORTANT FIX: If manually marking as "Paid" without amount, use totalDue
        amountPaid = totalDue;
      }

      const remainingAmount = totalDue - amountPaid;

      // Auto-determine status if payment amount provided
      let finalStatus = status;
      if (paymentAmount && paymentAmount > 0) {
        if (remainingAmount <= 0) {
          finalStatus = 'Paid';
        } else if (amountPaid > 0) {
          finalStatus = 'Partial';
        }
      }

      const invoiceNumber = finalStatus === 'Paid' ? await generateInvoiceNumber() : null;

      const partialPayments = (paymentAmount && paymentAmount > 0) ? [{
        amount: paymentAmount,
        paymentDate: new Date(),
        remarks,
        markedBy: req.admin._id
      }] : [];

      feePayment = await FeePayment.create({
        schoolId: req.schoolId,
        studentId,
        classId,
        month,
        year,
        amount: totalDue, // Store total due (current month + previous dues)
        amountPaid,
        remainingAmount,
        partialPayments,
        status: finalStatus,
        paymentDate: finalStatus === 'Paid' ? new Date() : null,
        markedBy: req.admin._id,
        remarks,
        invoiceNumber
      });

      console.log(`✅ Fee payment created - Status: ${feePayment.status}, Paid: Rs ${feePayment.amountPaid}, Remaining: Rs ${feePayment.remainingAmount}`);
    }

    // STEP 2: Conditional FBR Integration (Only if status is 'Paid')
    let fbrResult = null;

    if (feePayment.status === 'Paid') {
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
      message: `Fee status marked as ${feePayment.status}`,
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
    const Class = await getModel(req.schoolId, 'classes');

    const student = await Student.findById(studentId)
      .select('fullName rollNumber monthlyFee feeDueDate')
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Fetch fee payments without populate (multi-tenant safe)
    const feePayments = await FeePayment.find({ studentId })
      .sort({ year: -1, month: -1 })
      .lean();

    // Manually populate student and class data
    for (const payment of feePayments) {
      if (payment.studentId) {
        payment.studentId = await Student.findById(payment.studentId)
          .select('fullName rollNumber')
          .lean();
      }
      if (payment.classId) {
        payment.classId = await Class.findById(payment.classId)
          .select('className section')
          .lean();
      }
    }

    // Map extraCharges to additionalCharges for frontend compatibility
    // AND auto-fix status based on monthlyFee (not totalFee)
    let statusUpdated = false;
    for (const payment of feePayments) {
      payment.additionalCharges = (payment.extraCharges || []).map(charge => ({
        label: charge.name,  // DB uses 'name', frontend expects 'label'
        amount: charge.amount,
        status: charge.status || 'pending',
        _id: charge._id
      }));

      // Auto-fix status if needed (based on monthlyFee only, not total)
      if (payment.monthlyFee && payment.amountPaid !== undefined) {
        const correctRemaining = payment.monthlyFee - payment.amountPaid;
        let correctStatus = 'Pending';

        if (correctRemaining <= 0) {
          correctStatus = 'Paid';
        } else if (payment.amountPaid > 0) {
          correctStatus = 'Partial';
        }

        console.log(`🔍 Checking payment ${payment._id}:`, {
          monthlyFee: payment.monthlyFee,
          amountPaid: payment.amountPaid,
          correctRemaining,
          currentStatus: payment.status,
          correctStatus
        });

        // Update if status is incorrect
        if (payment.status !== correctStatus) {
          console.log(`⚠️ Status mismatch! Current: ${payment.status}, Should be: ${correctStatus}`);
          const paymentDoc = await FeePayment.findById(payment._id);
          if (paymentDoc) {
            paymentDoc.status = correctStatus;
            paymentDoc.remainingAmount = correctRemaining;
            if (correctStatus === 'Paid' && !paymentDoc.paymentDate) {
              paymentDoc.paymentDate = new Date();
            }
            await paymentDoc.save();
            payment.status = correctStatus;
            payment.remainingAmount = correctRemaining;
            statusUpdated = true;
            console.log(`✅ Auto-fixed status for payment ${payment._id}: ${correctStatus}`);
          }
        }
      }
    }

    if (statusUpdated) {
      console.log('🔧 Some payment statuses were auto-corrected');
    }

    console.log('📊 Fee Payments Data Sample:', feePayments[0]); // Debug log

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
    const Student = await getModel(req.schoolId, 'students');
    const Class = await getModel(req.schoolId, 'classes');

    const feePayment = await FeePayment.findById(paymentId).lean();

    if (!feePayment) {
      return res.status(404).json({
        success: false,
        message: 'Fee payment record not found'
      });
    }

    // Manually populate student data
    if (feePayment.studentId) {
      feePayment.studentId = await Student.findById(feePayment.studentId)
        .select('fullName rollNumber guardianName guardianPhone parentName parentPhone monthlyFee')
        .lean();
    }

    // Manually populate class data
    if (feePayment.classId) {
      feePayment.classId = await Class.findById(feePayment.classId)
        .select('className section')
        .lean();
    }

    // Map extraCharges to additionalCharges for frontend compatibility
    // Also map 'name' back to 'label' for frontend
    feePayment.additionalCharges = (feePayment.extraCharges || []).map(charge => ({
      label: charge.name,
      amount: charge.amount,
      status: charge.status || 'pending',
      _id: charge._id
    }));

    console.log('📄 Sending fee payment to invoice:', {
      id: feePayment._id,
      studentName: feePayment.studentId?.fullName,
      monthlyFee: feePayment.studentId?.monthlyFee,
      amountPaid: feePayment.amountPaid,
      remainingAmount: feePayment.remainingAmount,
      additionalCharges: feePayment.additionalCharges,
      totalFee: feePayment.totalFee
    });

    res.status(200).json({
      success: true,
      data: feePayment
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create invoice for a paid fee with additional charges
 * @route   POST /api/admin/fees/create-invoice/:paymentId
 * @access  Private (Admin only)
 */
export const createInvoice = async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const { additionalCharges = [], dueDate, note } = req.body;

    console.log('📝 Creating invoice with additionalCharges (frontend name):', additionalCharges);

    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const Student = await getModel(req.schoolId, 'students');
    const Class = await getModel(req.schoolId, 'classes');

    const feePayment = await FeePayment.findById(paymentId);

    if (!feePayment) {
      return res.status(404).json({
        success: false,
        message: 'Fee payment record not found'
      });
    }

    // Check if fee is paid or partially paid (amountPaid > 0)
    if (feePayment.amountPaid <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create invoice when no payment has been made'
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

    // Calculate monthly fee from student record
    const monthlyFee = feePayment.studentId?.monthlyFee || feePayment.amount || 0;

    // Calculate additional charges total
    const additionalTotal = additionalCharges.reduce((sum, charge) => {
      return sum + (parseFloat(charge.amount) || 0);
    }, 0);

    // Total fee is ONLY monthly fee (additional charges stored separately)
    const totalFee = monthlyFee;

    // Map 'label' to 'name' for database compatibility
    const mappedCharges = additionalCharges.map(charge => ({
      name: charge.label || charge.name,
      amount: charge.amount,
      status: charge.status || 'pending'
    }));

    // Update fee payment with invoice data
    feePayment.monthlyFee = monthlyFee;
    feePayment.extraCharges = mappedCharges; // Save as extraCharges (DB field name)
    feePayment.markModified('extraCharges'); // Force Mongoose to save array
    feePayment.totalFee = totalFee;
    feePayment.amount = totalFee; // Amount is only monthly fee
    feePayment.dueDate = dueDate || feePayment.dueDate;
    feePayment.note = note || feePayment.note;

    console.log('💾 Saving fee payment with:');
    console.log('   📊 Monthly Fee:', monthlyFee);
    console.log('   💰 Extra Charges (DB field):', additionalCharges);
    console.log('   📈 Additional Total:', additionalTotal);
    console.log('   💵 Total Fee:', totalFee);

    // Recalculate remaining amount based on MONTHLY FEE only (not total with additional charges)
    feePayment.remainingAmount = monthlyFee - (feePayment.amountPaid || 0);

    // Update status based on remaining amount (only monthly fee matters for status)
    if (feePayment.remainingAmount <= 0) {
      feePayment.status = 'Paid';
      if (!feePayment.paymentDate) {
        feePayment.paymentDate = new Date();
      }
    } else if (feePayment.amountPaid > 0) {
      feePayment.status = 'Partial';
    }

    // Generate invoice number if not exists
    if (!feePayment.invoiceNumber) {
      feePayment.invoiceNumber = await generateInvoiceNumber();
    }

    // Mark invoice as created
    feePayment.invoiceCreated = true;
    await feePayment.save();

    // Verify what was saved to database
    const savedPayment = await FeePayment.findById(paymentId).lean();
    console.log('✅ Verification - Data saved to database:');
    console.log('   📊 monthlyFee:', savedPayment.monthlyFee);
    console.log('   💰 extraCharges:', savedPayment.extraCharges);
    console.log('   💵 totalFee:', savedPayment.totalFee);
    console.log('   🔢 amount:', savedPayment.amount);

    // Manually populate student and class data for response
    const studentData = await Student.findById(feePayment.studentId)
      .select('fullName rollNumber guardianName guardianPhone monthlyFee')
      .lean();
    const classData = await Class.findById(feePayment.classId)
      .select('className section')
      .lean();

    // Create response object with populated data
    const responseData = feePayment.toObject();
    responseData.studentId = studentData;
    responseData.classId = classData;

    // Map extraCharges to additionalCharges for frontend compatibility
    // Also map 'name' back to 'label' for frontend
    responseData.additionalCharges = (responseData.extraCharges || []).map(charge => ({
      label: charge.name,
      amount: charge.amount,
      status: charge.status || 'pending',
      _id: charge._id
    }));

    console.log(`✅ Invoice created: ${feePayment.invoiceNumber}`);
    console.log(`📤 Sending additionalCharges to frontend:`, responseData.additionalCharges);

    res.status(200).json({
      success: true,
      message: 'Invoice created successfully',
      data: responseData,
      alreadyCreated: false
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update invoice data (for editing)
 * @route   PUT /api/admin/fees/update-invoice/:paymentId
 * @access  Private (Admin only)
 */
export const updateInvoice = async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const { invoiceData } = req.body;

    console.log('📝 Updating invoice with data:', invoiceData);
    console.log('📝 Additional charges received:', invoiceData?.additionalCharges);

    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const Student = await getModel(req.schoolId, 'students');
    const Class = await getModel(req.schoolId, 'classes');

    const feePayment = await FeePayment.findById(paymentId);

    if (!feePayment) {
      return res.status(404).json({
        success: false,
        message: 'Fee payment record not found'
      });
    }

    // Update invoice fields
    if (invoiceData) {
      // Update extra charges (database field is 'extraCharges', not 'additionalCharges')
      if (invoiceData.additionalCharges !== undefined) {
        console.log('📦 Before update - feePayment.extraCharges:', feePayment.extraCharges);

        // Map 'label' to 'name' for database compatibility
        const mappedCharges = invoiceData.additionalCharges.map(charge => ({
          name: charge.label || charge.name,
          amount: charge.amount,
          status: charge.status || 'pending'
        }));

        // Save as 'extraCharges' to match database field
        feePayment.extraCharges = mappedCharges;
        // Mark as modified to ensure Mongoose saves it
        feePayment.markModified('extraCharges');
        console.log('📦 After update - feePayment.extraCharges:', feePayment.extraCharges);
        console.log('✅ Extra charges updated and marked modified:', mappedCharges);
      } else {
        console.log('⚠️ No additionalCharges in invoiceData!');
      }

      // Update monthlyFee if provided
      if (invoiceData.monthlyFee !== undefined) {
        feePayment.monthlyFee = invoiceData.monthlyFee;
      }

      // Update totalFee and amount
      if (invoiceData.totalFee !== undefined) {
        feePayment.totalFee = invoiceData.totalFee;
        feePayment.amount = invoiceData.totalFee;
      }

      // Update amountPaid if changed
      if (invoiceData.amountPaid !== undefined) {
        feePayment.amountPaid = invoiceData.amountPaid;
      }

      // Update due date
      if (invoiceData.dueDate !== undefined) {
        feePayment.dueDate = invoiceData.dueDate;
      }

      // Update note
      if (invoiceData.note !== undefined) {
        feePayment.note = invoiceData.note;
      }

      // Recalculate remaining amount based on MONTHLY FEE only (not total with additional charges)
      feePayment.remainingAmount = feePayment.monthlyFee - feePayment.amountPaid;

      // Update status based on remaining amount (only monthly fee matters for status)
      if (feePayment.remainingAmount <= 0) {
        feePayment.status = 'Paid';
        if (!feePayment.paymentDate) {
          feePayment.paymentDate = new Date();
        }
      } else if (feePayment.amountPaid > 0) {
        feePayment.status = 'Partial';
      } else {
        feePayment.status = 'Pending';
      }
    }

    // Generate invoice number if not exists
    if (!feePayment.invoiceNumber) {
      // Generate a unique invoice number (same logic as createInvoice)
      const schoolIdentifier = req.schoolId.toString().slice(-6).toUpperCase();
      const count = await FeePayment.countDocuments({
        invoiceNumber: { $exists: true, $ne: null }
      });
      const sequenceNumber = (count + 1).toString().padStart(4, '0');
      feePayment.invoiceNumber = `INV-${schoolIdentifier}-${sequenceNumber}`;
      console.log(`📋 Generated invoice number: ${feePayment.invoiceNumber}`);
    }

    // Mark invoice as created (this is crucial for parent portal to show invoice)
    feePayment.invoiceCreated = true;

    const savedPayment = await feePayment.save();
    console.log('💾 Mongoose save result - extraCharges:', savedPayment.extraCharges);

    // Verify the save was successful and check extra charges
    const verifiedPayment = await FeePayment.findById(paymentId).lean();
    console.log(`✅ Invoice saved successfully: ${verifiedPayment.invoiceNumber}`);
    console.log(`   Invoice Created Flag: ${verifiedPayment.invoiceCreated}`);
    console.log(`   Extra Charges Saved:`, verifiedPayment.extraCharges);

    // Manually populate student and class data for response
    const studentData = await Student.findById(feePayment.studentId)
      .select('fullName rollNumber guardianName guardianPhone monthlyFee feeDueDate')
      .lean();
    const classData = await Class.findById(feePayment.classId)
      .select('className section')
      .lean();

    // Create response object with populated data
    const responseData = feePayment.toObject();
    responseData.studentId = studentData;
    responseData.classId = classData;

    // Map extraCharges to additionalCharges for frontend compatibility
    // Also map 'name' back to 'label' for frontend
    responseData.additionalCharges = (responseData.extraCharges || []).map(charge => ({
      label: charge.name,
      amount: charge.amount,
      status: charge.status || 'pending',
      _id: charge._id
    }));

    console.log('📤 Sending response with additionalCharges:', responseData.additionalCharges);

    res.status(200).json({
      success: true,
      message: 'Invoice updated successfully',
      data: responseData
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get invoice history for a student (all months/years)
 * @route   GET /api/admin/fees/invoice-history/:studentId
 * @access  Private (Admin only)
 */
export const getInvoiceHistory = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    console.log('📋 Fetching invoice history for student:', studentId);
    console.log('🏫 School ID:', req.schoolId);

    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const Student = await getModel(req.schoolId, 'students');

    // Verify student exists
    const student = await Student.findById(studentId)
      .select('fullName rollNumber monthlyFee');

    if (!student) {
      console.log('❌ Student not found:', studentId);
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    console.log('✅ Student found:', student.fullName);

    // Get Class and Admin models from tenant database
    const Class = await getModel(req.schoolId, 'classes');
    const Admin = await getModel(req.schoolId, 'admins');

    // Get all fee payment records for this student (including those with partial payments)
    const invoices = await FeePayment.find({
      studentId,
      $or: [
        { invoiceCreated: true },
        { 'partialPayments.0': { $exists: true } }, // Has at least one payment
        { amountPaid: { $gt: 0 } } // Has some amount paid
      ]
    })
      .populate({
        path: 'classId',
        select: 'className section',
        model: Class
      })
      .populate({
        path: 'markedBy',
        select: 'name email',
        model: Admin
      })
      .sort({ year: -1, month: -1 });

    console.log(`📊 Found ${invoices.length} payment records`);

    res.status(200).json({
      success: true,
      student,
      count: invoices.length,
      data: invoices
    });

  } catch (error) {
    console.error('❌ Error in getInvoiceHistory:', error);
    next(error);
  }
};

/**
 * @desc    Record a payment and prepare for invoice (NEW SIMPLIFIED FLOW)
 * @route   POST /api/admin/fees/record-payment
 * @access  Private (Admin only)
 */
export const recordPayment = async (req, res, next) => {
  try {
    const { studentId, classId, month, year, amountPaid, remarks } = req.body;

    console.log('📥 Record payment request:', {
      studentId,
      classId,
      month,
      year,
      amountPaid,
      remarks,
      schoolId: req.schoolId
    });

    // Validation
    if (!studentId || !classId || !month || !year || amountPaid === undefined) {
      console.log('❌ Validation failed - missing fields');
      return res.status(400).json({
        success: false,
        message: 'Student ID, Class ID, Month, Year, and Amount Paid are required',
        received: { studentId, classId, month, year, amountPaid }
      });
    }

    if (amountPaid <= 0) {
      console.log('❌ Validation failed - invalid amount');
      return res.status(400).json({
        success: false,
        message: 'Amount paid must be greater than 0',
        received: { amountPaid }
      });
    }

    const Student = await getModel(req.schoolId, 'students');
    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const Class = await getModel(req.schoolId, 'classes');

    // Get student details
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Get previous month's remaining balance
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;

    const previousMonthPayment = await FeePayment.findOne({
      studentId,
      month: previousMonth,
      year: previousYear
    });

    const previousRemaining = previousMonthPayment?.remainingAmount || 0;
    const totalDue = student.monthlyFee + previousRemaining;

    console.log('💰 Fee Calculation:', {
      currentMonthFee: student.monthlyFee,
      previousMonthDues: previousRemaining,
      totalDue: totalDue
    });

    // Check if payment record already exists for this month/year
    console.log('🔍 Searching for existing payment:', {
      schoolId: req.schoolId,
      studentId,
      month,
      year
    });

    let feePayment = await FeePayment.findOne({
      studentId,
      month,
      year
    });

    console.log('🔍 Existing payment found:', feePayment ? 'YES' : 'NO');
    if (feePayment) {
      console.log('📝 Existing payment details:', {
        id: feePayment._id,
        currentAmountPaid: feePayment.amountPaid,
        currentStatus: feePayment.status
      });
    }

    if (feePayment) {
      // Update existing record - add to partial payments
      console.log('♻️ Updating existing payment record...');

      feePayment.partialPayments.push({
        amount: amountPaid,
        paymentDate: new Date(),
        remarks,
        markedBy: req.admin._id
      });

      feePayment.amountPaid = (feePayment.amountPaid || 0) + amountPaid;
      feePayment.remainingAmount = totalDue - feePayment.amountPaid;

      // Auto-determine status
      if (feePayment.remainingAmount <= 0) {
        feePayment.status = 'Paid';
        feePayment.paymentDate = new Date();
      } else if (feePayment.amountPaid > 0) {
        feePayment.status = 'Partial';
      } else {
        feePayment.status = 'Pending';
      }

      feePayment.markedBy = req.admin._id;
      feePayment.remarks = remarks || feePayment.remarks;

      await feePayment.save();

      console.log(`✅ Payment recorded - Amount: Rs ${amountPaid}, Total Paid: Rs ${feePayment.amountPaid}, Remaining: Rs ${feePayment.remainingAmount}`);
    } else {
      // Create new payment record
      const remainingAmount = totalDue - amountPaid;
      let status = 'Pending';

      if (remainingAmount <= 0) {
        status = 'Paid';
      } else if (amountPaid > 0) {
        status = 'Partial';
      }

      feePayment = await FeePayment.create({
        schoolId: req.schoolId,
        studentId,
        classId,
        month,
        year,
        amount: totalDue, // Store total due (current month + previous dues)
        amountPaid,
        remainingAmount,
        partialPayments: [{
          amount: amountPaid,
          paymentDate: new Date(),
          remarks,
          markedBy: req.admin._id
        }],
        status,
        paymentDate: status === 'Paid' ? new Date() : null,
        markedBy: req.admin._id,
        remarks
      });

      console.log(`✅ New payment record created - Amount: Rs ${amountPaid}, Total Due: Rs ${totalDue}, Remaining: Rs ${feePayment.remainingAmount}`);
    }

    // Manually populate student and class details (multi-tenant safe)
    const studentData = await Student.findById(feePayment.studentId)
      .select('fullName rollNumber guardianName guardianPhone parentName parentPhone monthlyFee')
      .lean();
    const classData = await Class.findById(feePayment.classId)
      .select('className section')
      .lean();

    // Create response object with populated data
    const responseData = feePayment.toObject();
    responseData.studentId = studentData;
    responseData.classId = classData;

    // Verify data was saved by querying again
    const verifyPayment = await FeePayment.findById(feePayment._id);
    console.log(`🔍 Verification - Payment in DB:`, {
      id: verifyPayment._id,
      status: verifyPayment.status,
      amountPaid: verifyPayment.amountPaid,
      remainingAmount: verifyPayment.remainingAmount,
      invoiceCreated: verifyPayment.invoiceCreated
    });

    res.status(200).json({
      success: true,
      message: `Payment of Rs ${amountPaid} recorded successfully`,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Record payment error:', error);

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Payment record already exists for this student in this month. Please refresh the page.',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message
    });
  }
};

/**
 * @desc    Delete payment record completely (invoice + payment data)
 * @route   DELETE /api/admin/fees/delete-invoice/:paymentId
 * @access  Private (Admin only)
 */
export const deleteInvoice = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    console.log('🗑️ Deleting payment record completely:', paymentId);

    const FeePayment = await getModel(req.schoolId, 'feepayments');

    // Find the payment record (no populate — tenant DB doesn't register Class/Student on the same connection)
    const payment = await FeePayment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    // Store details for logging before deletion
    const deletedData = {
      invoiceNumber: payment.invoiceNumber,
      studentName: payment.studentId?.toString(),
      month: payment.month,
      year: payment.year,
      amountPaid: payment.amountPaid,
      status: payment.status,
      remainingAmount: payment.remainingAmount
    };

    console.log('📋 Payment record to delete:', deletedData);

    // IMPORTANT: Complete deletion - remove entire payment record from database
    await FeePayment.findByIdAndDelete(paymentId);

    console.log('✅ Payment record deleted completely:', {
      paymentId,
      deletedInvoiceNumber: deletedData.invoiceNumber,
      deletedAmountPaid: deletedData.amountPaid,
      deletedStatus: deletedData.status
    });

    res.status(200).json({
      success: true,
      message: `Payment record and invoice deleted successfully. Student: ${deletedData.studentName}, Month: ${deletedData.month}/${deletedData.year}`,
      deletedData: deletedData
    });

  } catch (error) {
    console.error('❌ Failed to delete payment record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete payment record',
      error: error.message
    });
  }
};

/**
 * @desc    Get school-wide fee analytics
 * @route   GET /api/admin/fees/analytics
 * @access  Private (Admin only)
 */
export const getFeeAnalytics = async (req, res, next) => {
  try {
    const FeePayment = await getModel(req.schoolId, 'feepayments');
    const Student    = await getModel(req.schoolId, 'students');
    const Class      = await getModel(req.schoolId, 'classes');

    const allPayments = await FeePayment.find({}).lean();
    const allStudents = await Student.find({}).select('monthlyFee totalMonthlyFee').lean();

    // Only count payments belonging to currently active (existing) students
    const activeStudentIds = new Set(allStudents.map(s => s._id.toString()));
    const validPayments = allPayments.filter(p => p.studentId && activeStudentIds.has(p.studentId.toString()));

    // Sum of all students' monthly fees (total expected per month)
    const totalMonthlyFees = allStudents.reduce((s, st) => s + (st.totalMonthlyFee || st.monthlyFee || 0), 0);

    const totalCollected = validPayments.reduce((s, p) => s + (p.amountPaid || 0), 0);
    // Recalculate pending from (amount - amountPaid) to avoid stale remainingAmount values
    const totalPending   = validPayments.reduce((s, p) => s + Math.max(0, (p.amount || 0) - (p.amountPaid || 0)), 0);
    const totalStudents  = allStudents.length;
    const paidCount      = validPayments.filter(p => p.status === 'Paid').length;
    const partialCount   = validPayments.filter(p => p.status === 'Partial').length;
    const pendingCount   = validPayments.filter(p => p.status === 'Pending').length;

    // Last 12 months monthly breakdown
    const now = new Date();
    const monthly = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const recs = validPayments.filter(p => p.month === m && p.year === y);
      monthly.push({
        label: d.toLocaleString('default', { month: 'short' }) + ' ' + String(y).slice(2),
        month: m,
        year: y,
        collected: Math.round(recs.reduce((s, p) => s + (p.amountPaid || 0), 0)),
        pending:   Math.round(recs.reduce((s, p) => s + Math.max(0, (p.amount || 0) - (p.amountPaid || 0)), 0)),
        count:     recs.length,
      });
    }

    // Per-class breakdown
    const classes = await Class.find({}).select('className section').lean();
    const classSummary = await Promise.all(classes.map(async (cls) => {
      const studs    = await Student.find({ classId: cls._id }).select('_id').lean();
      const clsIdStr = cls._id.toString();
      // Use classId on the payment record directly, only for active students
      const recs = validPayments.filter(p => p.classId && p.classId.toString() === clsIdStr);
      return {
        className: `${cls.className}-${cls.section}`,
        collected: Math.round(recs.reduce((s, p) => s + (p.amountPaid || 0), 0)),
        pending:   Math.round(recs.reduce((s, p) => s + Math.max(0, (p.amount || 0) - (p.amountPaid || 0)), 0)),
        students:  studs.length,
      };
    }));

    res.status(200).json({
      success: true,
      data: {
        summary: { totalMonthlyFees, totalCollected, totalPending, totalStudents, paidCount, partialCount, pendingCount },
        monthly,
        classSummary: classSummary.sort((a, b) => b.collected - a.collected),
      }
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
  createInvoice,
  updateInvoice,
  getInvoiceHistory,
  recordPayment,
  deleteInvoice,
  getFeeAnalytics,
};
