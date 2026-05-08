import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema({
  title:     { type: String, required: true, trim: true },
  schoolId:  { type: String, required: true },
  teacherId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Book', bookSchema);
