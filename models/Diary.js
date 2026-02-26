import mongoose from 'mongoose';

const diarySchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: [true, 'Class ID is required']
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: [true, 'Teacher ID is required']
  },
  teacherName: {
    type: String,
    required: [true, 'Teacher name is required'],
    trim: true
  },
  date: {
    type: Date,
    default: Date.now,
    required: [true, 'Diary date is required']
  },
  subjects: [{
    title: {
      type: String,
      required: [true, 'Subject title is required'],
      trim: true
    },
    description: {
      type: String,
      required: [true, 'Subject description is required'],
      trim: true
    }
  }],
  content: {
    type: String,
    trim: true
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create index for efficient querying
diarySchema.index({ classId: 1, date: -1 });
diarySchema.index({ isActive: 1, date: -1 });

const Diary = mongoose.model('Diary', diarySchema);

export default Diary;
