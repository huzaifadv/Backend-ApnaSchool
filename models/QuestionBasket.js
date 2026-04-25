import mongoose from 'mongoose';

const questionBasketSchema = new mongoose.Schema({
  teacherId: { type: String, required: true },
  subjectId: { type: String, required: true },
  classId: { type: String, required: true },
  examTitle: { type: String, required: true },
  totalMarks: { type: Number, required: true },
  timeAllowed: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model('QuestionBasket', questionBasketSchema);
