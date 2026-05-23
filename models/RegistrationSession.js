import mongoose from 'mongoose';

const branchDataSchema = new mongoose.Schema({
  branchName: { type: String, trim: true },
  address: { type: String, trim: true },
  city: { type: String, trim: true },
  province: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  estimatedStudents: { type: Number }
}, { _id: false });

const registrationSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  institutionType: {
    type: String,
    enum: ['academy', 'school', 'college', 'university']
  },
  branchStructure: {
    type: String,
    enum: ['single', 'multiple']
  },
  branchCount: { type: Number, default: 1 },
  branches: [branchDataSchema],
  admin: {
    fullName: { type: String, trim: true },
    mobile:   { type: String, trim: true },
    email:    { type: String, lowercase: true, trim: true },
    password: { type: String }
  },
  selectedPlan: {
    type: String,
    enum: ['FREE_TRIAL', 'BASIC', 'STANDARD', 'PREMIUM', 'BUSINESS']
  },
  billingCycle: {
    type: String,
    enum: ['MONTHLY', 'YEARLY'],
    default: 'MONTHLY'
  },
  emailVerification: {
    branchEmail: {
      otp:      { type: String },
      expires:  { type: Date },
      verified: { type: Boolean, default: false }
    },
    adminEmail: {
      otp:      { type: String },
      expires:  { type: Date },
      verified: { type: Boolean, default: false }
    }
  },
  currentStep: { type: Number, default: 1, min: 1, max: 6 },
  status: {
    type: String,
    enum: ['in_progress', 'payment_pending', 'completed', 'expired'],
    default: 'in_progress'
  },
  completedAt: { type: Date },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
}, { timestamps: true });

// Auto-delete expired sessions
registrationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RegistrationSession = mongoose.model('RegistrationSession', registrationSessionSchema);
export default RegistrationSession;
