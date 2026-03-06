import express from 'express';
import { body } from 'express-validator';
import {
  uploadReport,
  getReports,
  getReportById,
  updateReport,
  deleteReport
} from '../controllers/adminReportController.js';
import { protectAdminOrStaff } from '../middleware/authMiddleware.js';
import { validateSchool } from '../middleware/tenantMiddleware.js';
import { uploadReportImage } from '../config/multer.js';

const router = express.Router();

// All report routes require authentication (admin OR staff) and access control
router.use(protectAdminOrStaff);
router.use(validateSchool); // Global access control

// Validation rules for simple report upload
const reportUploadValidation = [
  body('student')
    .notEmpty()
    .withMessage('Student ID is required')
    .isMongoId()
    .withMessage('Invalid student ID'),

  body('title')
    .notEmpty()
    .withMessage('Report title is required')
    .trim(),

  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .trim()
];

// Routes
router.route('/')
  .get(getReports)
  .post(
    uploadReportImage.single('file'), // Changed to uploadReportImage for Cloudinary
    reportUploadValidation,
    uploadReport
  );

router.route('/:id')
  .get(getReportById)
  .put(updateReport)
  .delete(deleteReport);

export default router;
