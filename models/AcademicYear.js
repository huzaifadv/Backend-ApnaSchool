import mongoose from 'mongoose';

const academicYearSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: [true, 'School ID is required']
  },
  year: {
    type: String,
    required: [true, 'Academic year is required'],
    trim: true,
    // Format: '2024-2025'
    match: [/^\d{4}-\d{4}$/, 'Academic year must be in format YYYY-YYYY (e.g., 2024-2025)']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: {
      validator: function(value) {
        return value > this.startDate;
      },
      message: 'End date must be after start date'
    }
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

// Ensure unique academic year per school
academicYearSchema.index({ schoolId: 1, year: 1 }, { unique: true });

// Ensure only one current academic year per school
academicYearSchema.index({ schoolId: 1, isCurrent: 1 }, {
  unique: true,
  partialFilterExpression: { isCurrent: true }
});

const AcademicYear = mongoose.model('AcademicYear', academicYearSchema);

export default AcademicYear;
