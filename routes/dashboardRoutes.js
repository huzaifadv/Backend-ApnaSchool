import express from 'express';
import { getDashboardStats, getRecentActivity } from '../controllers/tenantDashboardController.js';
import { extractSchoolId, validateSchool } from '../middleware/tenantMiddleware.js';

const router = express.Router();

// All dashboard routes require tenant authentication
router.use(extractSchoolId);
router.use(validateSchool);

// Routes
router.get('/stats', getDashboardStats);
router.get('/recent', getRecentActivity);

export default router;
