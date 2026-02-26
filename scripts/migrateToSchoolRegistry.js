/**
 * Migration Script: Populate SchoolRegistry from existing School collection
 * Run this once to initialize the SchoolRegistry with existing schools
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import School from '../models/School.js';
import SchoolRegistry from '../models/SchoolRegistry.js';
import Admin from '../models/Admin.js';

dotenv.config();

const migrateToSchoolRegistry = async () => {
  try {
    console.log('\n===========================================');
    console.log('   MIGRATING SCHOOLS TO REGISTRY');
    console.log('===========================================\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB\n');
    console.log('Database:', mongoose.connection.db.databaseName);
    console.log('');

    // Get all schools
    const schools = await School.find();
    console.log(`Found ${schools.length} schools to migrate\n`);

    if (schools.length === 0) {
      console.log('⚠ No schools found in database');
      console.log('===========================================\n');
      await mongoose.connection.close();
      process.exit(0);
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const school of schools) {
      try {
        // Check if school already exists in registry
        const existingEntry = await SchoolRegistry.findOne({ schoolId: school._id });

        if (existingEntry) {
          console.log(`⏭  Skipping: ${school.name} (already in registry)`);
          skipped++;
          continue;
        }

        // Count admins for this school
        const adminCount = await Admin.countDocuments({ school: school._id });

        // Create registry entry
        const registryEntry = await SchoolRegistry.create({
          schoolId: school._id,
          schoolName: school.name,
          schoolEmail: school.email,
          schoolPhone: school.phone || '',
          schoolAddress: school.address || '',

          // Default plan settings (can be updated later)
          selectedPlan: 'FREE',
          planType: 'trial',
          planStartDate: school.createdAt || new Date(),
          // 30-day trial by default
          planEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          trialActive: true,

          // Approval based on current status
          approvalStatus: school.isActive ? 'approved' : 'pending',
          accountStatus: school.isActive ? 'active' : 'deactivated',

          // Usage stats
          totalAdmins: adminCount,
          totalStudents: 0, // Will be updated separately
          totalParents: 0,

          // Contact info
          primaryContactName: school.name,
          primaryContactEmail: school.email,
          primaryContactPhone: school.phone || '',

          // Metadata
          registrationSource: 'admin',
          notes: 'Migrated from existing school database',
        });

        console.log(`✓ Migrated: ${school.name}`);
        console.log(`  - Email: ${school.email}`);
        console.log(`  - Admins: ${adminCount}`);
        console.log(`  - Status: ${registryEntry.approvalStatus} / ${registryEntry.accountStatus}`);
        console.log('');

        migrated++;
      } catch (error) {
        console.error(`✗ Error migrating ${school.name}:`, error.message);
        errors++;
      }
    }

    console.log('===========================================');
    console.log('   MIGRATION COMPLETE');
    console.log('===========================================');
    console.log(`Total schools: ${schools.length}`);
    console.log(`✓ Migrated: ${migrated}`);
    console.log(`⏭  Skipped: ${skipped}`);
    console.log(`✗ Errors: ${errors}`);
    console.log('===========================================\n');

  } catch (error) {
    console.error('\n✗ Migration Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('✓ Database connection closed\n');
    process.exit(0);
  }
};

migrateToSchoolRegistry();
