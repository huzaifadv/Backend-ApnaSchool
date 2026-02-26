import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SuperAdmin from '../models/SuperAdmin.js';

dotenv.config();

const setPassword = async () => {
  try {
    console.log('\n===========================================');
    console.log('   SETTING SUPER ADMIN PASSWORD');
    console.log('===========================================\n');

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB\n');

    const superAdmin = await SuperAdmin.findOne({ email: 'apnaschool.edu@gmail.com' });

    if (!superAdmin) {
      console.log('❌ Super Admin not found!');
      process.exit(1);
    }

    // Set the correct password
    const correctPassword = '@Apnaschool786$';
    superAdmin.password = correctPassword;
    superAdmin.loginAttempts = 0;
    superAdmin.lockUntil = undefined;
    superAdmin.isActive = true;
    await superAdmin.save();

    console.log('✅ PASSWORD SET SUCCESSFULLY!');
    console.log('===========================================');
    console.log('Email:', superAdmin.email);
    console.log('Password:', correctPassword);
    console.log('Active:', superAdmin.isActive);
    console.log('Login Attempts:', superAdmin.loginAttempts);
    console.log('===========================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('✓ Database connection closed\n');
    process.exit(0);
  }
};

setPassword();
