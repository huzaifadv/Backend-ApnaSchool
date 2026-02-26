import express from 'express';
import { body } from 'express-validator';
import {
  createNotice,
  getNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
  permanentDeleteNotice
} from '../controllers/tenantNoticeController.js';
import { extractSchoolId, validateSchool } from '../middleware/tenantMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';
import { uploadGeneral } from '../config/multer.js';

const router = express.Router();

// All notice routes require admin authentication and tenant validation
router.use(protect);
router.use(extractSchoolId);
router.use(validateSchool);

// Validation rules for notice creation
const noticeCreateValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 3 })
    .withMessage('Title must be at least 3 characters'),

  body('content')
    .trim()
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ min: 5 })
    .withMessage('Content must be at least 5 characters'),

  body('category')
    .optional()
    .isIn(['General', 'Academic', 'Exam', 'Event', 'Holiday', 'Sports', 'Emergency', 'Other'])
    .withMessage('Invalid category'),

  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority'),

  body('targetAudience')
    .optional()
    .isIn(['All', 'Students', 'Parents', 'Teachers', 'Staff'])
    .withMessage('Invalid target audience'),

  body('targetClasses')
    .optional()
    .custom((value) => {
      // Allow 'all' string or array of class IDs
      if (value === 'all' || Array.isArray(value)) {
        return true;
      }
      throw new Error('Target classes must be "all" or an array of class IDs');
    }),

  body('validFrom')
    .optional()
    .isISO8601()
    .withMessage('Valid from must be a valid date'),

  body('validUntil')
    .optional()
    .isISO8601()
    .withMessage('Valid until must be a valid date'),

  body('isPinned')
    .optional()
    .isBoolean()
    .withMessage('isPinned must be a boolean')
];

// Validation rules for notice update
const noticeUpdateValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5 })
    .withMessage('Title must be at least 5 characters'),

  body('content')
    .optional()
    .trim()
    .isLength({ min: 5 })
    .withMessage('Content must be at least 5 characters'),

  body('category')
    .optional()
    .isIn(['General', 'Academic', 'Exam', 'Event', 'Holiday', 'Sports', 'Emergency', 'Other'])
    .withMessage('Invalid category'),

  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority'),

  body('targetAudience')
    .optional()
    .isIn(['All', 'Students', 'Parents', 'Teachers', 'Staff'])
    .withMessage('Invalid target audience'),

  body('targetClasses')
    .optional()
    .custom((value) => {
      // Allow 'all' string or array of class IDs
      if (value === 'all' || Array.isArray(value)) {
        return true;
      }
      throw new Error('Target classes must be "all" or an array of class IDs');
    })
];

// Routes
router.route('/')
  .post(uploadGeneral.array('attachments', 5), noticeCreateValidation, createNotice)
  .get(getNotices);

router.route('/:id')
  .get(getNoticeById)
  .put(noticeUpdateValidation, updateNotice)
  .delete(deleteNotice);

router.delete('/:id/permanent', permanentDeleteNotice);

export default router;
