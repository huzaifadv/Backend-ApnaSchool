import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a title'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    content: {
      type: String,
      required: [true, 'Please provide content'],
      maxlength: [15000, 'Content cannot exceed 15000 characters'],
    },
    videoUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          if (!v) return true; // Optional field
          // Accept YouTube URLs or embed URLs
          return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(v) ||
                 /^https?:\/\/.+/.test(v); // Allow any valid URL for flexibility
        },
        message: 'Please provide a valid YouTube URL or video embed URL'
      }
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
newsSchema.pre('save', function (next) {
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
newsSchema.index({ slug: 1 });
newsSchema.index({ isPublished: 1, publishedAt: -1 });

const News = mongoose.model('News', newsSchema);

export default News;
