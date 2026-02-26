import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a course title'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    category: {
      type: String,
      required: [true, 'Please provide a category'],
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Please provide course description'],
      maxlength: [15000, 'Content cannot exceed 15000 characters'],
    },
    playlistUrl: {
      type: String,
      required: [true, 'Please provide YouTube playlist URL'],
      trim: true,
      validate: {
        validator: function(v) {
          // YouTube playlist URL validation
          return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(playlist|watch)\?.*list=/.test(v);
        },
        message: 'Please provide a valid YouTube playlist URL'
      }
    },
    thumbnail: {
      type: String,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SuperAdmin',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create slug from title before saving
courseSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/--+/g, '-') // Replace multiple - with single -
      .trim();
  }
  next();
});

// Index for faster queries
courseSchema.index({ slug: 1 });
courseSchema.index({ isPublished: 1, publishedAt: -1 });

const Course = mongoose.model('Course', courseSchema);

export default Course;
