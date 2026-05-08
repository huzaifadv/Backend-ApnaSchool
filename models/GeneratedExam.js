import mongoose from 'mongoose';

const mcqSchema = new mongoose.Schema({
  question: String,
  options: { A: String, B: String, C: String, D: String },
  correct: String
}, { _id: false });

const generatedExamSchema = new mongoose.Schema({
  teacherId: { type: String, required: true },
  schoolId: { type: String, required: true },
  bookId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  chapterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chapter' }],
  examTitle: { type: String, required: true },
  className: { type: String },
  subjectName: { type: String },
  timeAllowed: { type: String, default: '1 Hour' },
  totalMarks: { type: Number },
  mcqs: [mcqSchema],
  shortQuestions: [{ type: String }],
  longQuestions: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('GeneratedExam', generatedExamSchema);
