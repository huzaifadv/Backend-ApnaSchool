import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from backend directory
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { initMainDB, getTenantConnection } from '../config/tenantDB.js';
import School from '../models/School.js';
import { getModel } from '../models/dynamicModels.js';

/**
 * Data Migration Script: Convert Existing Fee Records to New Structure
 *
 * This script migrates existing fee payment records to support the new fee profile system:
 * - Converts simple monthlyFee to feeProfile structure on students
 * - Adds feeBreakdown to existing fee payment records
 * - Ensures backward compatibility
 *
 * SAFE TO RUN MULTIPLE TIMES - Skips already migrated records
 */

async function migrateFeeData() {
  console.log('🚀 Starting Fee Data Migration...\n');

  try {
    // Connect to main database
    await initMainDB();
    console.log('✓ Connected to main database\n');

    // Get all active schools
    const schools = await School.find({ isActive: true, approvalStatus: 'approved' });
    console.log(`📋 Found ${schools.length} active schools to migrate\n`);

    let totalSchoolsMigrated = 0;
    let totalStudentsMigrated = 0;
    let totalFeeRecordsMigrated = 0;

    // Process each school
    for (const school of schools) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: ${school.schoolName} (ID: ${school._id})`);
      console.log('='.repeat(60));

      try {
        const Student = await getModel(school._id, 'students');
        const FeePayment = await getModel(school._id, 'feepayments');

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: Migrate Student Fee Profiles
        // ═══════════════════════════════════════════════════════════════

        console.log('\n[1/2] Migrating Student Fee Profiles...');

        const students = await Student.find({});
        let studentsUpdated = 0;

        for (const student of students) {
          let needsUpdate = false;

          // Check if already has feeProfile
          if (!student.feeProfile || Object.keys(student.feeProfile).length === 0) {
            // Create feeProfile from legacy monthlyFee
            // For now, put everything in tuitionFee (admins can adjust later)
            student.feeProfile = {
              tuitionFee: student.monthlyFee || 0,
              fundFee: 0,
              hostelFee: 0,
              transportFee: 0
            };
            needsUpdate = true;
          }

          // Ensure totalMonthlyFee is set
          if (!student.totalMonthlyFee || student.totalMonthlyFee === 0) {
            student.totalMonthlyFee =
              (student.feeProfile?.tuitionFee || 0) +
              (student.feeProfile?.fundFee || 0) +
              (student.feeProfile?.hostelFee || 0) +
              (student.feeProfile?.transportFee || 0);

            // Fallback to legacy monthlyFee if feeProfile is empty
            if (student.totalMonthlyFee === 0 && student.monthlyFee) {
              student.totalMonthlyFee = student.monthlyFee;
            }
            needsUpdate = true;
          }

          if (needsUpdate) {
            await student.save();
            studentsUpdated++;
          }
        }

        console.log(`   ✓ Updated ${studentsUpdated} of ${students.length} students`);
        totalStudentsMigrated += studentsUpdated;

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: Migrate Fee Payment Records
        // ═══════════════════════════════════════════════════════════════

        console.log('\n[2/2] Migrating Fee Payment Records...');

        const feeRecords = await FeePayment.find({});
        let recordsUpdated = 0;

        for (const record of feeRecords) {
          let needsUpdate = false;

          // Check if already has feeBreakdown
          if (!record.feeBreakdown || Object.keys(record.feeBreakdown).length === 0) {
            // Get student's current fee profile
            const student = await Student.findById(record.studentId);

            if (student && student.feeProfile) {
              // Use student's current feeProfile
              record.feeBreakdown = {
                tuitionFee: student.feeProfile.tuitionFee || 0,
                fundFee: student.feeProfile.fundFee || 0,
                hostelFee: student.feeProfile.hostelFee || 0,
                transportFee: student.feeProfile.transportFee || 0
              };
            } else {
              // Fallback: Put legacy amount in tuitionFee
              record.feeBreakdown = {
                tuitionFee: record.amount || 0,
                fundFee: 0,
                hostelFee: 0,
                transportFee: 0
              };
            }
            needsUpdate = true;
          }

          // Initialize new fields if missing
          if (!record.extraCharges) {
            record.extraCharges = [];
            needsUpdate = true;
          }

          if (record.previousDues === undefined) {
            record.previousDues = 0;
            needsUpdate = true;
          }

          if (record.fine === undefined) {
            record.fine = 0;
            needsUpdate = true;
          }

          // Recalculate totalAmount if needed
          if (needsUpdate) {
            const baseAmount =
              (record.feeBreakdown?.tuitionFee || 0) +
              (record.feeBreakdown?.fundFee || 0) +
              (record.feeBreakdown?.hostelFee || 0) +
              (record.feeBreakdown?.transportFee || 0);

            const extraTotal = (record.extraCharges || []).reduce((sum, c) => sum + (c.amount || 0), 0);

            record.totalAmount =
              baseAmount +
              extraTotal +
              (record.previousDues || 0) +
              (record.lateFee || 0) +
              (record.fine || 0) -
              (record.discount || 0);

            // Ensure remainingAmount is correct
            record.remainingAmount = record.totalAmount - (record.amountPaid || 0);

            await record.save();
            recordsUpdated++;
          }
        }

        console.log(`   ✓ Updated ${recordsUpdated} of ${feeRecords.length} fee records`);
        totalFeeRecordsMigrated += recordsUpdated;

        totalSchoolsMigrated++;
        console.log(`\n✅ Migration complete for ${school.schoolName}`);

      } catch (schoolError) {
        console.error(`\n❌ Error migrating ${school.schoolName}:`, schoolError.message);
        continue; // Skip to next school
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // MIGRATION SUMMARY
    // ═══════════════════════════════════════════════════════════════════

    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✓ Schools processed:        ${totalSchoolsMigrated} of ${schools.length}`);
    console.log(`✓ Students migrated:        ${totalStudentsMigrated}`);
    console.log(`✓ Fee records migrated:     ${totalFeeRecordsMigrated}`);
    console.log('='.repeat(60));
    console.log('\n✅ Migration completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run migration
migrateFeeData();
