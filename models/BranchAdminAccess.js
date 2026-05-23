import mongoose from 'mongoose';

const branchAssignmentSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin'],
    default: 'admin'
  },
  isPrimary: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const branchAdminAccessSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin'],
    default: 'admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  verificationTokenHash: {
    type: String
  },
  verificationExpires: {
    type: Date
  },
  assignedBranches: {
    type: [branchAssignmentSchema],
    default: []
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BranchAdminAccess'
  },
  lastLoginAt: {
    type: Date
  }
}, { timestamps: true });

branchAdminAccessSchema.index({ schoolId: 1, email: 1 }, { unique: true });

const BranchAdminAccess = mongoose.model('BranchAdminAccess', branchAdminAccessSchema);
export default BranchAdminAccess;
