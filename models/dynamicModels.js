import mongoose from 'mongoose';
import { getTenantConnection } from '../config/tenantDB.js';

/**
 * Dynamic Model Loader for Multi-tenant Architecture
 * Loads models from the correct tenant database based on schoolId
 */

// Cache for compiled models per tenant
// Structure: { schoolId: { modelName: Model } }
const tenantModels = new Map();

/**
 * Define all model schemas
 * Schemas are defined once and reused across all tenant databases
 */

// Student Schema
const studentSchema = new mongoose.Schema({
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
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: [true, 'Gender is required']
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  fatherName: {
    type: String,
    required: [true, 'Father name is required'],
    trim: true
  },
  parentName: {
    type: String,
    trim: true
  },
  parentPhone: {
    type: String,
    required: [true, 'Parent phone is required'],
    trim: true
  },
  parentAccessCode: {
    type: String,
    required: [true, 'Parent access code is required'],
    unique: true,
    trim: true,
    length: 8
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
  },
  status: {
    type: String,
    enum: ['active', 'passedOut', 'inactive'],
    default: 'active'
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

// Index for faster lookups within each tenant database
studentSchema.index({ rollNumber: 1 });

// Class Schema
const classSchema = new mongoose.Schema({
  className: {
    type: String,
    required: [true, 'Class name is required'],
    trim: true
  },
  section: {
    type: String,
    trim: true,
    uppercase: true,
    default: ''
  },
  academicYear: {
    type: String,
    trim: true,
    default: ''
  },
  classTeacher: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Remove unique index since each tenant has its own database
// Each school can have same class names independently
classSchema.index({ className: 1, section: 1, academicYear: 1 });

// Admin Schema
const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Admin name is required'],
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
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'teacher'],
    default: 'admin'
  },
  phone: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Email Verification Fields (Feature 1)
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationOTP: {
    type: String // SHA256 hashed OTP
  },
  emailVerificationExpires: {
    type: Date
  },
  // Password Reset Fields (Feature 2)
  resetPasswordCode: {
    type: String // SHA256 hashed OTP
  },
  resetPasswordExpires: {
    type: Date
  }
}, {
  timestamps: true
});

// Attendance Schema
const attendanceSchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: [true, 'Class ID is required']
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Student ID is required']
  },
  date: {
    type: Date,
    required: [true, 'Attendance date is required'],
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Late', 'Half Day', 'Excused'],
    required: [true, 'Attendance status is required'],
    default: 'Present'
  },
  remarks: {
    type: String,
    trim: true
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  period: {
    type: String,
    enum: ['Full Day', 'Morning', 'Afternoon'],
    default: 'Full Day'
  }
}, {
  timestamps: true
});

// Create compound index to ensure one attendance record per student per date
attendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ classId: 1, date: 1 });

// Notice Schema
const noticeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Notice title is required'],
    trim: true
  },
  content: {
    type: String,
    required: [true, 'Notice content is required']
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  targetAudience: {
    type: String,
    enum: ['all', 'students', 'parents', 'teachers', 'specific_class'],
    default: 'all'
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },
  targetClasses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiryDate: {
    type: Date
  }
}, {
  timestamps: true
});

noticeSchema.index({ createdAt: -1 });
noticeSchema.index({ targetAudience: 1, isActive: 1 });

// Report Schema
const reportSchema = new mongoose.Schema({
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
  reportType: {
    type: String,
    enum: ['academic', 'behavior', 'attendance', 'overall'],
    required: [true, 'Report type is required']
  },
  academicYear: {
    type: String,
    required: [true, 'Academic year is required']
  },
  term: {
    type: String,
    enum: ['Term 1', 'Term 2', 'Mid-term', 'Final', 'Annual'],
    required: [true, 'Term is required']
  },
  subjects: [{
    name: String,
    marks: Number,
    maxMarks: Number,
    grade: String,
    remarks: String
  }],
  totalMarks: Number,
  percentage: Number,
  grade: String,
  rank: Number,
  remarks: String,
  teacherComments: String,
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

reportSchema.index({ studentId: 1, academicYear: 1, term: 1 });
reportSchema.index({ classId: 1, academicYear: 1 });

// Diary Schema
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

diarySchema.index({ classId: 1, date: -1 });
diarySchema.index({ isActive: 1, date: -1 });

// Teacher Schema
const teacherSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    trim: true,
    unique: true
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
    type: Number,
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
  }
}, {
  timestamps: true
});

