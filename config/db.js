import mongoose from 'mongoose';
import { initMainDB } from './tenantDB.js';

/**
 * Legacy connectDB - now redirects to multi-tenant main DB
 * This maintains backward compatibility while using the new architecture
 */
const connectDB = async () => {
  try {
    await initMainDB();
    console.log(`✓ Database connection initialized (Multi-tenant mode)`);
  } catch (error) {
    console.error(`✗ Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
