import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Blog title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    content: {
      type: String,
      required: [true, 'Blog content is required'],
      maxlength: [15000, 'Content cannot exceed 15000 characters'],
    },
    image: {
      type: String,
      required: [true, 'Blog image is required'],
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

// Generate slug from title before saving
blogSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
  }
  next();
});

// Index for faster queries (slug already has unique: true, no need for separate index)
blogSchema.index({ isPublished: 1, publishedAt: -1 });

const Blog = mongoose.model('Blog', blogSchema);

export default Blog;
