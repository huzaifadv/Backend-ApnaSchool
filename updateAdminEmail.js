import mongoose from 'mongoose';

mongoose.connect('mongodb://127.0.0.1:27017/apnaschool').then(async () => {
  try {
    const result = await mongoose.connection.db.collection('admins').updateOne(
      {email: 'webefy-admin@example.com'}, 
      {$set: {email: 'deve.huzaifa@gmail.com'}}
    );
    console.log('Updated:', result.modifiedCount, 'admin(s)');
    process.exit();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
});
