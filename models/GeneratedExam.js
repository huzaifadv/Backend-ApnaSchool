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
  selectionMode: { type: String, enum: ['manual', 'random'], default: 'random' },
  mcqMarks:   { type: Number, default: 1 },
  shortMarks:  { type: Number, default: 3 },
  longMarks:   { type: Number, default: 5 },
  mcqs: [mcqSchema],
  shortQuestions: [{ type: String }],
  longQuestions: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('GeneratedExam', generatedExamSchema);
