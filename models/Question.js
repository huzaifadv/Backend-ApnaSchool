import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  basketId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionBasket', required: true },
  type: { type: String, enum: ['MCQ', 'Short', 'Long'], required: true },
  pageNo: { type: Number, required: true },
  questionText: { type: String, required: true },
  options: { type: [String], default: [] },
  correctAnswer: { type: String },
  marks: { type: Number, required: true }
});

export default mongoose.model('Question', questionSchema);
