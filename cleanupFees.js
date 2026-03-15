import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const cleanupFees = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);

    console.log('✅ Connected to MongoDB');

    // Get all tenant databases
    const admin = mongoose.connection.db.admin();
    const { databases } = await admin.listDatabases();

    const tenantDbs = databases
      .map(db => db.name)
      .filter(name => name.startsWith('school_') && name.endsWith('_db'));

    console.log(`📋 Found ${tenantDbs.length} tenant databases:`, tenantDbs);

    for (const dbName of tenantDbs) {
      console.log(`\n🗑️  Cleaning ${dbName}...`);

      const conn = mongoose.connection.useDb(dbName);
      const FeePayment = conn.model('FeePayment', new mongoose.Schema({}, { strict: false }));

      // Find corrupt payments (> Rs 100,000)
      const corruptCount = await FeePayment.countDocuments({ amount: { $gt: 100000 } });
      console.log(`   Found ${corruptCount} corrupt payments (amount > 100000)`);

      if (corruptCount > 0) {
        // Delete corrupt payments
        const result = await FeePayment.deleteMany({ amount: { $gt: 100000 } });
        console.log(`   ✅ Deleted ${result.deletedCount} corrupt payments`);
      }

      // Show remaining payments
      const remaining = await FeePayment.countDocuments();
      console.log(`   📊 Remaining payments: ${remaining}`);
    }

    console.log('\n✅ Cleanup completed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
};

cleanupFees();
