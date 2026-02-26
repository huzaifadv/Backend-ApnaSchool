import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SuperAdmin from '../models/SuperAdmin.js';

dotenv.config();

const resetPassword = async () => {
  try {
    console.log('\n===========================================');
    console.log('   RESET SUPER ADMIN PASSWORD');
    console.log('===========================================\n');

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB\n');

    const superAdmin = await SuperAdmin.findOne({ email: 'apnaschool.edu@gmail.com' });

    if (!superAdmin) {
      console.log('❌ Super Admin not found!');
      process.exit(1);
    }

    // Reset password to default
    const newPassword = 'Admin@123';
    superAdmin.password = newPassword;
    superAdmin.loginAttempts = 0;
    superAdmin.lockUntil = undefined;
    await superAdmin.save();

    console.log('✅ PASSWORD RESET SUCCESSFUL!');
    console.log('===========================================');
    console.log('Email:', superAdmin.email);
    console.log('New Password:', newPassword);
    console.log('===========================================\n');
    console.log('⚠ Please change this password after login!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('✓ Database connection closed\n');
    process.exit(0);
  }
};

resetPassword();
