import mongoose from 'mongoose';
import dotenv from 'dotenv';
import School from '../models/School.js';
import SchoolRegistry from '../models/SchoolRegistry.js';

dotenv.config();

async function checkKipsSchool() {
  try {
    console.log('🔍 Checking KIPS College...\n');

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
      console.log('❌ KIPS College not found in database');
      await mongoose.connection.close();
      return;
    }

    console.log('📊 School Details:');
    console.log('================');
    console.log('School ID:', school._id);
    console.log('School Name:', school.schoolName);
    console.log('Email:', school.email);
    console.log('Plan Type:', school.planType);
    console.log('Selected Plan:', school.selectedPlan);
    console.log('Approval Status:', school.approvalStatus);
    console.log('Account Status:', school.accountStatus);
    console.log('Is Active:', school.isActive);
    console.log('\nTrial Info:', school.trial);
    console.log('\nSubscription Info:', school.subscription);

    // Check SchoolRegistry
    const registry = await SchoolRegistry.findOne({ schoolId: school._id });
    console.log('\n📋 School Registry:');
    console.log('==================');
    if (registry) {
      console.log('Registry ID:', registry._id);
      console.log('Approval Status:', registry.approvalStatus);
      console.log('Account Status:', registry.accountStatus);
      console.log('Plan Type:', registry.planType);
      console.log('Trial Active:', registry.trialActive);
      console.log('Plan Start Date:', registry.planStartDate);
      console.log('Plan End Date:', registry.planEndDate);
    } else {
      console.log('❌ No registry entry found');
    }

    // Fix if needed
    console.log('\n🔧 Issue Analysis:');
    console.log('==================');

    const issues = [];

    if (school.planType === 'trial' && school.approvalStatus !== 'approved') {
      issues.push('Trial plan should be auto-approved');
    }

    if (school.planType === 'trial' && !school.isActive) {
      issues.push('Trial plan should be active');
    }

    if (school.planType === 'trial' && school.accountStatus !== 'active') {
      issues.push('Trial account status should be active');
    }

    if (school.planType === 'trial' && !school.trial) {
      issues.push('Trial dates not set');
    }

    if (registry && registry.planType === 'trial' && registry.approvalStatus !== 'approved') {
      issues.push('Registry approval status should be approved');
    }

    if (issues.length === 0) {
      console.log('✅ No issues found - school should be working');
    } else {
      console.log('❌ Issues found:');
      issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });

      console.log('\n💡 Run fixKipsSchool.js to auto-fix these issues');
    }

    await mongoose.connection.close();
    console.log('\n✅ Check complete');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

checkKipsSchool();
