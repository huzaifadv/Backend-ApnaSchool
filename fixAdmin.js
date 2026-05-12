import mongoose from 'mongoose';

const conn = mongoose.createConnection('mongodb://127.0.0.1:27017/webefy_school_db');

conn.once('open', async () => {
  try {
    const result = await conn.db.collection('admins').updateOne(
      {name: 'Muhammad Huzaifa'}, 
      {$set: {schoolId: new mongoose.Types.ObjectId('69c2e880e232c935405c1614')}}
    );
    console.log('Updated:', result.modifiedCount, 'admin(s)');
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit();
});
