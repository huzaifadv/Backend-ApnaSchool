import express from 'express';
import { body } from 'express-validator';
import {
  getClassFeeStatus,
  markFeePayment,
  getStudentFeeHistory,
  getClassFeeStats,
  getFeePaymentById,
  createInvoice,
  updateInvoice,
  getInvoiceHistory,
  recordPayment
} from '../controllers/tenantFeePaymentController.js';
import { manualGenerateMonthlyFees } from '../services/feeGenerationService.js';
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

// Get invoice history for a specific student
router.get('/invoice-history/:studentId', getInvoiceHistory);

// Get a single fee payment record by ID
router.get('/payment/:paymentId', getFeePaymentById);

// Create invoice for a paid fee
router.post('/create-invoice/:paymentId', createInvoice);

// Update invoice for editing
router.put('/update-invoice/:paymentId', updateInvoice);

// Mark fee payment status
router.post('/mark', [
  body('studentId').notEmpty().withMessage('Student ID is required').isMongoId().withMessage('Invalid student ID'),
  body('classId').notEmpty().withMessage('Class ID is required').isMongoId().withMessage('Invalid class ID'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  body('year').isInt({ min: 2000 }).withMessage('Year must be valid'),
  body('status').isIn(['Paid', 'Partial', 'Pending']).withMessage('Status must be Paid, Partial or Pending'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('remarks').optional().trim()
], markFeePayment);

// NEW SIMPLIFIED FLOW: Record payment and prepare for invoice
router.post('/record-payment', [
  body('studentId').notEmpty().withMessage('Student ID is required').isMongoId().withMessage('Invalid student ID'),
  body('classId').notEmpty().withMessage('Class ID is required').isMongoId().withMessage('Invalid class ID'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  body('year').isInt({ min: 2000 }).withMessage('Year must be valid'),
  body('amountPaid').isFloat({ min: 0.01 }).withMessage('Amount paid must be greater than 0'),
  body('remarks').optional().trim()
], recordPayment);

// MANUAL TRIGGER: Generate monthly fees (for testing or manual run)
// This is the same function that runs automatically on 1st of every month
router.post('/generate-monthly-fees', manualGenerateMonthlyFees);

export default router;
