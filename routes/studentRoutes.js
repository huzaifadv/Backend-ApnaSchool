import express from 'express';
import { body } from 'express-validator';
import {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  permanentDeleteStudent,
  migrateStudentData
} from '../controllers/tenantStudentController.js';
import { extractSchoolId, validateSchool } from '../middleware/tenantMiddleware.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validateAcademicYearExists } from '../middleware/academicYearValidation.js';
import { studentUpload } from '../middleware/uploadProfile.js';

const router = express.Router();

// All student routes require tenant authentication & admin authorization
router.use(extractSchoolId);
router.use(validateSchool);
router.use(protect);
router.use(authorize('admin', 'super_admin'));

// Validation rules for student creation
const studentCreateValidation = [
  body('classId')
    .notEmpty()
    .withMessage('Class ID is required')
    .isMongoId()
    .withMessage('Invalid class ID'),

  body('rollNumber')
    .trim()
    .notEmpty()
    .withMessage('Roll number is required'),

  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2 })
    .withMessage('Full name must be at least 2 characters'),

  body('email')
    .optional({ checkFalsy: true }) // Skip validation if empty string
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),

  body('gender')
    .notEmpty()
    .withMessage('Gender is required')
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Gender must be Male, Female, or Other'),

  body('bloodGroup')
    .optional()
    .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    .withMessage('Invalid blood group'),

  body('fatherName')
    .trim()
    .notEmpty()
    .withMessage('Father name is required')
    .isLength({ min: 2 })
    .withMessage('Father name must be at least 2 characters'),

  body('parentName')
    .optional()
    .trim(),

  body('parentPhone')
    .trim()
    .notEmpty()
    .withMessage('Parent phone is required'),

  body('parentEmail')
    .optional({ checkFalsy: true }) // Skip validation if empty string
    .trim()
    .isEmail()
    .withMessage('Please provide a valid parent email')
    .normalizeEmail(),

  body('currentAcademicYear')
    .trim()
    .notEmpty()
    .withMessage('Academic year is required')
];

// Validation rules for student update
const studentUpdateValidation = [
  body('classId')
    .optional()
    .isMongoId()
    .withMessage('Invalid class ID'),

  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Full name must be at least 2 characters'),

  body('email')
    .optional({ checkFalsy: true }) // Skip validation if empty string
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),

  body('gender')
    .optional()
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Gender must be Male, Female, or Other'),

  body('bloodGroup')
    .optional()
    .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    .withMessage('Invalid blood group'),

  body('fatherName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Father name must be at least 2 characters'),

  body('parentName')
    .optional()
    .trim(),

  body('parentPhone')
    .optional()
    .trim(),

  body('parentEmail')
    .optional({ checkFalsy: true }) // Skip validation if empty string
    .trim()
    .isEmail()
    .withMessage('Please provide a valid parent email')
    .normalizeEmail()
];

// Routes
router.route('/')
  .post(validateAcademicYearExists, studentCreateValidation, createStudent)
  .post(studentUpload.upload.single('profilePicture'), studentUpload.processImage, studentCreateValidation, createStudent)
  .get(getStudents);

// Migration route - must be before /:id routes
router.post('/migrate', migrateStudentData);

router.route('/:id')
  .get(getStudentById)
  .put(studentUpload.upload.single('profilePicture'), studentUpload.processImage, studentUpdateValidation, updateStudent)
  .delete(deleteStudent);

router.delete('/:id/permanent', permanentDeleteStudent);

export default router;
