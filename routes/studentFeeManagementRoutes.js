import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import * as controller from '../controllers/studentFeeManagementController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// ═══════════════════════════════════════════════════════════════════════════
// STUDENT FEE PROFILE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Get student's fee profile
router.get('/:studentId/profile', controller.getStudentFeeProfile);

// Update student's fee profile
router.put('/:studentId/profile', controller.updateStudentFeeProfile);

// ═══════════════════════════════════════════════════════════════════════════
// MONTHLY FEE GENERATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Generate monthly fee for a student (with auto-carry forward of dues)
router.post('/:studentId/generate-monthly-fee', controller.generateMonthlyFee);

// ═══════════════════════════════════════════════════════════════════════════
// EXTRA CHARGES ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Add extra charges to fee record
router.post('/:feeId/extra-charges', controller.addExtraCharges);

// Remove extra charge from fee record
router.delete('/:feeId/extra-charges/:chargeId', controller.removeExtraCharge);

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT RECORDING ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Record payment (maintains history)
router.post('/:feeId/record-payment', controller.recordPayment);

// ═══════════════════════════════════════════════════════════════════════════
// FEE HISTORY & DETAILS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Get student's complete fee history
router.get('/:studentId/history', controller.getStudentFeeHistory);

// Get single fee record details
router.get('/record/:feeId', controller.getFeeRecordDetails);

export default router;
