/**
 * SchoolRegistry Model
 * Master database to manage all schools across the platform
 * Stored in central database: apnaschool_master_db
 */

import mongoose from 'mongoose';

const schoolRegistrySchema = new mongoose.Schema(
  {
    // School Identification
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      unique: true,
      index: true,
    },
    schoolName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    schoolEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },
    schoolPhone: {
      type: String,
      trim: true,
    },
    schoolAddress: {
      type: String,
      trim: true,
    },

    // Plan Information
    selectedPlan: {
      type: String,
      enum: ['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE'],
      default: 'FREE',
      required: true,
    },
    planType: {
      type: String,
      enum: ['trial', 'paid'],
      default: 'trial',
      required: true,
    },
    planStartDate: {
      type: Date,
      default: Date.now,
    },
    planEndDate: {
      type: Date,
      default: function () {
        // Default: 30 days trial
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date;
      },
    },
    trialActive: {
      type: Boolean,
      default: true,
    },

    // Approval & Status
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      required: true,
      index: true,
    },
    accountStatus: {
      type: String,
      enum: ['active', 'suspended', 'deactivated'],
      default: 'active',
      required: true,
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },

    // Subscription & Payment
    subscriptionId: {
      type: String,
      trim: true,
    },
    lastPaymentDate: {
      type: Date,
    },
    nextBillingDate: {
      type: Date,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'cancelled'],
      default: 'pending',
    },

    // Usage & Limits
    totalAdmins: {
      type: Number,
      default: 0,
    },
    totalStudents: {
      type: Number,
      default: 0,
    },
    totalParents: {
      type: Number,
      default: 0,
    },
    storageUsed: {
      type: Number, // in MB
      default: 0,
    },
    storageLimit: {
      type: Number, // in MB
      default: 1024, // 1GB for free plan
    },

    // Contact Information
    primaryContactName: {
      type: String,
      trim: true,
    },
    primaryContactEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    primaryContactPhone: {
      type: String,
      trim: true,
    },

    // Metadata
    lastLoginDate: {
      type: Date,
    },
    registrationSource: {
      type: String,
      enum: ['web', 'mobile', 'referral', 'admin'],
      default: 'web',
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Indexes for better query performance
schoolRegistrySchema.index({ approvalStatus: 1, accountStatus: 1 });
schoolRegistrySchema.index({ planType: 1, trialActive: 1 });
schoolRegistrySchema.index({ planEndDate: 1 });
schoolRegistrySchema.index({ createdAt: -1 });

// Virtual field: Is trial expired?
schoolRegistrySchema.virtual('isTrialExpired').get(function () {
  if (this.planType === 'trial' && this.trialActive) {
    return new Date() > this.planEndDate;
  }
  return false;
});

// Virtual field: Days remaining in trial
schoolRegistrySchema.virtual('trialDaysRemaining').get(function () {
  if (this.planType === 'trial' && this.trialActive && !this.isTrialExpired) {
    const diffTime = this.planEndDate - new Date();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  }
  return 0;
});

// Virtual field: Is subscription active?
schoolRegistrySchema.virtual('isSubscriptionActive').get(function () {
  if (this.planType === 'paid') {
    return new Date() <= this.planEndDate;
  }
  return false;
});

// Method: Check if school can access platform
schoolRegistrySchema.methods.canAccessPlatform = function () {
  // Must be approved
  if (this.approvalStatus !== 'approved') return false;

  // Must not be suspended or deactivated
  if (this.accountStatus !== 'active') return false;

  // If trial, must not be expired
  if (this.planType === 'trial') {
    return !this.isTrialExpired;
  }

  // If paid, must have active subscription
  if (this.planType === 'paid') {
    return this.isSubscriptionActive;
  }

  return false;
};

// Method: Approve school
schoolRegistrySchema.methods.approve = async function () {
  this.approvalStatus = 'approved';
  this.accountStatus = 'active';
  return this.save();
};

// Method: Reject school
schoolRegistrySchema.methods.reject = async function (reason) {
  this.approvalStatus = 'rejected';
  this.accountStatus = 'deactivated';
  this.rejectionReason = reason;
  return this.save();
};

// Method: Suspend school
schoolRegistrySchema.methods.suspend = async function (reason) {
  this.accountStatus = 'suspended';
  this.notes = `Suspended: ${reason}. Previous notes: ${this.notes || 'None'}`;
  return this.save();
};

// Method: Activate school
schoolRegistrySchema.methods.activate = async function () {
  this.accountStatus = 'active';
  return this.save();
};

// Method: Upgrade to paid plan
schoolRegistrySchema.methods.upgradeToPaid = async function (plan, duration = 30) {
  this.planType = 'paid';
  this.selectedPlan = plan;
  this.trialActive = false;
  this.planStartDate = new Date();

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + duration);
  this.planEndDate = endDate;

  return this.save();
};

// Method: Extend trial
schoolRegistrySchema.methods.extendTrial = async function (days) {
  if (this.planType === 'trial') {
    const newEndDate = new Date(this.planEndDate);
    newEndDate.setDate(newEndDate.getDate() + days);
    this.planEndDate = newEndDate;
    this.trialActive = true;
    return this.save();
  }
  throw new Error('Cannot extend trial for paid plans');
};

// Static method: Get schools by status
schoolRegistrySchema.statics.getByApprovalStatus = function (status) {
  return this.find({ approvalStatus: status }).sort({ createdAt: -1 });
};

// Static method: Get expired trials
schoolRegistrySchema.statics.getExpiredTrials = function () {
  return this.find({
    planType: 'trial',
    trialActive: true,
    planEndDate: { $lt: new Date() },
  });
};

// Static method: Get active schools
schoolRegistrySchema.statics.getActiveSchools = function () {
  return this.find({
    approvalStatus: 'approved',
    accountStatus: 'active',
  });
};

// Static method: Get platform statistics
schoolRegistrySchema.statics.getPlatformStats = async function () {
  const [totalSchools, approvedSchools, pendingSchools, activeTrials, paidSchools] = await Promise.all([
    this.countDocuments(),
    this.countDocuments({ approvalStatus: 'approved' }),
    this.countDocuments({ approvalStatus: 'pending' }),
    this.countDocuments({ planType: 'trial', trialActive: true }),
    this.countDocuments({ planType: 'paid' }),
  ]);

  const totalAdmins = await this.aggregate([
    { $group: { _id: null, total: { $sum: '$totalAdmins' } } },
  ]);

  const totalStudents = await this.aggregate([
    { $group: { _id: null, total: { $sum: '$totalStudents' } } },
  ]);

  return {
    totalSchools,
    approvedSchools,
    pendingSchools,
    activeTrials,
    paidSchools,
    totalAdmins: totalAdmins[0]?.total || 0,
    totalStudents: totalStudents[0]?.total || 0,
  };
};

// Ensure virtual fields are included in JSON output
schoolRegistrySchema.set('toJSON', { virtuals: true });
schoolRegistrySchema.set('toObject', { virtuals: true });

export default mongoose.model('SchoolRegistry', schoolRegistrySchema);
