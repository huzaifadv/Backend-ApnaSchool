import mongoose from 'mongoose';
import dotenv from 'dotenv';
import School from '../models/School.js';
import SchoolRegistry from '../models/SchoolRegistry.js';

dotenv.config();

async function fixAllTrialSchools() {
  try {
    console.log('🔧 Fixing all trial schools with missing endDate...\n');

    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/apnaschool');
    console.log('✅ Connected to MongoDB\n');

    // Find all trial schools without endDate
    const trialSchools = await School.find({
      planType: 'trial',
      $or: [
        { 'trial.endDate': { $exists: false } },
        { 'trial.endDate': null }
      ]
    });

    console.log(`📊 Found ${trialSchools.length} trial schools with missing endDate\n`);

    if (trialSchools.length === 0) {
      console.log('✅ All trial schools are properly configured!');
      await mongoose.connection.close();
      return;
    }

    let fixed = 0;

    for (const school of trialSchools) {
      try {
        console.log(`\n🔧 Fixing: ${school.schoolName}`);
        console.log(`   Email: ${school.email}`);

        const now = new Date();
        const startDate = school.trial?.startDate || now;
        const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);

        // Update school trial dates
        school.trial = {
          isActive: true,
          startDate: startDate,
          endDate: endDate
        };

        // Make sure trial school is active
        school.approvalStatus = 'approved';
        school.accountStatus = 'active';
        school.isActive = true;

        await school.save();

        console.log(`   ✅ Trial dates set:`);
        console.log(`      Start: ${startDate.toLocaleDateString()}`);
        console.log(`      End: ${endDate.toLocaleDateString()}`);
        console.log(`      Days remaining: ${Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))}`);

        // Update SchoolRegistry
        const registry = await SchoolRegistry.findOne({ schoolId: school._id });

        if (registry) {
          registry.approvalStatus = 'approved';
          registry.accountStatus = 'active';
          registry.planType = 'trial';
          registry.planStartDate = startDate;
          registry.planEndDate = endDate;
          registry.trialActive = true;

          await registry.save();
          console.log(`   ✅ Registry updated`);
        } else {
          // Create registry if it doesn't exist
          await SchoolRegistry.create({
            schoolId: school._id,
            schoolName: school.schoolName,
            schoolEmail: school.email,
            schoolPhone: school.phone,
            schoolAddress: `${school.address || ''}, ${school.city || ''}, ${school.state || ''}`,
            selectedPlan: 'FREE',
            planType: 'trial',
            planStartDate: startDate,
            planEndDate: endDate,
            trialActive: true,
            approvalStatus: 'approved',
            accountStatus: 'active',
            registrationSource: 'web',
            totalAdmins: 1
          });
          console.log(`   ✅ Registry created`);
        }

        fixed++;

      } catch (error) {
        console.error(`   ❌ Error fixing ${school.schoolName}:`, error.message);
      }
    }

    await mongoose.connection.close();

    console.log('\n' + '='.repeat(50));
    console.log(`\n🎉 Fixed ${fixed} out of ${trialSchools.length} trial schools!`);
    console.log('\n✅ All trial schools can now login and work for 14 days.');
    console.log('='.repeat(50) + '\n');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

fixAllTrialSchools();
