import express from 'express';
import {
  getAllBlogs,
  getBlogBySlug,
  getAllBlogsAdmin,
  createBlog,
  updateBlog,
  deleteBlog,
  upload,
} from '../controllers/blogController.js';
import { superAdminAuth } from '../middleware/superAdminAuth.js';

const router = express.Router();

// Public routes
router.get('/', getAllBlogs);
router.get('/:slug', getBlogBySlug);

// Super Admin routes
router.get('/admin/all', superAdminAuth, getAllBlogsAdmin);
router.post('/admin/create', superAdminAuth, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('=== UPLOAD ERROR ===');
      console.error('Error:', err);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      return res.status(400).json({
        success: false,
        message: err.message || 'Error uploading file',
      });
    }
    next();
  });
}, createBlog);

router.put('/admin/:id', superAdminAuth, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('=== UPLOAD ERROR ===');
      console.error('Error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Error uploading file',
      });
    }
    next();
  });
}, updateBlog);

router.delete('/admin/:id', superAdminAuth, deleteBlog);

export default router;
