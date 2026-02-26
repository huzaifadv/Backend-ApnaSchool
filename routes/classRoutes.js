import express from 'express';
import { body } from 'express-validator';
import {
  createClass,
  getClasses,
  getClassById,
  updateClass,
  deleteClass,
  permanentDeleteClass,
  getClassStats
} from '../controllers/tenantClassController.js';
import { extractSchoolId, validateSchool } from '../middleware/tenantMiddleware.js';

const router = express.Router();

// All class routes require tenant authentication
router.use(extractSchoolId);
router.use(validateSchool);

// Validation rules for class creation
const classCreateValidation = [
  body('className')
    .trim()
    .notEmpty()
    .withMessage('Class name is required')
    .isLength({ min: 1 })
    .withMessage('Class name is required'),

  body('section')
    .optional()
    .trim()
    .isLength({ max: 2 })
    .withMessage('Section must be max 2 characters'),

  body('academicYear')
    .optional()
    .trim()
    .custom((value) => {
      // If provided, validate format - accept both YYYY and YYYY-YYYY
      if (value && !value.match(/^\d{4}(-\d{4})?$/)) {
        throw new Error('Academic year must be in format YYYY or YYYY-YYYY (e.g., 2025 or 2024-2025)');
      }
      return true;
    }),

  body('classTeacher')
    .optional()
    .trim()
];

// Validation rules for class update
const classUpdateValidation = [
  body('className')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Class name cannot be empty'),

  body('section')
    .optional()
    .trim()
    .isLength({ max: 2 })
    .withMessage('Section must be max 2 characters'),

  body('academicYear')
    .optional()
    .trim()
    .custom((value) => {
      // If provided, validate format - accept both YYYY and YYYY-YYYY
      if (value && !value.match(/^\d{4}(-\d{4})?$/)) {
        throw new Error('Academic year must be in format YYYY or YYYY-YYYY (e.g., 2025 or 2024-2025)');
      }
      return true;
    }),

  body('classTeacher')
    .optional()
    .trim()
];

// Routes
router.route('/')
  .post(classCreateValidation, createClass)
  .get(getClasses);

router.route('/:id')
  .get(getClassById)
  .put(classUpdateValidation, updateClass)
  .delete(deleteClass);

router.delete('/:id/permanent', permanentDeleteClass);
router.get('/:id/stats', getClassStats);

export default router;
