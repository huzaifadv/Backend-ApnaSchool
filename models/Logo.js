import mongoose from 'mongoose';

const logoSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Logo name is required'],
    trim: true
  },
  imageUrl: {
    type: String,
    required: [true, 'Logo image URL is required']
  },
  cloudinaryPublicId: {
    type: String,
    required: [true, 'Cloudinary public ID is required']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for faster queries
logoSchema.index({ isActive: 1, order: 1 });

const Logo = mongoose.model('Logo', logoSchema);

export default Logo;
