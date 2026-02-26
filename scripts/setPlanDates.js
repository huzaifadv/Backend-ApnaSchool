import mongoose from 'mongoose';
import dotenv from 'dotenv';
import School from '../models/School.js';

dotenv.config();

const setPlanDates = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Get all schools
    const schools = await School.find({});
    console.log(`Found ${schools.length} schools`);

    let updated = 0;

    for (const school of schools) {
      // Skip if already has plan dates
      if (school.planStartDate && school.planEndDate) {
        console.log(`✓ ${school.schoolName} already has plan dates`);
        continue;
      }

      let startDate, endDate;

      // Check if trial plan
      if (school.planType === 'trial' && school.trial) {
        startDate = school.trial.startDate || new Date();
        endDate = school.trial.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      }
      // Check if paid plan
      else if (school.planType === 'paid' && school.subscription) {
        startDate = school.subscription.startDate || new Date();
        endDate = school.subscription.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      }
      // Default: 30 days from now
      else {
        startDate = new Date();

        // Parse planDuration if available
        if (school.planDuration) {
          const duration = school.planDuration.toLowerCase();
          if (duration.includes('7') || duration.includes('week')) {
            endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          } else if (duration.includes('month')) {
            endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          } else if (duration.includes('year')) {
            endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
          } else {
            endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
          }
        } else {
          endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
      }

      // Update school
      school.planStartDate = startDate;
      school.planEndDate = endDate;
      await school.save();

      console.log(`✓ Updated ${school.schoolName}:`);
      console.log(`  Start: ${startDate.toLocaleDateString()}`);
      console.log(`  End: ${endDate.toLocaleDateString()}`);
      updated++;
    }

    console.log(`\n✅ Done! Updated ${updated} schools`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

setPlanDates();
