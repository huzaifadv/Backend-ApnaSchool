import mongoose from 'mongoose';

const bookPageSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  pageNo: { type: Number, required: true },
  pageText: { type: String, default: '' }, // allow empty — scanned PDF pages have no text
  subjectId: { type: String, required: true },
  schoolId: { type: String, required: true }
});

bookPageSchema.index({ bookId: 1, pageNo: 1 });

export default mongoose.model('BookPage', bookPageSchema);
