import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  schoolId:    { type: String, required: true },
  subjectId:   { type: String },
  classId:     { type: String },
  teacherId:   { type: String },
  uploadedBy:  { type: String },
  fileName:    { type: String },
  gridFsId:    { type: mongoose.Schema.Types.ObjectId },
  driveLink:   { type: String },
  driveFileId: { type: String },
  source:      { type: String, enum: ['upload', 'drive'], default: 'upload' },
  status:      { type: String, enum: ['processing', 'parsed', 'error'], default: 'processing' },
  createdAt:   { type: Date, default: Date.now }
});

export default mongoose.model('Book', bookSchema);