teacherSchema.index({ employeeId: 1 });

// AdminReport Schema
const adminReportSchema = new mongoose.Schema({
  student: {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    rollNumber: {
      type: String,
      required: true
    },
    class: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
      },
      name: {
        type: String,
        required: true
      },
      section: {
        type: String,
        required: true
      }
    }
  },
  title: {
    type: String,
    required: [true, 'Report title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Report description is required'],
    trim: true
  },
  fileUrl: {
    type: String,
    trim: true
  },
  fileName: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Create index for faster queries
adminReportSchema.index({ 'student._id': 1 });
adminReportSchema.index({ createdAt: -1 });

// FeePayment Schema
const feePaymentSchema = new mongoose.Schema({
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
  }
}, {
  timestamps: true
});

// Compound index to ensure one payment record per student per month per year
feePaymentSchema.index({ studentId: 1, month: 1, year: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// STAFF MANAGEMENT SCHEMAS  (new — do NOT touch existing schemas above)
// ─────────────────────────────────────────────────────────────────────────────

// Staff Schema
const staffSchema = new mongoose.Schema({
  staffId: {
    type: String,
    required: true,
    unique: true,
    trim: true
    // Format: STF-<YEAR>-<4-digit-seq>  e.g. STF-2026-0001
    // Generated by staffController before save — never from client
  },
  name: {
    type: String,
    required: [true, 'Staff name is required'],
    trim: true
  },
  cnic: {
    type: String,
    required: [true, 'CNIC is required'],
    trim: true
    // Validated as 13-digit in controller; stored as plain string
    // Do NOT store as unique here — tenant DB isolation already scopes it
  },
  contact: {
    type: String,
    required: [true, 'Contact number is required'],
    trim: true
  },
  qualification: {
    type: String,
    trim: true
  },
  joiningDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  // References to existing Class documents (read-only refs — staff NEVER writes to Class)
  assignedClasses: [{
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class'
    },
    className: { type: String, trim: true },
    section:   { type: String, trim: true }
  }],
  // Subject names as strings (no separate Subject collection exists yet)
  assignedSubjects: [{
    type: String,
    trim: true
  }],
  // Base salary — stored here for reference only; full history in staffsalaryhistory
  baseSalary: {
    type: Number,
    default: 0,
    min: [0, 'Salary cannot be negative']
  },
  // Day of month when salary is due (e.g. 5 means 5th of every month)
  salaryDueDate: {
    type: Number,
    min: [1, 'Due date must be between 1 and 31'],
    max: [31, 'Due date must be between 1 and 31'],
    default: null
  },
  role: {
    type: String,
    enum: ['teacher', 'coordinator', 'admin_staff'],
    default: 'teacher'
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false   // Never returned in queries unless explicitly asked
  },
  isActive: {
    type: Boolean,
    default: true
  },
  profileImage: {
    type: String
  }
}, {
  timestamps: true
});

staffSchema.index({ staffId: 1 });
staffSchema.index({ status: 1 });

// StaffSalaryHistory Schema
const staffSalaryHistorySchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: [true, 'Staff ID is required']
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
  basicSalary: {
    type: Number,
    required: [true, 'Basic salary is required'],
    min: [0, 'Salary cannot be negative']
  },
  allowances: {
    type: Number,
    default: 0,
    min: [0, 'Allowances cannot be negative']
  },
  deductions: {
    type: Number,
    default: 0,
    min: [0, 'Deductions cannot be negative']
  },
  netSalary: {
    type: Number,
    required: [true, 'Net salary is required'],
    min: [0, 'Net salary cannot be negative']
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: [0, 'Amount paid cannot be negative']
  },
  status: {
    type: String,
    enum: ['paid', 'pending', 'partial'],
    default: 'pending'
  },
  paidAt: {
    type: Date
  },
  remarks: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'   // Admin who recorded this payment
  }
}, {
  timestamps: true
});

// One salary record per staff per month per year
staffSalaryHistorySchema.index({ staffId: 1, month: 1, year: 1 }, { unique: true });

