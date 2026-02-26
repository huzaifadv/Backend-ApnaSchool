import express from 'express';
import {
  getAllNews,
  getNewsBySlug,
  getAllNewsAdmin,
  createNews,
  updateNews,
  deleteNews,
} from '../controllers/newsController.js';
import { superAdminAuth } from '../middleware/superAdminAuth.js';

const router = express.Router();

// Public routes
router.get('/', getAllNews);
router.get('/:slug', getNewsBySlug);

// Super Admin routes
router.get('/admin/all', superAdminAuth, getAllNewsAdmin);
router.post('/admin/create', superAdminAuth, createNews);
router.put('/admin/:id', superAdminAuth, updateNews);
router.delete('/admin/:id', superAdminAuth, deleteNews);

export default router;
