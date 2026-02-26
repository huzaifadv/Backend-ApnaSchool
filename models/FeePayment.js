import mongoose from 'mongoose';

const feePaymentSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: [true, 'School ID is required']
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Student ID is required']
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: [true, 'Class ID is required']
  },
  month: {
    type: Number,
    required: [true, 'Month is required'],
    min: [1, 'Month must be between 1 and 12'],
    max: [12, 'Month must be between 1 and 12']
  },
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: [2000, 'Year must be valid']
  },
  amount: {
    type: Number,
    required: [true, 'Fee amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  status: {
    type: String,
    enum: ['Paid', 'Pending'],
    default: 'Pending',
    required: true
  },
  paymentDate: {
    type: Date
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  remarks: {
    type: String,
    trim: true
  },
  // Local Invoice Number (Placeholder for FBR)
  invoiceNumber: {
    type: String,
    default: null
  },
  // Track if invoice has been created for this payment
  invoiceCreated: {
    type: Boolean,
    default: false
  },
  // FBR POS Integration Fields (Additive - No Breaking Changes)
  isFbrReported: {
    type: Boolean,
    default: false
  },
  fbrData: {
    invoiceNumber: {
      type: String,
      default: null
    },
    qrCodeString: {
      type: String,
      default: null
    },
    syncDateTime: {
      type: Date,
      default: null
    },
    responseStatus: {
      type: String,
      enum: ['Pending', 'Success', 'Failed'],
      default: 'Pending'
    },
    fullResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  }
}, {
  timestamps: true
});

// Compound index to ensure one payment record per student per month per year
feePaymentSchema.index({ schoolId: 1, studentId: 1, month: 1, year: 1 }, { unique: true });

const FeePayment = mongoose.model('FeePayment', feePaymentSchema);

export default FeePayment;
