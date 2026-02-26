import express from 'express';
import { body, param } from 'express-validator';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { extractSchoolId, validateSchool } from '../middleware/tenantMiddleware.js';
import {
  createAcademicYear,
  getAcademicYears,
  getAcademicYearById,
  getCurrentAcademicYear,
  updateAcademicYear,
  setCurrentAcademicYear,
  deleteAcademicYear
} from '../controllers/academicYearController.js';
import {
  promoteStudent,
  bulkPromoteStudents,
  getStudentEnrollmentHistory,
  getStudentsByAcademicYear,
  getClassPromotionStats
} from '../controllers/studentPromotionController.js';

const router = express.Router();

// All routes require tenant authentication
router.use(extractSchoolId);
router.use(validateSchool);

// Academic Year Management Routes
router.post(
  '/',
  protect,
  authorize('admin', 'super_admin'),
  [
    body('year')
      .trim()
      .notEmpty()
      .withMessage('Academic year is required')
      .matches(/^\d{4}-\d{4}$/)
      .withMessage('Academic year must be in format YYYY-YYYY (e.g., 2024-2025)'),
    body('startDate')
      .isISO8601()
      .withMessage('Start date must be a valid date'),
    body('endDate')
      .isISO8601()
      .withMessage('End date must be a valid date'),
    body('description')
      .optional()
      .trim()
  ],
  createAcademicYear
);

router.get(
  '/',
  protect,
  authorize('admin', 'super_admin', 'teacher'),
  getAcademicYears
);

router.get(
  '/current/active',
  protect,
  authorize('admin', 'super_admin', 'teacher'),
  getCurrentAcademicYear
);

router.get(
  '/:id',
  protect,
  authorize('admin', 'super_admin', 'teacher'),
  [
    param('id').isMongoId().withMessage('Invalid academic year ID')
  ],
  getAcademicYearById
);

router.put(
  '/:id',
  protect,
  authorize('admin', 'super_admin'),
  [
    param('id').isMongoId().withMessage('Invalid academic year ID'),
    body('year')
      .optional()
      .trim()
      .matches(/^\d{4}-\d{4}$/)
      .withMessage('Academic year must be in format YYYY-YYYY (e.g., 2024-2025)'),
    body('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid date'),
    body('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid date'),
    body('description')
      .optional()
      .trim(),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean')
  ],
  updateAcademicYear
);

router.put(
  '/:id/set-current',
  protect,
  authorize('admin', 'super_admin'),
  [
    param('id').isMongoId().withMessage('Invalid academic year ID')
  ],
  setCurrentAcademicYear
);

router.delete(
  '/:id',
  protect,
  authorize('admin', 'super_admin'),
  [
    param('id').isMongoId().withMessage('Invalid academic year ID')
  ],
  deleteAcademicYear
);

// Student Promotion Routes
router.post(
  '/students/promote/bulk',
  protect,
  authorize('admin', 'super_admin'),
  [
    body('targetAcademicYear')
      .trim()
      .notEmpty()
      .withMessage('Target academic year is required'),
    body('promotions')
      .isArray({ min: 1 })
      .withMessage('Promotions array is required and must not be empty'),
    body('promotions.*.studentId')
      .isMongoId()
      .withMessage('Invalid student ID'),
    body('promotions.*.promotionType')
      .isIn(['promoted', 'repeated', 'passedOut'])
      .withMessage('Invalid promotion type'),
    body('promotions.*.targetClassId')
      .optional()
      .isMongoId()
      .withMessage('Invalid target class ID'),
    body('promotions.*.rollNumber')
      .optional()
      .trim(),
    body('promotions.*.remarks')
      .optional()
      .trim()
  ],
  bulkPromoteStudents
);

router.post(
  '/students/:id/promote',
  protect,
  authorize('admin', 'super_admin'),
  [
    param('id').isMongoId().withMessage('Invalid student ID'),
    body('targetAcademicYear')
      .trim()
      .notEmpty()
      .withMessage('Target academic year is required'),
    body('promotionType')
      .isIn(['promoted', 'repeated', 'passedOut'])
      .withMessage('Invalid promotion type'),
    body('targetClassId')
      .optional()
      .isMongoId()
      .withMessage('Invalid target class ID'),
    body('rollNumber')
      .optional()
      .trim(),
    body('remarks')
      .optional()
      .trim()
  ],
  promoteStudent
);

router.get(
  '/students/:id/enrollment-history',
  protect,
  authorize('admin', 'super_admin', 'teacher'),
  [
    param('id').isMongoId().withMessage('Invalid student ID')
  ],
  getStudentEnrollmentHistory
);

router.get(
  '/students/by-year/:year',
  protect,
  authorize('admin', 'super_admin', 'teacher'),
  [
    param('year')
      .trim()
      .notEmpty()
      .withMessage('Academic year is required')
  ],
  getStudentsByAcademicYear
);

router.get(
  '/classes/:id/promotion-stats',
  protect,
  authorize('admin', 'super_admin', 'teacher'),
  [
    param('id').isMongoId().withMessage('Invalid class ID')
  ],
  getClassPromotionStats
);

export default router;
