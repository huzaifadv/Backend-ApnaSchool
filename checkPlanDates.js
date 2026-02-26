import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const checkPlanDates = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get School model
    const School = mongoose.model('School', new mongoose.Schema({}, { strict: false }));

    // Find "Kips College" school
    const school = await School.findOne({ schoolName: /Kips/i });

    if (!school) {
      console.log('❌ School not found');
      process.exit(1);
    }

    console.log('\n📊 SCHOOL DATA:');
    console.log('School Name:', school.schoolName);
    console.log('School ID:', school._id);
    console.log('Plan Type:', school.planType);
    console.log('Selected Plan:', school.selectedPlan);
    console.log('\n📅 TRIAL DATA:');
    console.log('Trial exists:', !!school.trial);
    if (school.trial) {
      console.log('Trial:', JSON.stringify(school.trial, null, 2));
    }
    console.log('\n📅 SUBSCRIPTION DATA:');
    console.log('Subscription exists:', !!school.subscription);
    if (school.subscription) {
      console.log('Subscription:', JSON.stringify(school.subscription, null, 2));
    }

    // Now check SchoolRegistry
    console.log('\n\n🔍 CHECKING SCHOOLREGISTRY:');

    // Switch to master database
    const masterDb = mongoose.connection.useDb('apnaschool_master_db');
    const SchoolRegistry = masterDb.model('SchoolRegistry', new mongoose.Schema({}, { strict: false }), 'schoolregistries');

    const registry = await SchoolRegistry.findOne({ schoolId: school._id });

    console.log('Registry found:', !!registry);
    if (registry) {
      console.log('Plan Start Date:', registry.planStartDate);
      console.log('Plan End Date:', registry.planEndDate);
      console.log('Full Registry:', JSON.stringify(registry, null, 2));
    } else {
      console.log('❌ No registry entry found for this school');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkPlanDates();
