import mongoose from 'mongoose';

const teacherSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
    // index removed - covered by compound index below
  },
  employeeId: {
    type: String,
    required: true,
    trim: true
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },
  dateOfBirth: {
    type: Date
  },
  qualification: {
    type: String,
    trim: true
  },
  specialization: {
    type: String,
    trim: true
  },
  experience: {
    type: Number, // in years
    default: 0
  },
  joiningDate: {
    type: Date,
    default: Date.now
  },
  subjects: [{
    type: String,
    trim: true
  }],
  assignedClasses: [{
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class'
    },
    className: String,
    section: String
  }],
  address: {
    type: String,
    trim: true
  },
  city: {
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
  emergencyContact: {
    name: String,
    relation: String,
    phone: String
  },
  salary: {
    type: Number
  },
  isActive: {
    type: Boolean,
    default: true
  },
  profileImage: {
    type: String
  },
  profilePicture: {
    type: String,
    default: '/assets/default-staff.png'
  }
}, {
  timestamps: true
});

// Compound index for unique employee ID per school
teacherSchema.index({ schoolId: 1, employeeId: 1 }, { unique: true });

// Virtual for calculating age
teacherSchema.virtual('age').get(function () {
  if (this.dateOfBirth) {
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }
  return null;
});

export default mongoose.model('Teacher', teacherSchema);
