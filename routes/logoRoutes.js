import express from 'express';
import {
  createLogo,
  getAllLogos,
  getActiveLogos,
  deleteLogo,
  toggleLogoStatus,
  reorderLogos,
  uploadLogo,
  validateLogoImage
} from '../controllers/logoController.js';
import { superAdminAuth } from '../middleware/superAdminAuth.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================

// Get active logos for frontend (Home & About pages)
router.get('/active', getActiveLogos);

// ============================================
// SUPER ADMIN ROUTES (Protected)
// ============================================

// Get all logos (admin view)
router.get('/', superAdminAuth, getAllLogos);

// Upload new logo with error handling
router.post(
  '/',
  superAdminAuth,
  (req, res, next) => {
    uploadLogo.single('logo')(req, res, (err) => {
      if (err) {
        console.error('❌ Multer/Cloudinary Upload Error:', err);
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload failed'
        });
      }
      next();
    });
  },
  validateLogoImage,
  createLogo
);

// Delete logo
router.delete('/:id', superAdminAuth, deleteLogo);

// Toggle logo active status
router.patch('/:id/toggle', superAdminAuth, toggleLogoStatus);

// Reorder logos
router.patch('/reorder', superAdminAuth, reorderLogos);

export default router;
