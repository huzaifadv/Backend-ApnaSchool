/**
 * Migration Script: Single Database → Multi-Tenant Architecture
 *
 * This script migrates existing schools from a shared database
 * to individual tenant databases.
 *
 * Usage:
 *   node backend/scripts/migrateTenants.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { initMainDB, initializeTenantDB, getTenantConnection, getSchoolDBName } from '../config/tenantDB.js';
import { getModel } from '../models/dynamicModels.js';

dotenv.config();

// Import old models
import OldStudent from '../models/Student.js';
import OldClass from '../models/Class.js';
import OldAttendance from '../models/Attendance.js';
import OldNotice from '../models/Notice.js';
import OldReport from '../models/Report.js';

/**
 * Main migration function
 */
async function migrateTenants() {
  try {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  Multi-Tenant Migration Script                         ║');
    console.log('║  Single Database → Isolated Tenant Databases           ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Step 1: Connect to main database
    console.log('[Step 1] Connecting to main database...');
    await initMainDB();
    const mainConnection = await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to main database\n');

    // Step 2: Get all schools
    console.log('[Step 2] Fetching all schools...');
    const School = mainConnection.connection.model('School');
    const schools = await School.find({});
    console.log(`✓ Found ${schools.length} schools to migrate\n`);

    if (schools.length === 0) {
      console.log('No schools found. Migration complete.');
      process.exit(0);
    }

    // Step 3: Migrate each school
    let successCount = 0;
    let failureCount = 0;

    for (const school of schools) {
      try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Migrating: ${school.schoolName} (ID: ${school._id})`);
        console.log(`${'='.repeat(60)}`);

        await migrateSchool(school._id, school.schoolName);
        successCount++;
        console.log(`✓ Successfully migrated ${school.schoolName}`);
      } catch (error) {
        failureCount++;
        console.error(`✗ Failed to migrate ${school.schoolName}:`, error.message);
      }
    }

    // Step 4: Summary
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  Migration Summary                                     ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`Total schools: ${schools.length}`);
    console.log(`✓ Successful: ${successCount}`);
    console.log(`✗ Failed: ${failureCount}`);
    console.log('\nMigration complete!');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

/**
 * Migrate a single school to tenant database
 */
async function migrateSchool(schoolId, schoolName) {
  const dbName = getSchoolDBName(schoolId);

  // Step 1: Initialize tenant database
  console.log(`  [1/6] Initializing tenant database: ${dbName}`);
  await initializeTenantDB(schoolId);
  console.log('  ✓ Tenant database initialized');

  // Step 2: Migrate students
  console.log('  [2/6] Migrating students...');
  const studentCount = await migrateCollection(
    schoolId,
    OldStudent,
    'students',
    { schoolId }
  );
  console.log(`  ✓ Migrated ${studentCount} students`);

  // Step 3: Migrate classes
  console.log('  [3/6] Migrating classes...');
  const classCount = await migrateCollection(
    schoolId,
    OldClass,
    'classes',
    { schoolId }
  );
  console.log(`  ✓ Migrated ${classCount} classes`);

  // Step 4: Migrate attendance
  console.log('  [4/6] Migrating attendance records...');
  const attendanceCount = await migrateCollection(
    schoolId,
    OldAttendance,
    'attendance',
    { schoolId }
  );
  console.log(`  ✓ Migrated ${attendanceCount} attendance records`);

  // Step 5: Migrate notices
  console.log('  [5/6] Migrating notices...');
  const noticeCount = await migrateCollection(
    schoolId,
    OldNotice,
    'notices',
    { schoolId }
  );
  console.log(`  ✓ Migrated ${noticeCount} notices`);

  // Step 6: Migrate reports
  console.log('  [6/6] Migrating reports...');
  const reportCount = await migrateCollection(
    schoolId,
    OldReport,
    'reports',
    { schoolId }
  );
  console.log(`  ✓ Migrated ${reportCount} reports`);

  return {
    students: studentCount,
    classes: classCount,
    attendance: attendanceCount,
    notices: noticeCount,
    reports: reportCount
  };
}

/**
 * Migrate a collection from shared DB to tenant DB
 */
async function migrateCollection(schoolId, OldModel, collectionName, filter) {
  try {
    // Get data from old database
    const oldRecords = await OldModel.find(filter).lean();

    if (oldRecords.length === 0) {
      return 0;
    }

    // Get model from tenant database
    const NewModel = await getModel(schoolId, collectionName);

    // Remove schoolId field (not needed in tenant DB)
    const cleanedRecords = oldRecords.map(record => {
      const { schoolId, ...rest } = record;
      return rest;
    });

    // Insert into tenant database
    await NewModel.insertMany(cleanedRecords, { ordered: false });

    return cleanedRecords.length;
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error - data already exists
      console.log(`    ⚠ Some records already exist in ${collectionName}, skipping duplicates`);
      return 0;
    }
    throw error;
  }
}

/**
 * Rollback function (if needed)
 */
async function rollbackMigration(schoolId) {
  try {
    console.log(`\nRolling back migration for school ${schoolId}...`);

    const connection = await getTenantConnection(schoolId);
    await connection.dropDatabase();

    console.log(`✓ Tenant database deleted: ${getSchoolDBName(schoolId)}`);
  } catch (error) {
    console.error('✗ Rollback failed:', error.message);
  }
}

/**
 * Verify migration (check data integrity)
 */
async function verifyMigration(schoolId) {
  console.log(`\nVerifying migration for school ${schoolId}...`);

  try {
    const Student = await getModel(schoolId, 'students');
    const Class = await getModel(schoolId, 'classes');
    const Attendance = await getModel(schoolId, 'attendance');

    const studentCount = await Student.countDocuments();
    const classCount = await Class.countDocuments();
    const attendanceCount = await Attendance.countDocuments();

    console.log('Verification Results:');
    console.log(`  Students: ${studentCount}`);
    console.log(`  Classes: ${classCount}`);
    console.log(`  Attendance: ${attendanceCount}`);

    // Compare with old database
    const oldStudentCount = await OldStudent.countDocuments({ schoolId });
    const oldClassCount = await OldClass.countDocuments({ schoolId });
    const oldAttendanceCount = await OldAttendance.countDocuments({ schoolId });

    console.log('\nComparison with old database:');
    console.log(`  Students: ${oldStudentCount} → ${studentCount} ${studentCount === oldStudentCount ? '✓' : '✗'}`);
    console.log(`  Classes: ${oldClassCount} → ${classCount} ${classCount === oldClassCount ? '✓' : '✗'}`);
    console.log(`  Attendance: ${oldAttendanceCount} → ${attendanceCount} ${attendanceCount === oldAttendanceCount ? '✓' : '✗'}`);

    return studentCount === oldStudentCount &&
           classCount === oldClassCount &&
           attendanceCount === oldAttendanceCount;
  } catch (error) {
    console.error('✗ Verification failed:', error.message);
    return false;
  }
}

/**
 * Dry run (preview migration without actually migrating)
 */
async function dryRun() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Dry Run - Migration Preview                           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    await initMainDB();
    const mainConnection = await mongoose.connect(process.env.MONGO_URI);
    const School = mainConnection.connection.model('School');
    const schools = await School.find({});

    console.log(`Found ${schools.length} schools:\n`);

    for (const school of schools) {
      const studentCount = await OldStudent.countDocuments({ schoolId: school._id });
      const classCount = await OldClass.countDocuments({ schoolId: school._id });
      const attendanceCount = await OldAttendance.countDocuments({ schoolId: school._id });

      console.log(`${school.schoolName} (${school._id})`);
      console.log(`  Database: ${getSchoolDBName(school._id)}`);
      console.log(`  Students: ${studentCount}`);
      console.log(`  Classes: ${classCount}`);
      console.log(`  Attendance: ${attendanceCount}`);
      console.log('');
    }

    console.log('This is a dry run. No data will be migrated.');
    console.log('Run without --dry-run flag to perform actual migration.');

    process.exit(0);
  } catch (error) {
    console.error('✗ Dry run failed:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerify = args.includes('--verify');
const schoolIdArg = args.find(arg => arg.startsWith('--school='));

if (isDryRun) {
  dryRun();
} else if (isVerify && schoolIdArg) {
  const schoolId = schoolIdArg.split('=')[1];
  initMainDB().then(() => verifyMigration(schoolId));
} else {
  migrateTenants();
}

export { migrateTenants, migrateSchool, verifyMigration, rollbackMigration };
