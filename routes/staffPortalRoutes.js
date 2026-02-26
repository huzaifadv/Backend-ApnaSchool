/**
 * Staff Portal Routes — /api/staff/*
 *
 * SAFE EXTENSION:
 *  - Public: POST /api/staff/auth/login
 *  - Protected: all others use `protectStaff` (new middleware, does not touch authMiddleware.js)
 *  - Staff tokens use portal:'staff' claim — cannot be used on admin/parent routes
 *  - Admin/parent tokens rejected on these routes (portal check in protectStaff)
 */

import express from 'express';
import { body } from 'express-validator';
import { protectStaff } from '../middleware/staffAuthMiddleware.js';
import {
  staffLogin,
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  getMyClasses,
  getAllSchoolClasses,
  getClassStudents,
  markClassAttendance,
  updateClassAttendance,
  getMyClassAttendance,
  markSelfAttendance,
  getMySelfAttendance,
  createDiaryEntry,
  getMyDiaryEntries,
  updateDiaryEntry,
  deleteDiaryEntry,
  addMarksEntry,
  getMyMarks,
  updateMarksEntry,
  submitMonthlyReport,
  getMyMonthlyReports,
  getMySalaryHistory
} from '../controllers/staffPortalController.js';

const router = express.Router();

// ── Validation helpers ────────────────────────────────────────────────────────

const loginValidation = [
  body('staffId')
    .trim().notEmpty().withMessage('Staff ID is required'),
  body('password')
    .notEmpty().withMessage('Password is required'),
  body('schoolId')
    .trim().notEmpty().withMessage('School ID is required')
];

// ── Public Routes ─────────────────────────────────────────────────────────────

router.post('/auth/login', loginValidation, staffLogin);

// ── Protected Routes (require valid staff JWT) ────────────────────────────────

router.use(protectStaff);

// Auth / Profile
router.get('/auth/me',                     getMyProfile);
router.put('/profile',                     updateMyProfile);
router.put('/auth/change-password',        changeMyPassword);

// Classes
router.get('/classes',                          getMyClasses);
router.get('/all-classes',                      getAllSchoolClasses);
router.get('/classes/:classId/students',        getClassStudents);

// Class Attendance (staff marks student attendance)
router.post('/class-attendance',                markClassAttendance);
router.put('/class-attendance',                 updateClassAttendance);
router.get('/class-attendance/:classId',        getMyClassAttendance);

// Self Attendance (staff marks own attendance — admin verifies)
router.post('/self-attendance',                 markSelfAttendance);
router.get('/self-attendance',                  getMySelfAttendance);

// Diary / Homework
router.post('/diary',                           createDiaryEntry);
router.get('/diary',                            getMyDiaryEntries);
router.put('/diary/:id',                        updateDiaryEntry);
router.delete('/diary/:id',                     deleteDiaryEntry);

// Marks Entry
router.post('/marks',                           addMarksEntry);
router.get('/marks',                            getMyMarks);
router.put('/marks/:id',                        updateMarksEntry);

// Monthly Reports
router.post('/reports',                         submitMonthlyReport);
router.get('/reports',                          getMyMonthlyReports);

// Salary (view-only)
router.get('/salary',                           getMySalaryHistory);

export default router;
