import express from 'express';
import { body } from 'express-validator';
import {
  getClassFeeStatus,
  markFeePayment,
  getStudentFeeHistory,
  getClassFeeStats,
  getFeePaymentById,
  createInvoice
} from '../controllers/tenantFeePaymentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require admin authentication
router.use(protect);

// Get fee status for all students in a class
router.get('/class/:classId', getClassFeeStatus);

// Get fee statistics for a class
router.get('/stats/class/:classId', getClassFeeStats);

// Get fee history for a specific student
router.get('/student/:studentId', getStudentFeeHistory);

// Get a single fee payment record by ID
router.get('/payment/:paymentId', getFeePaymentById);

// Create invoice for a paid fee
router.post('/create-invoice/:paymentId', createInvoice);

// Mark fee payment status
router.post('/mark', [
  body('studentId').notEmpty().withMessage('Student ID is required').isMongoId().withMessage('Invalid student ID'),
  body('classId').notEmpty().withMessage('Class ID is required').isMongoId().withMessage('Invalid class ID'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  body('year').isInt({ min: 2000 }).withMessage('Year must be valid'),
  body('status').isIn(['Paid', 'Pending']).withMessage('Status must be Paid or Pending'),
  body('remarks').optional().trim()
], markFeePayment);

export default router;
