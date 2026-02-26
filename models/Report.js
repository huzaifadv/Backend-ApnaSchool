import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
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
  examType: {
    type: String,
    required: [true, 'Exam type is required'],
    enum: ['Unit Test', 'Mid Term', 'Final', 'Quarterly', 'Half Yearly', 'Annual'],
    trim: true
  },
  academicYear: {
    type: String,
    required: [true, 'Academic year is required'],
    trim: true
  },
  subjects: [{
    subjectName: {
      type: String,
      required: true,
      trim: true
    },
    marksObtained: {
      type: Number,
      required: true,
      min: 0
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 0
    },
    grade: {
      type: String,
      trim: true
    }
  }],
  totalMarksObtained: {
    type: Number,
    required: true,
    min: 0
  },
  totalMarks: {
    type: Number,
    required: true,
    min: 0
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  overallGrade: {
    type: String,
    trim: true
  },
  rank: {
    type: Number,
    min: 1
  },
  remarks: {
    type: String,
    trim: true
  },
  publishedDate: {
    type: Date
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  reportFileUrl: {
    type: String,
    trim: true
  },
  reportFileName: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Create compound index
reportSchema.index({ schoolId: 1, studentId: 1, examType: 1, academicYear: 1 });

const Report = mongoose.model('Report', reportSchema);

export default Report;
