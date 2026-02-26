/**
 * SchoolRegistry Routes
 * Routes for Super Admin to manage schools in the master registry
 */

import express from 'express';
import {
  getAllSchoolsInRegistry,
  getSchoolFromRegistry,
  getPlatformStatistics,
  approveSchool,
  rejectSchool,
  suspendSchool,
  activateSchool,
  upgradeSchoolPlan,
  extendSchoolTrial,
  updateSchoolRegistry,
  deleteSchoolFromRegistry,
  getPendingApprovals,
  getExpiredTrials,
  syncSchoolRegistry,
} from '../controllers/schoolRegistryController.js';
import { superAdminAuth } from '../middleware/superAdminAuth.js';

const router = express.Router();

// All routes require Super Admin authentication
router.use(superAdminAuth);

// Statistics
router.get('/stats', getPlatformStatistics);

// Sync registry
router.post('/sync', syncSchoolRegistry);

// Pending and expired
router.get('/pending', getPendingApprovals);
router.get('/expired-trials', getExpiredTrials);

// School management
router.get('/schools', getAllSchoolsInRegistry);
router.get('/schools/:id', getSchoolFromRegistry);
router.put('/schools/:id', updateSchoolRegistry);
router.delete('/schools/:id', deleteSchoolFromRegistry);

// School actions
router.put('/schools/:id/approve', approveSchool);
router.put('/schools/:id/reject', rejectSchool);
router.put('/schools/:id/suspend', suspendSchool);
router.put('/schools/:id/activate', activateSchool);
router.put('/schools/:id/upgrade', upgradeSchoolPlan);
router.put('/schools/:id/extend-trial', extendSchoolTrial);

export default router;
