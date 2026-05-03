import School from '../models/School.js';
import { getTenantConnection } from '../config/tenantDB.js';
import { getModel } from '../models/dynamicModels.js';

/**
 * Generate monthly fee records for all active students across all schools
 * Runs on 1st of every month via cron job
 */
export const generateMonthlyFeeRecords = async () => {
  try {
    console.log('🚀 Starting monthly fee generation process...');

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const currentYear = currentDate.getFullYear();

    console.log(`📅 Generating fees for: ${currentMonth}/${currentYear}`);

    // Get all active schools from main database
    const schools = await School.find({
      isActive: true,
      isApproved: true
    }).select('_id schoolName');

    if (!schools || schools.length === 0) {
      console.log('⚠️ No active schools found');
      return {
        success: true,
        totalSchools: 0,
        totalStudents: 0,
        message: 'No active schools found'
      };
    }

    console.log(`🏫 Found ${schools.length} active schools`);

    let totalStudentsProcessed = 0;
    let totalRecordsCreated = 0;
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    // Process each school
    for (const school of schools) {
      try {
        console.log(`\n📚 Processing school: ${school.schoolName} (ID: ${school._id})`);

        // Get tenant connection and models
        const Student = await getModel(school._id, 'students');
        const FeePayment = await getModel(school._id, 'feepayments');

        // Get all active students for this school
        const students = await Student.find({ isActive: true })
          .select('_id classId monthlyFee totalMonthlyFee fullName')
          .lean();

        if (!students || students.length === 0) {
          console.log(`⚠️ No active students found for ${school.schoolName}`);
          continue;
        }

        console.log(`👥 Found ${students.length} active students`);

        // Process each student
        for (const student of students) {
          try {
            // Check if fee record already exists for current month
            const existingRecord = await FeePayment.findOne({
              studentId: student._id,
              month: currentMonth,
              year: currentYear
            });

            if (existingRecord) {
              console.log(`⏭️ Skipping ${student.fullName} - record already exists`);
              continue;
            }

            // Get previous month's fee payment to check for remaining balance
            const previousMonthPayment = await FeePayment.findOne({
              studentId: student._id,
              month: previousMonth,
              year: previousYear
            });

            // Recalculate previous remaining from amount - amountPaid (avoids stale remainingAmount)
            const previousRemaining = previousMonthPayment
              ? Math.max(0, (previousMonthPayment.amount || 0) - (previousMonthPayment.amountPaid || 0))
              : 0;
            // Use totalMonthlyFee (new structure) with fallback to legacy monthlyFee
            const currentMonthFee = student.totalMonthlyFee || student.monthlyFee || 0;
            const totalDue = currentMonthFee + previousRemaining;

            // Create new fee record for current month
            await FeePayment.create({
              schoolId: school._id,
              studentId: student._id,
              classId: student.classId,
              month: currentMonth,
              year: currentYear,
              amount: totalDue, // Total due (current + previous remaining)
              amountPaid: 0,
              remainingAmount: totalDue,
              partialPayments: [],
              status: 'Pending',
              paymentDate: null,
              remarks: previousRemaining > 0
                ? `Auto-generated. Includes previous month dues: Rs ${previousRemaining.toLocaleString()}`
                : 'Auto-generated monthly fee record'
            });

            totalRecordsCreated++;

            if (previousRemaining > 0) {
              console.log(`✅ ${student.fullName}: Rs ${currentMonthFee} + Rs ${previousRemaining} (prev) = Rs ${totalDue}`);
            } else {
              console.log(`✅ ${student.fullName}: Rs ${totalDue}`);
            }

          } catch (studentError) {
            console.error(`❌ Error processing student ${student.fullName}:`, studentError.message);
          }
        }

        totalStudentsProcessed += students.length;
        console.log(`✅ School ${school.schoolName} completed: ${students.length} students processed`);

      } catch (schoolError) {
        console.error(`❌ Error processing school ${school.schoolName}:`, schoolError.message);
      }
    }

    console.log(`\n🎉 Monthly fee generation completed!`);
    console.log(`📊 Summary:`);
    console.log(`   - Schools processed: ${schools.length}`);
    console.log(`   - Students processed: ${totalStudentsProcessed}`);
    console.log(`   - Fee records created: ${totalRecordsCreated}`);

    return {
      success: true,
      totalSchools: schools.length,
      totalStudents: totalStudentsProcessed,
      recordsCreated: totalRecordsCreated,
      month: currentMonth,
      year: currentYear
    };

  } catch (error) {
    console.error('❌ Fatal error in monthly fee generation:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Manual trigger for testing (can be called via API route)
 */
export const manualGenerateMonthlyFees = async (req, res) => {
  try {
    console.log('🔧 Manual fee generation triggered');
    const result = await generateMonthlyFeeRecords();

    res.status(200).json({
      success: result.success,
      message: result.success
        ? `Successfully generated fee records for ${result.recordsCreated} students`
        : 'Fee generation failed',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate monthly fees',
      error: error.message
    });
  }
};

export default {
  generateMonthlyFeeRecords,
  manualGenerateMonthlyFees
};
