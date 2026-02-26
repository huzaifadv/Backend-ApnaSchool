import Blog from '../models/Blog.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';

// ⚠️ CRITICAL: Load .env in case this file is imported before server.js
dotenv.config();

// ============================================
// CLOUDINARY CONFIGURATION - FRESH SETUP
// ============================================

// Step 1: Configure Cloudinary with credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Step 2: Verify configuration on startup
console.log('✅ Cloudinary Configuration Loaded:');
console.log('   Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('   API Key:', process.env.CLOUDINARY_API_KEY ? '***SET***' : '❌ NOT SET');
console.log('   API Secret:', process.env.CLOUDINARY_API_SECRET ? '***SET***' : '❌ NOT SET');

// Step 3: Configure Cloudinary Storage for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'apnaschool/blogs',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 630, crop: 'limit', quality: 'auto' }],
  },
});

// Step 4: Configure Multer with file validation
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true); // Accept file
    } else {
      cb(new Error('Invalid file type. Only JPEG, JPG, PNG, and WEBP are allowed.'), false);
    }
  },
});

// ============================================
// BLOG CONTROLLERS
// ============================================

/**
 * @desc    Get all blogs (public)
 * @route   GET /api/blogs
 * @access  Public
 */
export const getAllBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find({ isPublished: true })
      .sort({ publishedAt: -1 })
      .select('title content image slug publishedAt createdAt');

    res.status(200).json({
      success: true,
      count: blogs.length,
      data: blogs,
    });
  } catch (error) {
    console.error('Get All Blogs Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching blogs',
    });
  }
};

/**
 * @desc    Get single blog by slug (public)
 * @route   GET /api/blogs/:slug
 * @access  Public
 */
export const getBlogBySlug = async (req, res) => {
  try {
    const blog = await Blog.findOne({
      slug: req.params.slug,
      isPublished: true
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    console.error('Get Blog By Slug Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching blog',
    });
  }
};

/**
 * @desc    Get all blogs for super admin (including unpublished)
 * @route   GET /api/super-admin/blogs
 * @access  Private (Super Admin)
 */
export const getAllBlogsAdmin = async (req, res) => {
  try {
    const blogs = await Blog.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      count: blogs.length,
      data: blogs,
    });
  } catch (error) {
    console.error('Get All Blogs Admin Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching blogs',
    });
  }
};

/**
 * @desc    Create new blog
 * @route   POST /api/super-admin/blogs
 * @access  Private (Super Admin)
 */
export const createBlog = async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('📝 CREATE BLOG REQUEST RECEIVED');
    console.log('========================================');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('File:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      cloudinaryPath: req.file.path
    } : 'No file uploaded');
    console.log('Super Admin ID:', req.superAdmin?.id);
    console.log('========================================\n');

    const { title, content } = req.body;

    // Validation: Check title
    if (!title || !title.trim()) {
      console.log('❌ Validation Error: Title is missing');
      return res.status(400).json({
        success: false,
        message: 'Please provide a title',
      });
    }

    // Validation: Check content
    if (!content || !content.trim()) {
      console.log('❌ Validation Error: Content is missing');
      return res.status(400).json({
        success: false,
        message: 'Please provide content',
      });
    }

    // Validation: Check image
    if (!req.file) {
      console.log('❌ Validation Error: Image is missing');
      return res.status(400).json({
        success: false,
        message: 'Please upload an image',
      });
    }

    // Validation: Check word count (1500 words max)
    const wordCount = content.trim().split(/\s+/).length;
    console.log('📊 Content word count:', wordCount);

    if (wordCount > 1500) {
      console.log('❌ Validation Error: Content exceeds 1500 words');
      return res.status(400).json({
        success: false,
        message: `Content cannot exceed 1500 words. Current: ${wordCount} words`,
      });
    }

    // Get Cloudinary image URL (already uploaded by multer)
    const imageUrl = req.file.path;
    console.log('✅ Cloudinary Image URL:', imageUrl);

    // Create blog in database
    const blog = await Blog.create({
      title: title.trim(),
      content: content.trim(),
      image: imageUrl,
      createdBy: req.superAdmin.id,
    });

    console.log('✅ Blog created successfully! ID:', blog._id);
    console.log('========================================\n');

    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: blog,
    });

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ CREATE BLOG ERROR');
    console.error('========================================');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('========================================\n');

    res.status(500).json({
      success: false,
      message: 'Server error creating blog',
      error: error.message,
    });
  }
};

