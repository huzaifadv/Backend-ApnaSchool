/**
 * Check if Super Admin exists in database
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SuperAdmin from '../models/SuperAdmin.js';

dotenv.config();

const checkSuperAdmin = async () => {
  try {
    console.log('\n===========================================');
    console.log('   CHECKING SUPER ADMIN IN DATABASE');
    console.log('===========================================\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB\n');
    console.log('Database:', mongoose.connection.db.databaseName);
    console.log('Connection String:', process.env.MONGO_URI.replace(/\/\/.*:.*@/, '//***:***@'));

    // Find Super Admin
    const superAdmin = await SuperAdmin.findOne();

    if (superAdmin) {
      console.log('\n✅ SUPER ADMIN EXISTS!');
      console.log('===========================================');
      console.log('ID:', superAdmin._id);
      console.log('Name:', superAdmin.name);
      console.log('Email:', superAdmin.email);
      console.log('Role:', superAdmin.role);
      console.log('Active:', superAdmin.isActive);
      console.log('Created:', superAdmin.createdAt);
      console.log('===========================================\n');
    } else {
      console.log('\n❌ NO SUPER ADMIN FOUND IN DATABASE!');
      console.log('Collection is empty.\n');

      // Check if collection exists
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log('Available collections:', collections.map(c => c.name).join(', '));
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

checkSuperAdmin();
