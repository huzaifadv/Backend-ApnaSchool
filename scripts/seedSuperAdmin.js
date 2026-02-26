/**
 * Seed Script - Creates the permanent Super Admin account
 * Run once: node backend/scripts/seedSuperAdmin.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SuperAdmin from '../models/SuperAdmin.js';

dotenv.config();

const seedSuperAdmin = async () => {
  try {
    console.log('\n===========================================');
    console.log('   SUPER ADMIN SEED SCRIPT');
    console.log('===========================================\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB\n');

    // Check if Super Admin already exists
    const existingSuperAdmin = await SuperAdmin.findOne();
    if (existingSuperAdmin) {
      console.log('❌ Super Admin already exists!');
      console.log(`   Name: ${existingSuperAdmin.name}`);
      console.log(`   Email: ${existingSuperAdmin.email}`);
      console.log(`   Created: ${existingSuperAdmin.createdAt}\n`);

      console.log('⚠ Delete existing Super Admin first if you want to recreate.\n');
      process.exit(0);
    }

    // Create Super Admin with permanent credentials
    const superAdmin = new SuperAdmin({
      name: 'Apna School Admin',
      email: 'apnaschool.edu@gmail.com',
      password: '@Apnaschool786$',
      role: 'SUPER_ADMIN',
      isActive: true,
    });

    await superAdmin.save();

    console.log('===========================================');
    console.log('✓ SUPER ADMIN CREATED SUCCESSFULLY!');
    console.log('===========================================');
    console.log('Name: Apna School Admin');
    console.log('Email: apnaschool.edu@gmail.com');
    console.log('Password: @Apnaschool786$');
    console.log('Role: SUPER_ADMIN');
    console.log(`Created: ${superAdmin.createdAt}`);
    console.log('===========================================\n');

    console.log('⚠ IMPORTANT: These are permanent credentials!');
    console.log('⚠ Login at: /super-admin/login\n');

  } catch (error) {
    console.error('\n❌ Error creating Super Admin:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('✓ Database connection closed\n');
    process.exit(0);
  }
};

// Run the seed
seedSuperAdmin();
