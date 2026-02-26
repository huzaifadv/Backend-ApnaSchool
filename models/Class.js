import mongoose from 'mongoose';

const classSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: [true, 'School ID is required']
  },
  className: {
    type: String,
    required: [true, 'Class name is required'],
    trim: true
  },
  section: {
    type: String,
    required: [true, 'Section is required'],
    trim: true,
    uppercase: true
  },
  grade: {
    type: String,
    required: [true, 'Grade is required'],
    trim: true
  },
  academicYear: {
    type: String,
    required: [true, 'Academic year is required'],
    trim: true
  },
  classTeacher: {
    type: String,
    trim: true
  },
  room: {
    type: String,
    trim: true
  },
  capacity: {
    type: Number,
    default: 40
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create compound index to ensure unique class-section combination per school
classSchema.index({ schoolId: 1, className: 1, section: 1, academicYear: 1 }, { unique: true });

const Class = mongoose.model('Class', classSchema);

export default Class;
