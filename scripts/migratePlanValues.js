import mongoose from 'mongoose';
import dotenv from 'dotenv';
import School from '../models/School.js';

// Load environment variables
dotenv.config();

/**
 * Migration Script: Update Plan Values from Old to New Format
 *
 * Old Values -> New Values:
 * - 7_DAYS_FREE_TRIAL -> FREE_TRIAL
 * - MONTHLY -> BASIC
 * - YEARLY -> STANDARD
 * - FIVE_YEAR -> PREMIUM
 */

const planMigrationMap = {
  '7_DAYS_FREE_TRIAL': 'FREE_TRIAL',
  'MONTHLY': 'BASIC',
  'YEARLY': 'STANDARD',
  'FIVE_YEAR': 'PREMIUM'
};

async function migratePlanValues() {
  try {
    console.log('🚀 Starting plan values migration...');

    // Connect to MongoDB
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/apnaschool';
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find all schools with old plan values
    const schoolsToUpdate = await School.find({
      selectedPlan: { $in: Object.keys(planMigrationMap) }
    });

    console.log(`📊 Found ${schoolsToUpdate.length} schools with old plan values`);

    if (schoolsToUpdate.length === 0) {
      console.log('✨ No schools need migration. All done!');
      await mongoose.connection.close();
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Update each school
    for (const school of schoolsToUpdate) {
      try {
        const oldPlan = school.selectedPlan;
        const newPlan = planMigrationMap[oldPlan];

        console.log(`📝 Migrating ${school.schoolName}: ${oldPlan} -> ${newPlan}`);

        school.selectedPlan = newPlan;

        // Update plan price based on new plan
        const planPrices = {
          'FREE_TRIAL': 0,
          'BASIC': 2999,
          'STANDARD': 4999,
          'PREMIUM': 7999
        };
        school.planPrice = planPrices[newPlan];

        // Update plan duration
        const planDurations = {
          'FREE_TRIAL': '14 days',
          'BASIC': '1 month',
          'STANDARD': '1 month',
          'PREMIUM': '1 month'
        };
        school.planDuration = planDurations[newPlan];

        await school.save({ validateModifiedOnly: true });
        console.log(`  ✅ Successfully migrated ${school.schoolName}`);
        successCount++;
      } catch (error) {
        console.error(`  ❌ Error migrating ${school.schoolName}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`  ✅ Successful: ${successCount}`);
    console.log(`  ❌ Failed: ${errorCount}`);
    console.log(`  📊 Total: ${schoolsToUpdate.length}`);

    await mongoose.connection.close();
    console.log('🏁 Migration completed!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
migratePlanValues();
