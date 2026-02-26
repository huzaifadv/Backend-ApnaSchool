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
          amount: student.monthlyFee
        },
        feeHistory
      }
    });

  } catch (error) {
    next(error);
  }
};

export default {
  getParentChildFees
};
