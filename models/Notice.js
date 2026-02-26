import mongoose from 'mongoose';

const noticeSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: [true, 'School ID is required']
  },
  title: {
    type: String,
    required: [true, 'Notice title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Notice description is required'],
    trim: true
  },
  category: {
    type: String,
    enum: ['General', 'Academic', 'Exam', 'Event', 'Holiday', 'Sports', 'Emergency', 'Other'],
    default: 'General'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  targetAudience: {
    type: String,
    enum: ['All', 'Students', 'Parents', 'Teachers', 'Staff'],
    default: 'All'
  },
  targetClasses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  }],
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: false
  },
  isSuperAdminNotice: {
    type: Boolean,
    default: false
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String
  }],
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPinned: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Create index for efficient querying
noticeSchema.index({ schoolId: 1, isActive: 1, validFrom: -1 });

const Notice = mongoose.model('Notice', noticeSchema);

export default Notice;
