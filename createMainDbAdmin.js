import mongoose from 'mongoose';
import Admin from './models/Admin.js';

mongoose.connect('mongodb://127.0.0.1:27017/apnaschool').then(async () => {
  try {
    // Find the school
    const School = mongoose.connection.model('schools', new mongoose.Schema({}, { strict: false }));
    const school = await mongoose.connection.db.collection('schools').findOne({schoolName: 'Webefy School'});
    
    if (!school) {
      console.log('School not found');
      process.exit(1);
    }

    // Check if admin already exists in main DB
    const existingAdmin = await Admin.findOne({email: 'webefy-admin@example.com'});
    if (existingAdmin) {
      console.log('Admin already exists in main DB');
      process.exit(0);
    }

    // Get tenant admin to copy data from
    const conn = mongoose.createConnection('mongodb://127.0.0.1:27017/webefy_school_db');
    conn.once('open', async () => {
      const tenantAdmin = await conn.db.collection('admins').findOne({name: 'Muhammad Huzaifa'});
      
      if (!tenantAdmin) {
        console.log('Tenant admin not found');
        process.exit(1);
      }

      // Create admin in main DB
      const mainDbAdmin = new Admin({
        name: tenantAdmin.name,
        email: tenantAdmin.email || 'webefy-admin@example.com',
        password: tenantAdmin.password,
        schoolId: school._id,
        role: tenantAdmin.role || 'admin',
        isActive: tenantAdmin.isActive !== undefined ? tenantAdmin.isActive : true,
        contact: tenantAdmin.contact,
        cnic: tenantAdmin.cnic
      });

      await mainDbAdmin.save();
      console.log('Created admin in main DB:', mainDbAdmin._id);
      process.exit(0);
    });
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
});
