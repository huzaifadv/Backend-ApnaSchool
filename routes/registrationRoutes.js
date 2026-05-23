import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  initSession,
  getSession,
  saveStructure,
  checkBranchEmail,
  saveBranches,
  checkAdminContact,
  saveAdmin,
  sendVerificationOTPs,
  verifyOTPs,
  getPlans,
  initiatePayment,
  savePlan,
  completeRegistration
} from '../controllers/registrationController.js';

const router = express.Router();

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});

const emailCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many email checks. Please slow down.' }
});

router.post('/init',             registrationLimiter, initSession);
router.get('/session/:sessionId',                     getSession);
router.post('/structure',        registrationLimiter, saveStructure);
router.get('/check-email',       emailCheckLimiter,   checkBranchEmail);
router.post('/branches',         registrationLimiter, saveBranches);
router.get('/check-contact',     emailCheckLimiter,   checkAdminContact);
router.post('/admin',            registrationLimiter, saveAdmin);
router.post('/send-otp',         registrationLimiter, sendVerificationOTPs);
router.post('/verify-otp',       registrationLimiter, verifyOTPs);
router.get('/plans',                                  getPlans);
router.post('/payment/initiate', registrationLimiter, initiatePayment);
router.post('/save-plan',        registrationLimiter, savePlan);
router.post('/complete',         registrationLimiter, completeRegistration);

export default router;
