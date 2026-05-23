import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  sessionId: { type: String }, // optional — browser-based registrations don't use DB sessions
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  gateway: {
    type: String,
    enum: ['jazzcash', 'easypaisa', 'stripe'],
    required: true
  },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'PKR' },
  plan: {
    type: String,
    enum: ['FREE_TRIAL', 'BASIC', 'STANDARD', 'PREMIUM', 'BUSINESS']
  },
  billingCycle: {
    type: String,
    enum: ['MONTHLY', 'YEARLY']
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending',
    index: true
  },
  transactionId: { type: String },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed },
  hmacSignature: { type: String },
  verifiedAt: { type: Date },
  verifiedBy: { type: String }
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
