/**
 * Enhanced Fee Routes
 * /api/admin/fees
 */

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  generateClassFees,
  setupInstallmentPlan,
  recordFeePayment,
  applyDiscount,
  getFeeStatistics,
  getStudentFeeHistory
} from '../controllers/enhancedFeeController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Fee generation & statistics
router.post('/generate', generateClassFees);
router.get('/statistics', getFeeStatistics);
router.get('/student/:studentId/history', getStudentFeeHistory);

// Payment & discount operations
router.post('/:id/installment', setupInstallmentPlan);
router.post('/:id/payment', recordFeePayment);
router.patch('/:id/discount', applyDiscount);

export default router;
