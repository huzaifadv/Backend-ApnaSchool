import mongoose from 'mongoose';

const institutionSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    unique: true,
    index: true
  },
  institutionType: {
    type: String,
    enum: ['academy', 'school', 'college', 'university'],
    required: true
  },
  branchStructure: {
    type: String,
    enum: ['single', 'multiple'],
    required: true
  },
  totalBranches: { type: Number, default: 1 },
  sessionId: { type: String }
}, { timestamps: true });

const Institution = mongoose.model('Institution', institutionSchema);
export default Institution;
