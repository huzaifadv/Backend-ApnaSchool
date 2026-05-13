import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
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
      console.log('❌ Super Admin not found! Creating one...');
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash('@Apnaschool786$', salt);
      await SuperAdmin.create({
        name: 'Super Admin',
        email: 'apnaschool.edu@gmail.com',
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isActive: true,
      });
      console.log('✅ Super Admin created!');
      console.log('Email: apnaschool.edu@gmail.com');
      console.log('Password: @Apnaschool786$');
      process.exit(0);
    }

    // Directly hash and update via updateOne — bypasses pre-save hooks
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash('@Apnaschool786$', salt);

    await SuperAdmin.updateOne(
      { _id: superAdmin._id },
      {
        $set: {
          password: hashedPassword,
          loginAttempts: 0,
          isActive: true,
        },
        $unset: { lockUntil: 1 },
      }
    );

    console.log('✅ PASSWORD SET SUCCESSFULLY!');
    console.log('===========================================');
    console.log('Email: apnaschool.edu@gmail.com');
    console.log('Password: @Apnaschool786$');
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
