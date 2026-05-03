import mongoose from 'mongoose';

const generatedPaperSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  teacherId: { type: String, required: true },
  classId: { type: String, required: true },
  subjectId: { type: String, required: true },
  examTitle: { type: String, required: true },
  pdfPath: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('GeneratedPaper', generatedPaperSchema);
