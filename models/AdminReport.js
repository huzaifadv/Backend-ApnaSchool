import mongoose from 'mongoose';

const adminReportSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: [true, 'School ID is required']
  },
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

// Create index
adminReportSchema.index({ schoolId: 1, 'student._id': 1 });

const AdminReport = mongoose.model('AdminReport', adminReportSchema);

export default AdminReport;
