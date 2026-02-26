import express from 'express';
import {
  getAllCourses,
  getCourseBySlug,
  getAllCoursesAdmin,
  createCourse,
  updateCourse,
  deleteCourse
} from '../controllers/courseController.js';
import { superAdminAuth } from '../middleware/superAdminAuth.js';

const router = express.Router();

// Public routes
router.get('/', getAllCourses);
router.get('/:slug', getCourseBySlug);

// Super Admin routes
router.get('/admin/all', superAdminAuth, getAllCoursesAdmin);
router.post('/admin/create', superAdminAuth, createCourse);
router.put('/admin/:id', superAdminAuth, updateCourse);
router.delete('/admin/:id', superAdminAuth, deleteCourse);

export default router;
