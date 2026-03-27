import express from 'express';
import { body } from 'express-validator';
import {
  verifyParentCode,
  getStudentProfile,
  getStudentReports,
  getStudentNotices,
  getStudentAttendance
} from '../controllers/tenantParentController.js';
import { getParentChildFees, getParentInvoice, getParentInvoiceHistory } from '../controllers/parentFeeController.js';
import { getParentSchoolInfo } from '../controllers/parentController.js';
import { extractSchoolId } from '../middleware/tenantMiddleware.js';
import { protectParent } from '../middleware/authMiddleware.js';

const router = express.Router();

// Validation rules for parent verification
const parentVerifyValidation = [
  body('schoolId')
    .notEmpty()
    .withMessage('School ID is required')
    .isMongoId()
    .withMessage('Invalid school ID'),

  body('parentCode')
    .trim()
    .notEmpty()
    .withMessage('Parent access code is required')
    .isLength({ min: 8, max: 8 })
    .withMessage('Parent access code must be 8 characters')
    .isAlphanumeric()
    .withMessage('Parent access code must be alphanumeric')
];

// Public route - parent verification (rate limiting removed for easier testing)
router.post('/verify', parentVerifyValidation, verifyParentCode);

// Protected routes - require parent authentication with tenant context
router.use(protectParent);
router.use(extractSchoolId);

// Get student profile
router.get('/student', getStudentProfile);

// Get student data
router.get('/reports', getStudentReports);
router.get('/notices', getStudentNotices);
router.get('/attendance', getStudentAttendance);
router.get('/fees', getParentChildFees);
router.get('/fees/invoice/:paymentId', getParentInvoice);
router.get('/fees/invoice-history', getParentInvoiceHistory);
router.get('/school-info', getParentSchoolInfo);

export default router;
