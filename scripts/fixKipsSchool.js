import mongoose from 'mongoose';
import dotenv from 'dotenv';
import School from '../models/School.js';
import SchoolRegistry from '../models/SchoolRegistry.js';

dotenv.config();

async function fixKipsSchool() {
  try {
    console.log('🔧 Fixing KIPS College...\n');

    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/apnaschool');
    console.log('✅ Connected to MongoDB\n');

    // Find KIPS school
    const school = await School.findOne({
      $or: [
        { schoolName: /kips/i },
        { email: /kips/i }
      ]
    });

    if (!school) {
      console.log('❌ KIPS College not found');
      await mongoose.connection.close();
      return;
    }

    console.log('📊 Current Status:');
    console.log('School ID:', school._id);
    console.log('Plan Type:', school.planType);
    console.log('Approval Status:', school.approvalStatus);
    console.log('Account Status:', school.accountStatus);
    console.log('Is Active:', school.isActive);
    console.log('Trial:', school.trial);

    // Fix trial dates
    if (school.planType === 'trial') {
      const now = new Date();
      const startDate = school.trial?.startDate || now;
      const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days from start

      school.trial = {
        isActive: true,
        startDate: startDate,
        endDate: endDate
      };

      school.approvalStatus = 'approved';
      school.accountStatus = 'active';
      school.isActive = true;

      await school.save();

      console.log('\n✅ School Updated:');
      console.log('Trial Start Date:', school.trial.startDate);
      console.log('Trial End Date:', school.trial.endDate);
      console.log('Days Remaining:', Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
    }

    // Fix SchoolRegistry
    const registry = await SchoolRegistry.findOne({ schoolId: school._id });

    if (registry) {
      console.log('\n📋 Updating School Registry...');

      registry.approvalStatus = 'approved';
      registry.accountStatus = 'active';
      registry.planType = 'trial';
      registry.planStartDate = school.trial.startDate;
      registry.planEndDate = school.trial.endDate;
      registry.trialActive = true;

      await registry.save();

      console.log('✅ Registry Updated');
      console.log('Plan End Date:', registry.planEndDate);
    } else {
      console.log('\n⚠️  No registry entry found - creating one...');

      await SchoolRegistry.create({
        schoolId: school._id,
        schoolName: school.schoolName,
        schoolEmail: school.email,
        schoolPhone: school.phone,
        schoolAddress: `${school.address}, ${school.city}, ${school.state}`,
        selectedPlan: 'FREE',
        planType: 'trial',
        planStartDate: school.trial.startDate,
        planEndDate: school.trial.endDate,
        trialActive: true,
        approvalStatus: 'approved',
        accountStatus: 'active',
        registrationSource: 'web'
      });

      console.log('✅ Registry created');
    }

    await mongoose.connection.close();
    console.log('\n🎉 KIPS College fixed successfully!');
    console.log('You can now login and use the system for 14 days.');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

fixKipsSchool();
