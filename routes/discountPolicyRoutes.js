/**
 * Discount Policy Routes
 * /api/admin/discount-policies
 */

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getDiscountPolicies,
  getDiscountPolicy,
  createDiscountPolicy,
  updateDiscountPolicy,
  deleteDiscountPolicy,
  toggleDiscountPolicyStatus
} from '../controllers/discountPolicyController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.route('/')
  .get(getDiscountPolicies)
  .post(createDiscountPolicy);

router.route('/:id')
  .get(getDiscountPolicy)
  .put(updateDiscountPolicy)
  .delete(deleteDiscountPolicy);

router.patch('/:id/toggle', toggleDiscountPolicyStatus);

export default router;
