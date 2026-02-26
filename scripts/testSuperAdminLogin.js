/**
 * Test Super Admin Login
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SuperAdmin from '../models/SuperAdmin.js';

dotenv.config();

const testLogin = async () => {
  try {
    console.log('\n===========================================');
    console.log('   TESTING SUPER ADMIN LOGIN');
    console.log('===========================================\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB\n');

    const email = 'apnaschool.edu@gmail.com';
    const password = '@Apnaschool786$';

    console.log('Testing credentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('');

    // Find Super Admin
    const superAdmin = await SuperAdmin.findOne({ email }).select('+password');

    if (!superAdmin) {
      console.log('❌ Super Admin not found with this email!');
      process.exit(1);
    }

    console.log('✅ Super Admin found!');
    console.log('ID:', superAdmin._id);
    console.log('Name:', superAdmin.name);
    console.log('Email:', superAdmin.email);
    console.log('Role:', superAdmin.role);
    console.log('Active:', superAdmin.isActive);
    console.log('');

    // Test password
    const isMatch = await superAdmin.comparePassword(password);

    if (isMatch) {
      console.log('✅ PASSWORD MATCH! Login should work!');
      console.log('===========================================\n');
    } else {
      console.log('❌ PASSWORD DOES NOT MATCH!');
      console.log('Stored password hash:', superAdmin.password.substring(0, 30) + '...');
      console.log('===========================================\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('✓ Database connection closed\n');
    process.exit(0);
  }
};

testLogin();
