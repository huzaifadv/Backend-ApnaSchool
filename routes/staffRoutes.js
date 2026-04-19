/**
 * Admin Staff Routes — /api/admin/staff/*
 *
 * SAFE EXTENSION:
 *  - Uses existing `protect` middleware for admin authentication
 *  - No changes to existing routes or middleware
 *  - All new routes under a unique prefix that doesn't conflict with existing routes
 */

import express from 'express';
import { body, param } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { uploadStaffPhoto } from '../config/multer.js';
import { staffUpload } from '../middleware/uploadProfile.js';
import { validateAcademicYearExists } from '../middleware/academicYearValidation.js';
import {
  createStaff,
  getAllStaff,
  getStaffById,
  updateStaff,
  assignClassesAndSubjects,
  resetStaffPassword,
  toggleStaffStatus,
  deleteStaff,
  addSalaryRecord,
  getStaffSalaryHistory,
  toggleSalaryStatus,
  updateSalaryRecord,
  deleteSalaryRecord,
  createSalaryInvoice,
  getPendingAttendance,
  verifyStaffAttendance,
  getAllStaffMarks,
  getAllStaffMonthlyReports
} from '../controllers/staffController.js';

const router = express.Router();

// ── Validation helpers ────────────────────────────────────────────────────────

const createStaffValidation = [
  body('name')
    .trim().notEmpty().withMessage('Name is required')
    .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),

  body('cnic')
    .trim().notEmpty().withMessage('CNIC is required')
    .matches(/^\d{13}$/).withMessage('CNIC must be exactly 13 digits'),

  body('contact')
    .trim().notEmpty().withMessage('Contact is required'),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

  body('role')
    .optional()
    .isIn(['teacher', 'coordinator', 'admin_staff'])
    .withMessage('Role must be teacher, coordinator or admin_staff'),

  body('baseSalary')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Salary must be a positive number'),

  body('academicYearId')
    .optional()
    .isMongoId()
    .withMessage('Academic year ID must be valid')
];

const updateStaffValidation = [
  body('name')
    .optional().trim()
    .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),

  body('contact')
    .optional().trim(),

  body('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('Status must be active or inactive'),

  body('role')
    .optional()
    .isIn(['teacher', 'coordinator', 'admin_staff'])
    .withMessage('Invalid role'),

  body('academicYearId')
    .optional()
    .isMongoId()
    .withMessage('Academic year ID must be valid')
];

const salaryValidation = [
  body('month')
    .notEmpty().withMessage('Month is required')
    .isInt({ min: 1, max: 12 }).withMessage('Month must be 1–12'),

  body('year')
    .notEmpty().withMessage('Year is required')
    .isInt({ min: 2000 }).withMessage('Year must be valid'),

  body('basicSalary')
    .notEmpty().withMessage('Basic salary is required')
    .isFloat({ min: 0 }).withMessage('Basic salary must be non-negative'),

  body('allowances')
    .optional().isFloat({ min: 0 }).withMessage('Allowances must be non-negative'),

  body('deductions')
    .optional().isFloat({ min: 0 }).withMessage('Deductions must be non-negative'),

  body('amountPaid')
    .optional().isFloat({ min: 0 }).withMessage('Amount paid must be non-negative'),

  body('status')
    .optional()
    .isIn(['paid', 'pending', 'partial']).withMessage('Status must be paid, pending or partial')
];

// ── Routes ────────────────────────────────────────────────────────────────────

// All routes require admin authentication
router.use(protect);

// Staff CRUD
router.post('/', staffUpload.upload.single('profilePicture'), staffUpload.processImage, validateAcademicYearExists, createStaffValidation, createStaff);
router.get('/', getAllStaff);
router.get('/:id', getStaffById);
router.put('/:id', staffUpload.upload.single('profilePicture'), staffUpload.processImage, updateStaffValidation, updateStaff);

// Class & subject assignment
router.put('/:id/assign', assignClassesAndSubjects);

// Password reset (admin action)
router.put('/:id/reset-password', resetStaffPassword);

// Toggle active/inactive status
router.put('/:id/toggle-status', toggleStaffStatus);

// Delete staff permanently
router.delete('/:id', deleteStaff);

// Salary management
router.post('/:id/salary', salaryValidation, addSalaryRecord);
router.get('/:id/salary', getStaffSalaryHistory);
router.put('/:id/salary/:salaryId', updateSalaryRecord);
router.delete('/:id/salary/:salaryId', deleteSalaryRecord);
router.put('/:id/salary/:salaryId/toggle-status', toggleSalaryStatus);
router.post('/:id/salary/:salaryId/invoice', createSalaryInvoice);

// Self-attendance verification
// NOTE: these routes must come BEFORE /:id routes to avoid param collision
router.get('/attendance/pending', getPendingAttendance);
router.put('/attendance/:attendanceId/verify', verifyStaffAttendance);

// Overview endpoints for admin
router.get('/overview/marks', getAllStaffMarks);
router.get('/overview/reports', getAllStaffMonthlyReports);

export default router;
