import mongoose from 'mongoose';
import { getMainConnection } from '../config/tenantDB.js';

/**
 * School Model - Lives in Main Database
 * This is the only model that should be in the main database
 * All other models (students, classes, etc.) live in tenant databases
 */

const schoolSchema = new mongoose.Schema({
  schoolName: {
    type: String,
    required: [true, 'School name is required'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true
  },
  state: {
    type: String,
    required: [true, 'State is required'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    validate: {
      validator: function(value) {
        // Strong password validation:
        // At least one uppercase, one lowercase, one number, one special character
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
        return strongPasswordRegex.test(value);
      },
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }
  },
  establishedYear: {
    type: Number
  },
  website: {
    type: String,
    trim: true
  },
  // Plan Selection (REQUIRED)
  selectedPlan: {
    type: String,
    required: [true, 'Plan selection is required'],
    enum: ['FREE_TRIAL', 'BASIC', 'STANDARD', 'PREMIUM'],
    trim: true
  },
  billingCycle: {
    type: String,
    enum: ['MONTHLY', 'YEARLY'],
    default: 'MONTHLY'
  },
  planPrice: {
    type: Number,
    required: true
  },
  planDuration: {
    type: String, // '7 days', '1 month', '1 year', '5 years'
    required: true
  },
  studentLimit: {
    type: Number,
    default: function() {
      // Set student limit based on plan
      switch(this.selectedPlan) {
        case 'FREE_TRIAL':
          return 100;
        case 'BASIC':
          return 300;
        case 'STANDARD':
          return 600;
        case 'PREMIUM':
          return -1; // -1 means unlimited
        default:
          return 100;
      }
    }
  },
  // Plan Type: trial or paid
  planType: {
    type: String,
    enum: ['trial', 'paid'],
    required: true,
    default: 'trial'
  },
  // Account Status: active, inactive, or suspended
  accountStatus: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'inactive'
  },
  suspensionReason: {
    type: String
  },
  suspendedAt: {
    type: Date
  },
  reactivatedAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: false // Changed to false - schools start inactive until approved
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rejectionReason: {
    type: String
  },
  // Email Verification Fields
  emailVerificationOTP: {
    type: String // Hashed OTP
  },
  emailVerificationExpires: {
    type: Date
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  // Email Change Fields
  pendingEmail: { type: String },
  emailChangeOTP: { type: String },
  emailChangeExpires: { type: Date },
  // Password Reset Fields (OTP still needed for password reset)
  resetPasswordOTP: {
    type: String // Hashed OTP
  },
  resetPasswordExpires: {
    type: Date
  },
  resetPasswordAttempts: {
    type: Number,
    default: 0
  },
  lastPasswordResetRequest: {
    type: Date
  },
  // Trial Period Fields
  trial: {
    isActive: {
      type: Boolean,
      default: true
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date
    }
  },
  // Subscription Fields
  subscription: {
    plan: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly']
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'pending_payment'],
      default: 'expired'
    },
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    paymentId: {
      type: String
    },
    orderId: {
      type: String
    }
  },
  // Payment Tracking
  paymentStatus: {
    type: String,
    enum: ['paid', 'pending', 'overdue'],
    default: 'pending'
  },
  lastPaymentDate: {
    type: Date
  },
  nextPaymentDue: {
    type: Date
  },
  paymentHistory: [{
    amount: Number,
    paymentDate: Date,
    paymentMethod: String,
    transactionId: String,
    planType: String,
    planDuration: String,
    paidBy: String, // Super admin who marked as paid
    notes: String
  }],
  // Plan Expiry Tracking
  planStartDate: {
    type: Date
  },
  planEndDate: {
    type: Date
  },
  isPlanExpired: {
    type: Boolean,
    default: false
  },
  gracePeriodEndDate: {
    type: Date // 7 days grace period after plan expires
  },
  // FBR POS Integration Fields (Additive - No Breaking Changes)
  fbrEnabled: {
    type: Boolean,
    default: false
  },
  fbrConfig: {
    apiUrl: {
      type: String,
      default: null,
      trim: true
    },
    posId: {
      type: String,
      default: null,
      trim: true
    },
    token: {
      type: String, // Will be encrypted
      default: null
    },
    registrationNumber: {
      type: String,
      default: null,
      trim: true
    }
  },
  // School Logo
  logo: {
    url: {
      type: String,
      default: null
    },
    publicId: {
      type: String,
      default: null
    }
  }
}, {
  timestamps: true
});

/**
 * Virtual field: Calculate remaining days in plan
 */
schoolSchema.virtual('remainingDays').get(function() {
  const endDate = this.planType === 'trial' && this.trial?.endDate
    ? this.trial.endDate
    : this.planEndDate;

  if (!endDate) return null;

  const now = new Date();
  const end = new Date(endDate);
  const diffTime = end - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays > 0 ? diffDays : 0;
});

/**
 * Method: Get plan limits based on selected plan
 */
schoolSchema.methods.getPlanLimits = function() {
  const limits = {
    FREE_TRIAL: { students: 100, name: 'Trial', duration: '14 days' },
    BASIC: { students: 300, name: 'Basic', duration: this.billingCycle === 'YEARLY' ? '1 year' : '1 month' },
    STANDARD: { students: 600, name: 'Standard', duration: this.billingCycle === 'YEARLY' ? '1 year' : '1 month' },
    PREMIUM: { students: -1, name: 'Premium', duration: this.billingCycle === 'YEARLY' ? '1 year' : '1 month' } // -1 = unlimited
  };

  return limits[this.selectedPlan] || limits.FREE_TRIAL;
};

/**
 * Method: Check if student limit is reached
 */
schoolSchema.methods.isStudentLimitReached = async function(currentStudentCount) {
  const limit = this.studentLimit;

  // -1 means unlimited (Premium plan)
  if (limit === -1) return false;

  return currentStudentCount >= limit;
};

// Ensure virtual fields are included in JSON output
schoolSchema.set('toJSON', { virtuals: true });
schoolSchema.set('toObject', { virtuals: true });

/**
 * Create School model on default mongoose connection
 * The main database will be initialized by connectDB() before this model is used
 */
const School = mongoose.model('School', schoolSchema);

export default School;
