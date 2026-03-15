/**
 * Fee Category Routes
 * /api/admin/fee-categories
 */

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getFeeCategories,
  getFeeCategory,
  createFeeCategory,
  updateFeeCategory,
  deleteFeeCategory,
  toggleFeeCategoryStatus
} from '../controllers/feeCategoryController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.route('/')
  .get(getFeeCategories)
  .post(createFeeCategory);

router.route('/:id')
  .get(getFeeCategory)
  .put(updateFeeCategory)
  .delete(deleteFeeCategory);

router.patch('/:id/toggle', toggleFeeCategoryStatus);

export default router;
