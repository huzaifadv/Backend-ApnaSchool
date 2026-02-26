/**
 * Script to create the Super Admin manually
 * Run this script once to create the Super Admin account
 *
 * Usage: node backend/scripts/createSuperAdmin.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const SuperAdmin = require('../models/SuperAdmin');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify question function
const question = (query) => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const createSuperAdmin = async () => {
  try {
    console.log('\n===========================================');
    console.log('   SUPER ADMIN CREATION SCRIPT');
    console.log('===========================================\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✓ Connected to MongoDB\n');

    // Check if Super Admin already exists
    const existingSuperAdmin = await SuperAdmin.findOne();
    if (existingSuperAdmin) {
      console.log('❌ Super Admin already exists!');
      console.log(`   Name: ${existingSuperAdmin.name}`);
      console.log(`   Email: ${existingSuperAdmin.email}`);
      console.log(`   Created: ${existingSuperAdmin.createdAt}\n`);

      const overwrite = await question('Do you want to delete and recreate? (yes/no): ');
      if (overwrite.toLowerCase() !== 'yes') {
        console.log('\n⚠ Operation cancelled.\n');
        process.exit(0);
      }

      await SuperAdmin.deleteOne({ _id: existingSuperAdmin._id });
      console.log('✓ Existing Super Admin deleted\n');
    }

    // Get Super Admin details
    console.log('Enter Super Admin details:\n');

    const name = await question('Name: ');
    if (!name || name.trim().length === 0) {
      throw new Error('Name is required');
    }

    const email = await question('Email: ');
    if (!email || !email.match(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/)) {
      throw new Error('Valid email is required');
    }

    const password = await question('Password (min 8 characters): ');
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const confirmPassword = await question('Confirm Password: ');
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    // Create Super Admin
    const superAdmin = new SuperAdmin({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'SUPER_ADMIN',
      isActive: true,
    });

    await superAdmin.save();

    console.log('\n===========================================');
    console.log('✓ SUPER ADMIN CREATED SUCCESSFULLY!');
    console.log('===========================================');
    console.log(`Name: ${superAdmin.name}`);
    console.log(`Email: ${superAdmin.email}`);
    console.log(`Role: ${superAdmin.role}`);
    console.log(`Created: ${superAdmin.createdAt}`);
    console.log('===========================================\n');

    console.log('⚠ IMPORTANT: Store these credentials securely!');
    console.log('⚠ You can now login at: /super-admin/login\n');

  } catch (error) {
    console.error('\n❌ Error creating Super Admin:', error.message);
  } finally {
    rl.close();
    await mongoose.connection.close();
    console.log('✓ Database connection closed\n');
    process.exit(0);
  }
};

// Run the script
createSuperAdmin();
