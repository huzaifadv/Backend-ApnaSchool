import mongoose from 'mongoose';

const mcqSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: {
    A: { type: String, default: '' },
    B: { type: String, default: '' },
    C: { type: String, default: '' },
    D: { type: String, default: '' }
  },
  correct: { type: String, enum: ['A', 'B', 'C', 'D'], default: 'A' }
});

const chapterSchema = new mongoose.Schema({
  bookId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  schoolId:       { type: String, required: true },
  teacherId:      { type: String, required: true },
  title:          { type: String, required: true, trim: true },
  mcqs:           [mcqSchema],
  shortQuestions: [String],
  longQuestions:  [String],
  createdAt:      { type: Date, default: Date.now }
});

export default mongoose.model('Chapter', chapterSchema);
