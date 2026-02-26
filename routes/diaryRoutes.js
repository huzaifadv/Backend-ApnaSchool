import express from 'express';
import { body } from 'express-validator';
import {
  createDiary,
  getDiaries,
  getDiaryById,
  updateDiary,
  deleteDiary,
  permanentDeleteDiary,
  migrateDiaryData
} from '../controllers/diaryController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validateSchool } from '../middleware/tenantMiddleware.js';
import { uploadDiary } from '../config/multer.js';

const router = express.Router();

// All diary routes require authentication, authorization, and access control
router.use(protect);
router.use(authorize('super_admin', 'admin'));
router.use(validateSchool); // Global access control

// Validation rules for diary creation
const diaryCreateValidation = [
  body('classId')
    .trim()
    .notEmpty()
    .withMessage('Class ID is required')
    .isMongoId()
    .withMessage('Invalid class ID'),

  // Note: subjects validation is handled in controller after parsing JSON from FormData
  // because express-validator can't validate JSON strings properly

  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid date')
];

// Validation rules for diary update
const diaryUpdateValidation = [
  body('classId')
    .optional()
    .trim()
    .isMongoId()
    .withMessage('Invalid class ID'),

  // Note: subjects validation is handled in controller after parsing JSON from FormData

  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid date')
];

// Routes
router.route('/')
  .post(uploadDiary.array('attachments', 5), diaryCreateValidation, createDiary)
  .get(getDiaries);

// Migration route - must be before /:id routes
router.post('/migrate', migrateDiaryData);

router.route('/:id')
  .get(getDiaryById)
  .put(uploadDiary.array('attachments', 5), diaryUpdateValidation, updateDiary)
  .delete(deleteDiary);

router.delete('/:id/permanent', permanentDeleteDiary);

export default router;
