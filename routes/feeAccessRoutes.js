import express from 'express';
import { body } from 'express-validator';
import {
  requestFeeAccess,
  verifyFeeAccess,
  checkFeeAccess
} from '../controllers/feeAccessController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect all routes
router.use(protect);
router.use(authorize('admin', 'super_admin'));

// Validation for verify code
const verifyCodeValidation = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Verification code is required')
    .isLength({ min: 6, max: 6 })
    .withMessage('Verification code must be 6 digits')
    .isNumeric()
    .withMessage('Verification code must be numeric')
];

// Routes
router.post('/request', requestFeeAccess);
router.post('/verify', verifyCodeValidation, verifyFeeAccess);
router.get('/check', checkFeeAccess);

export default router;
