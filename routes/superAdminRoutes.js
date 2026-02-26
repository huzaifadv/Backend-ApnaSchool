import express from 'express';
import {
  loginSuperAdmin,
  getSuperAdminProfile,
  updatePassword,
  getAllSchools,
  getSchoolById,
  getPlatformStats,
  checkSuperAdminExists,
  approveSchool,
  rejectSchool,
  suspendSchool,
  reactivateSchool,
  getDashboardStats,
  extendSubscription,
  getAllAdmins,
  updateSchoolPlan,
  updateBillingCycle,
  sendNoticeToSchool,
  getPendingPayments,
  markSchoolAsPaid,
  getPaymentHistory,
  deleteSchool,
  toggleFBRIntegration,
} from '../controllers/superAdminController.js';
import { superAdminAuth } from '../middleware/superAdminAuth.js';

const router = express.Router();

// Public routes
router.post('/login', loginSuperAdmin);
router.get('/exists', checkSuperAdminExists);

// Protected routes (require Super Admin authentication)
router.get('/profile', superAdminAuth, getSuperAdminProfile);
router.put('/update-password', superAdminAuth, updatePassword);

// Dashboard & Statistics
router.get('/stats', superAdminAuth, getPlatformStats);
router.get('/dashboard-stats', superAdminAuth, getDashboardStats);

// School Management
router.get('/schools', superAdminAuth, getAllSchools);
router.get('/schools/:id', superAdminAuth, getSchoolById);

// School Actions
router.put('/schools/:id/approve', superAdminAuth, approveSchool);
router.put('/schools/:id/reject', superAdminAuth, rejectSchool);
router.put('/schools/:id/suspend', superAdminAuth, suspendSchool);
router.put('/schools/:id/reactivate', superAdminAuth, reactivateSchool);
router.put('/schools/:id/extend-subscription', superAdminAuth, extendSubscription);
router.put('/schools/:id/update-plan', superAdminAuth, updateSchoolPlan);
router.put('/schools/:id/update-billing-cycle', superAdminAuth, updateBillingCycle);
router.put('/schools/:id/fbr-toggle', superAdminAuth, toggleFBRIntegration);
router.delete('/schools/:schoolId', superAdminAuth, deleteSchool);

// Notices
router.post('/notices', superAdminAuth, sendNoticeToSchool);

// Admin Management
router.get('/admins', superAdminAuth, getAllAdmins);

// Payment Management
router.get('/pending-payments', superAdminAuth, getPendingPayments);
router.post('/mark-paid/:schoolId', superAdminAuth, markSchoolAsPaid);
router.get('/payment-history/:schoolId', superAdminAuth, getPaymentHistory);

export default router;