/**
 * @desc    Update blog
 * @route   PUT /api/super-admin/blogs/:id
 * @access  Private (Super Admin)
 */
export const updateBlog = async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('✏️  UPDATE BLOG REQUEST RECEIVED');
    console.log('========================================');
    console.log('Blog ID:', req.params.id);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('New File:', req.file ? req.file.originalname : 'No new file');
    console.log('========================================\n');

    const { title, content, isPublished } = req.body;

    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      console.log('❌ Blog not found with ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    // Update title if provided
    if (title) {
      blog.title = title.trim();
    }

    // Update content if provided
    if (content) {
      const wordCount = content.trim().split(/\s+/).length;
      if (wordCount > 1500) {
        console.log('❌ Content exceeds 1500 words:', wordCount);
        return res.status(400).json({
          success: false,
          message: `Content cannot exceed 1500 words. Current: ${wordCount} words`,
        });
      }
      blog.content = content.trim();
    }

    // Update publish status if provided
    if (typeof isPublished !== 'undefined') {
      blog.isPublished = isPublished;
    }

    // Update image if new one is uploaded
    if (req.file) {
      console.log('🔄 Updating image...');

      // Delete old image from Cloudinary
      if (blog.image) {
        try {
          // Extract public_id from Cloudinary URL
          const urlParts = blog.image.split('/');
          const publicIdWithExt = urlParts.slice(-2).join('/'); // e.g., "apnaschool/blogs/image.jpg"
          const publicId = publicIdWithExt.split('.')[0]; // Remove extension

          console.log('🗑️  Deleting old image from Cloudinary:', publicId);
          await cloudinary.uploader.destroy(publicId);
          console.log('✅ Old image deleted');
        } catch (error) {
          console.error('⚠️  Error deleting old image:', error.message);
          // Continue anyway - not critical
        }
      }

      // Set new image URL
      blog.image = req.file.path;
      console.log('✅ New image URL:', req.file.path);
    }

    await blog.save();

    console.log('✅ Blog updated successfully!');
    console.log('========================================\n');

    res.status(200).json({
      success: true,
      message: 'Blog updated successfully',
      data: blog,
    });
  } catch (error) {
    console.error('\n❌ UPDATE BLOG ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating blog',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete blog
 * @route   DELETE /api/super-admin/blogs/:id
 * @access  Private (Super Admin)
 */
export const deleteBlog = async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('🗑️  DELETE BLOG REQUEST RECEIVED');
    console.log('========================================');
    console.log('Blog ID:', req.params.id);
    console.log('========================================\n');

    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      console.log('❌ Blog not found with ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    // Delete image from Cloudinary
    if (blog.image) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = blog.image.split('/');
        const publicIdWithExt = urlParts.slice(-2).join('/');
        const publicId = publicIdWithExt.split('.')[0];

        console.log('🗑️  Deleting image from Cloudinary:', publicId);
        await cloudinary.uploader.destroy(publicId);
        console.log('✅ Image deleted from Cloudinary');
      } catch (error) {
        console.error('⚠️  Error deleting image from Cloudinary:', error.message);
        // Continue anyway - we still want to delete the blog
      }
    }

    await Blog.findByIdAndDelete(req.params.id);

    console.log('✅ Blog deleted successfully!');
    console.log('========================================\n');

    res.status(200).json({
      success: true,
      message: 'Blog deleted successfully',
    });
  } catch (error) {
    console.error('\n❌ DELETE BLOG ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting blog',
      error: error.message,
    });
  }
};
