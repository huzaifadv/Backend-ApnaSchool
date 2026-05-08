import mongoose from 'mongoose';

const dailyApiUsageSchema = new mongoose.Schema({
  teacherId: { type: String, required: true },
  schoolId: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  count: { type: Number, default: 0 }
});

dailyApiUsageSchema.index({ teacherId: 1, date: 1 }, { unique: true });

export default mongoose.model('DailyApiUsage', dailyApiUsageSchema);