// StaffAttendance Schema (self-attendance with admin verification)
const staffAttendanceSchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: [true, 'Staff ID is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required']
  },
  checkInTime: {
    type: Date
  },
  checkOutTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'half_day', 'leave'],
    default: 'present'
  },
  markedBy: {
    type: String,
    enum: ['self', 'admin'],
    default: 'self'
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'   // Populated only after admin action
  },
  verifiedAt: {
    type: Date
  },
  remarks: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// One self-attendance record per staff per date
staffAttendanceSchema.index({ staffId: 1, date: 1 }, { unique: true });

// StaffClassAttendance Schema
// Staff marks attendance FOR students — SEPARATE from existing Attendance collection
const staffClassAttendanceSchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: [true, 'Staff ID is required']
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: [true, 'Class ID is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required']
  },
  attendanceRecords: [{
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'leave'],
      default: 'present'
    }
  }],
  subject: {
    type: String,
    trim: true
  },
  period: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// One class attendance sheet per staff per class per date
staffClassAttendanceSchema.index({ staffId: 1, classId: 1, date: 1 }, { unique: true });
staffClassAttendanceSchema.index({ classId: 1, date: 1 });

// StaffDiary Schema
const staffDiarySchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: [true, 'Staff ID is required']
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: [true, 'Class ID is required']
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    default: Date.now
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  type: {
    type: String,
    enum: ['diary', 'homework'],
    default: 'diary'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

staffDiarySchema.index({ staffId: 1, classId: 1, date: -1 });
staffDiarySchema.index({ classId: 1, date: -1 });

// StaffMarks Schema
// Staff enters marks — separate from existing Report/adminReport collections
const staffMarksSchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: [true, 'Staff ID is required']
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: [true, 'Class ID is required']
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Student ID is required']
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  examType: {
    type: String,
    enum: ['monthly', 'midterm', 'final', 'quiz', 'assignment'],
    required: [true, 'Exam type is required']
  },
  totalMarks: {
    type: Number,
    required: [true, 'Total marks is required'],
    min: [1, 'Total marks must be at least 1']
  },
  obtainedMarks: {
    type: Number,
    required: [true, 'Obtained marks is required'],
    min: [0, 'Obtained marks cannot be negative']
  },
  academicYear: {
    type: String,
    trim: true
  },
  remarks: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Prevent duplicate mark entries
staffMarksSchema.index({ staffId: 1, studentId: 1, subject: 1, examType: 1, academicYear: 1 }, { unique: true });
staffMarksSchema.index({ classId: 1, examType: 1 });

// StaffMonthlyReport Schema
const staffMonthlyReportSchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: [true, 'Staff ID is required']
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: [true, 'Class ID is required']
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true
  },
  totalClassesTaken: {
    type: Number,
    default: 0
  },
  topicsCompleted: [{
    type: String,
    trim: true
  }],
  pendingTopics: [{
    type: String,
    trim: true
  }],
  remarks: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['draft', 'submitted'],
    default: 'draft'
  },
  submittedAt: {
    type: Date
  }
}, {
  timestamps: true
});

