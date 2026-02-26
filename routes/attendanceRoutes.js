import express from 'express';
import { body } from 'express-validator';
import {
  markAttendance,
  getAttendanceStats,
  getClassAttendance,
  getStudentAttendance,
  updateAttendance,
  deleteAttendance
} from '../controllers/tenantAttendanceController.js';
import { extractSchoolId, validateSchool } from '../middleware/tenantMiddleware.js';

const router = express.Router();

// All attendance routes require tenant authentication
router.use(extractSchoolId);
router.use(validateSchool);

// Validation rules for marking attendance
const markAttendanceValidation = [
  body('classId').notEmpty().withMessage('Class ID is required').isMongoId().withMessage('Invalid class ID'),
  body('date').notEmpty().withMessage('Date is required').isISO8601().withMessage('Date must be valid'),
  body('attendance')
    .notEmpty()
    .withMessage('Attendance records array is required')
    .isArray({ min: 1 })
    .withMessage('Attendance records must be a non-empty array'),
  body('attendance.*.studentId')
    .notEmpty()
    .withMessage('Student ID required in attendance record')
    .isMongoId()
    .withMessage('Invalid student ID'),
  body('attendance.*.status')
    .notEmpty()
    .withMessage('Attendance status is required')
    .isIn(['Present','Absent','Late','Half Day','Excused'])
    .withMessage('Invalid attendance status'),
  body('attendance.*.period')
    .optional()
    .isIn(['Full Day','Morning','Afternoon'])
    .withMessage('Invalid period'),
  body('attendance.*.remarks')
    .optional()
    .trim()
];

const updateAttendanceValidation = [
  body('status').optional().isIn(['Present','Absent','Late','Half Day','Excused']),
  body('period').optional().isIn(['Full Day','Morning','Afternoon']),
  body('remarks').optional().trim()
];

// Routes
router.post('/mark', markAttendanceValidation, markAttendance);
router.get('/stats', getAttendanceStats);
router.get('/class/:classId', getClassAttendance);
router.get('/student/:studentId', getStudentAttendance);
router.route('/:id').put(updateAttendanceValidation, updateAttendance).delete(deleteAttendance);

export default router;
