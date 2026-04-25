import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema({
  schoolId: { type: String, required: true },
  subjectId: { type: String, required: true },
  classId: { type: String, required: true },
  fileName: { type: String, required: true },
  gridFsId: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ['processing', 'parsed', 'error'], default: 'processing' },
  uploadedBy: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Book', bookSchema);
