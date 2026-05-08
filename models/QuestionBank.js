import mongoose from 'mongoose';

const mcqSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: {
    A: String,
    B: String,
    C: String,
    D: String
  },
  correct: { type: String, enum: ['A', 'B', 'C', 'D'] }
}, { _id: false });

const questionBankSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, unique: true },
  schoolId: { type: String, required: true },
  teacherId: { type: String, required: true },
  mcqs: [mcqSchema],
  shortQuestions: [{ type: String }],
  longQuestions: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('QuestionBank', questionBankSchema);
