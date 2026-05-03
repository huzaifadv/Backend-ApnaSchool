import mongoose from 'mongoose';

const generatedSyllabusSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  classId: { type: String, required: true },
  subjectId: { type: String, required: true },
  sessionYear: { type: String, required: true },
  pdfPath: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('GeneratedSyllabus', generatedSyllabusSchema, 'generatedSyllabus');
