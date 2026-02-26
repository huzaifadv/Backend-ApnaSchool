import Logo from '../models/Logo.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify Cloudinary configuration
console.log('✅ Cloudinary Logo Upload Configuration:');
console.log('   Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME || '❌ NOT SET');
console.log('   API Key:', process.env.CLOUDINARY_API_KEY ? '***SET***' : '❌ NOT SET');
console.log('   API Secret:', process.env.CLOUDINARY_API_SECRET ? '***SET***' : '❌ NOT SET');

// Configure Cloudinary Storage for Logo Images
const logoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: 'apnaschool/logos',
      allowed_formats: ['webp', 'jpg', 'jpeg'], // WEBP and JPEG formats
      transformation: [
        {
          width: 500,
          height: 500,
          crop: 'limit', // Resize to fit within 500x500, maintaining aspect ratio
          quality: 'auto:good'
        }
      ],
      public_id: `logo_${Date.now()}`, // Unique filename
    };
  },
});

// Custom file filter for logos - WEBP and JPEG only, max 150KB
const logoFileFilter = async (req, file, cb) => {
  console.log('=== LOGO UPLOAD VALIDATION ===');
  console.log('File mimetype:', file.mimetype);
  console.log('Original name:', file.originalname);

  // Check file type - WEBP and JPEG only
  const allowedTypes = ['image/webp', 'image/jpeg', 'image/jpg'];
  if (!allowedTypes.includes(file.mimetype)) {
    console.log('❌ File type rejected:', file.mimetype);
    return cb(new Error('Only WEBP and JPEG formats are allowed for logos'), false);
  }

  console.log('✅ File type validation passed');
  cb(null, true);
};

// Configure multer for logo uploads
export const uploadLogo = multer({
  storage: logoStorage,
  fileFilter: logoFileFilter,
  limits: {
    fileSize: 150 * 1024 // 150KB limit
  }
});

// Middleware to validate image dimensions and size
export const validateLogoImage = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded'
    });
  }

  try {
    console.log('=== VALIDATING LOGO IMAGE ===');
    console.log('File size:', req.file.size, 'bytes');
    console.log('File size KB:', (req.file.size / 1024).toFixed(2), 'KB');

    // Check file size - Max 150KB
    if (req.file.size > 150 * 1024) {
      // Delete uploaded file from Cloudinary
      if (req.file.filename) {
        await cloudinary.uploader.destroy(req.file.filename);
      }

      return res.status(400).json({
        success: false,
        message: `Logo file size must be less than 150KB. Current size: ${(req.file.size / 1024).toFixed(2)}KB`
      });
    }

    console.log('✅ Logo validation passed');
    next();
  } catch (error) {
    console.error('Logo validation error:', error);

    // Delete uploaded file from Cloudinary if it exists
    if (req.file && req.file.filename) {
      try {
        await cloudinary.uploader.destroy(req.file.filename);
      } catch (deleteError) {
        console.error('Error deleting file from Cloudinary:', deleteError);
      }
    }

    return res.status(400).json({
      success: false,
      message: 'Logo validation failed: ' + error.message
    });
  }
};

// @desc    Upload new logo
// @route   POST /api/super/logos
// @access  Private (Super Admin only)
export const createLogo = async (req, res) => {
  try {
    console.log('=== CREATE LOGO ===');
    console.log('Request body:', req.body);
    console.log('Uploaded file:', req.file);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Logo image is required'
      });
    }

    const { name } = req.body;

    if (!name) {
      // Delete uploaded file from Cloudinary
      await cloudinary.uploader.destroy(req.file.filename);

      return res.status(400).json({
        success: false,
        message: 'Logo name is required'
      });
    }

    // Get the next order number
    const lastLogo = await Logo.findOne().sort({ order: -1 });
    const nextOrder = lastLogo ? lastLogo.order + 1 : 1;

    // Create logo entry
    const logo = await Logo.create({
      name,
      imageUrl: req.file.path, // Cloudinary URL
      cloudinaryPublicId: req.file.filename, // Cloudinary public ID
      order: nextOrder
    });

    res.status(201).json({
      success: true,
      message: 'Logo uploaded successfully',
      data: logo
    });
  } catch (error) {
    console.error('Create logo error:', error);

    // Delete uploaded file from Cloudinary if it exists
    if (req.file && req.file.filename) {
      try {
        await cloudinary.uploader.destroy(req.file.filename);
      } catch (deleteError) {
        console.error('Error deleting file from Cloudinary:', deleteError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload logo: ' + error.message
    });
  }
};

// @desc    Get all logos
// @route   GET /api/super/logos
// @access  Private (Super Admin only)
export const getAllLogos = async (req, res) => {
  try {
    console.log('📋 Fetching all logos...');
    const logos = await Logo.find().sort({ order: 1 });
    console.log(`✅ Found ${logos.length} logos`);

    res.status(200).json({
      success: true,
      count: logos.length,
      data: logos
    });
  } catch (error) {
    console.error('❌ Get all logos error:', error);
    console.error('Error details:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logos: ' + error.message
    });
  }
};

// @desc    Get active logos (for frontend)
// @route   GET /api/logos
// @access  Public
export const getActiveLogos = async (req, res) => {
  try {
    const logos = await Logo.find({ isActive: true }).sort({ order: 1 });

    res.status(200).json({
      success: true,
      count: logos.length,
      data: logos
    });
  } catch (error) {
    console.error('Get active logos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logos'
    });
  }
};

// @desc    Delete logo
// @route   DELETE /api/super/logos/:id
// @access  Private (Super Admin only)
export const deleteLogo = async (req, res) => {
  try {
    const logo = await Logo.findById(req.params.id);

    if (!logo) {
      return res.status(404).json({
        success: false,
        message: 'Logo not found'
      });
    }

    // Delete from Cloudinary
    if (logo.cloudinaryPublicId) {
      await cloudinary.uploader.destroy(logo.cloudinaryPublicId);
    }

    // Delete from database
    await Logo.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Logo deleted successfully'
    });
  } catch (error) {
    console.error('Delete logo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete logo'
    });
  }
};

// @desc    Toggle logo active status
// @route   PATCH /api/super/logos/:id/toggle
// @access  Private (Super Admin only)
export const toggleLogoStatus = async (req, res) => {
  try {
    const logo = await Logo.findById(req.params.id);

    if (!logo) {
      return res.status(404).json({
        success: false,
        message: 'Logo not found'
      });
    }

    logo.isActive = !logo.isActive;
    await logo.save();

    res.status(200).json({
      success: true,
      message: `Logo ${logo.isActive ? 'activated' : 'deactivated'} successfully`,
      data: logo
    });
  } catch (error) {
    console.error('Toggle logo status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle logo status'
    });
  }
};

// @desc    Update logo order
// @route   PATCH /api/super/logos/reorder
// @access  Private (Super Admin only)
export const reorderLogos = async (req, res) => {
  try {
    const { logos } = req.body; // Array of { id, order }

    if (!logos || !Array.isArray(logos)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request format'
      });
    }

    // Update each logo's order
    const updatePromises = logos.map(({ id, order }) =>
      Logo.findByIdAndUpdate(id, { order }, { new: true })
    );

    await Promise.all(updatePromises);

    const updatedLogos = await Logo.find().sort({ order: 1 });

    res.status(200).json({
      success: true,
      message: 'Logo order updated successfully',
      data: updatedLogos
    });
  } catch (error) {
    console.error('Reorder logos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder logos'
    });
  }
};
