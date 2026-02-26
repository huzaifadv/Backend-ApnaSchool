import mongoose from 'mongoose';

const feeAccessVerificationSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  verificationCode: {
    type: String,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: {
    type: Date
  },
  expiresAt: {
    type: Date,
    required: true
  },
  // Access expiry - 3 days after verification
  accessExpiresAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 604800 // Auto-delete after 7 days
  }
});

// Index for quick lookup
feeAccessVerificationSchema.index({ adminId: 1, schoolId: 1 });
feeAccessVerificationSchema.index({ verificationCode: 1 });
feeAccessVerificationSchema.index({ accessExpiresAt: 1 });

const FeeAccessVerification = mongoose.model('FeeAccessVerification', feeAccessVerificationSchema);

export default FeeAccessVerification;