staffMonthlyReportSchema.index({ staffId: 1, classId: 1, month: 1, year: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// END STAFF SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

// AcademicYear Schema
const academicYearSchema = new mongoose.Schema({
  year: {
    type: String,
    required: [true, 'Academic year is required'],
    trim: true,
    match: [/^\d{4}-\d{4}$/, 'Academic year must be in format YYYY-YYYY (e.g., 2024-2025)']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  isActive: {
    type: Boolean,
    default: false
  },
  isCurrent: {
    type: Boolean,
    default: false
  },
  promotionDate: {
    type: Date
  },
  isPromotionCompleted: {
    type: Boolean,
    default: false
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Ensure unique academic year per tenant
academicYearSchema.index({ year: 1 }, { unique: true });
// Ensure only one current academic year per tenant
academicYearSchema.index({ isCurrent: 1 }, {
  unique: true,
  partialFilterExpression: { isCurrent: true }
});

/**
 * Model name mapping - maps collection names to proper model names
 * This ensures consistent model naming across the application
 */
const modelNameMapping = {
  students: 'Student',
  classes: 'Class',
  admins: 'Admin',
  attendance: 'Attendance',
  notices: 'Notice',
  reports: 'Report',
  diary: 'Diary',
  teachers: 'Teacher',
  adminReports: 'AdminReport',
  feepayments: 'FeePayment',
  academicyears: 'AcademicYear',
  // ── Staff Management (new — additive only) ──────────────────────────────
  staffs: 'Staff',
  staffsalaryhistory: 'StaffSalaryHistory',
  staffattendance: 'StaffAttendance',
  staffclassattendance: 'StaffClassAttendance',
  staffdiary: 'StaffDiary',
  staffmarks: 'StaffMarks',
  staffmonthlyreports: 'StaffMonthlyReport'
};

/**
 * Schema registry - maps collection names to their schemas
 */
const schemaRegistry = {
  students: studentSchema,
  classes: classSchema,
  admins: adminSchema,
  attendance: attendanceSchema,
  notices: noticeSchema,
  reports: reportSchema,
  diary: diarySchema,
  teachers: teacherSchema,
  adminReports: adminReportSchema,
  feepayments: feePaymentSchema,
  academicyears: academicYearSchema,
  // ── Staff Management (new — additive only) ──────────────────────────────
  staffs: staffSchema,
  staffsalaryhistory: staffSalaryHistorySchema,
  staffattendance: staffAttendanceSchema,
  staffclassattendance: staffClassAttendanceSchema,
  staffdiary: staffDiarySchema,
  staffmarks: staffMarksSchema,
  staffmonthlyreports: staffMonthlyReportSchema
};

/**
 * Get or create a model for a specific tenant database
 * @param {String} schoolId - School's MongoDB ObjectId
 * @param {String} collectionName - Name of the collection (students, classes, etc.)
 * @returns {Model} Mongoose model for the specified tenant and collection
 */
export const getModel = async (schoolId, collectionName) => {
  if (!schoolId) {
    throw new Error('School ID is required to get model');
  }

  if (!collectionName) {
    throw new Error('Collection name is required to get model');
  }

  const schoolIdStr = schoolId.toString();

  // Check if schema exists for this collection
  if (!schemaRegistry[collectionName]) {
    throw new Error(`No schema found for collection: ${collectionName}`);
  }

  // Check if model is already cached
  if (!tenantModels.has(schoolIdStr)) {
    tenantModels.set(schoolIdStr, {});
  }

  const schoolModels = tenantModels.get(schoolIdStr);

  if (schoolModels[collectionName]) {
    return schoolModels[collectionName];
  }

  // Create new model for this tenant
  try {
    const connection = await getTenantConnection(schoolId);
    const schema = schemaRegistry[collectionName];

    // Use proper model name from mapping
    const modelName = modelNameMapping[collectionName];

    if (!modelName) {
      throw new Error(`No model name mapping found for collection: ${collectionName}`);
    }

    // Check if model already exists in connection
    try {
      const existingModel = connection.model(modelName);
      schoolModels[collectionName] = existingModel;
      return existingModel;
    } catch (e) {
      // Model doesn't exist, create it
      const model = connection.model(modelName, schema, collectionName);

      // Cache the model
      schoolModels[collectionName] = model;

      return model;
    }
  } catch (error) {
    console.error(`Failed to get model for ${collectionName} in school ${schoolIdStr}:`, error.message);
    throw error;
  }
};

/**
 * Clear cached models for a specific tenant
 * Useful when a tenant's connection is closed
 * @param {String} schoolId - School's MongoDB ObjectId
 */
export const clearTenantModels = (schoolId) => {
  const schoolIdStr = schoolId.toString();
  if (tenantModels.has(schoolIdStr)) {
    tenantModels.delete(schoolIdStr);
    console.log(`Cleared cached models for school: ${schoolIdStr}`);
  }
};

/**
 * Get all cached models statistics
 * Useful for monitoring
 */
export const getModelCacheStats = () => {
  const stats = {
    totalTenants: tenantModels.size,
    tenants: []
  };

  tenantModels.forEach((models, schoolId) => {
    stats.tenants.push({
      schoolId,
      cachedModels: Object.keys(models)
    });
  });

  return stats;
};

export default getModel;
