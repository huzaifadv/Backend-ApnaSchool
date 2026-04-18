import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: [true, 'School ID is required']
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: [true, 'Class ID is required']
  },
  rollNumber: {
    type: String,
    required: [true, 'Roll number is required'],
    trim: true
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters']
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: [true, 'Gender is required']
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  pincode: {
    type: String,
    trim: true
  },
  parentName: {
    type: String,
    required: [true, 'Parent name is required'],
    trim: true
  },
  parentPhone: {
    type: String,
    required: [true, 'Parent phone is required'],
    trim: true
  },
  parentEmail: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  parentAccessCode: {
    type: String,
    required: [true, 'Parent access code is required'],
    unique: true,
    trim: true,
    length: 8
  },
  admissionDate: {
    type: Date,
    default: Date.now
  },
  monthlyFee: {
    type: Number,
    default: 0,
    min: [0, 'Monthly fee cannot be negative']
  },
  feeDueDate: {
    type: Number,
    default: 1,
    min: [1, 'Fee due date must be between 1 and 31'],
    max: [31, 'Fee due date must be between 1 and 31']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Academic Year Management - ADDED FOR PROMOTION FEATURE
  currentAcademicYear: {
    type: String,
    trim: true
    // Optional - will be set during first promotion or migration
    // Format: '2024-2025'
  },
  status: {
    type: String,
    enum: ['active', 'passedOut', 'inactive'],
    default: 'active'
  },
  profilePicture: {
    type: String,
    default: '/assets/default-student.png'
  },
  enrollmentHistory: [{
    academicYear: {
      type: String,
      required: true,
      trim: true
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true
    },
    className: {
      type: String,
      required: true,
      trim: true
    },
    section: {
      type: String,
      required: true,
      trim: true
    },
    rollNumber: {
      type: String,
      required: true,
      trim: true
    },
    promotionType: {
      type: String,
      enum: ['promoted', 'repeated', 'new_admission', 'passedOut'],
      required: true
    },
    promotionDate: {
      type: Date,
      required: true
    },
    remarks: {
      type: String,
      trim: true
    }
  }]
}, {
  timestamps: true
});

// Create compound index to ensure unique roll number per school
studentSchema.index({ schoolId: 1, rollNumber: 1 }, { unique: true });

const Student = mongoose.model('Student', studentSchema);

export default Student;
