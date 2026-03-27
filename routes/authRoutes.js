import express from 'express';
import { body } from 'express-validator';
import {
  registerSchool,
  adminLogin,
  verifyEmail,
  resendVerificationOTP,
  forgotPassword,
  resetPassword,
  getSchoolDetails,
  updateSchoolDetails,
  getAllSchools,
  getSchoolById,
  sendChangePasswordOTP,
  changePassword,
  uploadSchoolLogo
} from '../controllers/tenantAuthController.js';

import { protect } from '../middleware/authMiddleware.js';
import { uploadSchoolLogo as schoolLogoUpload } from '../config/multer.js';

const router = express.Router();

// Validation rules for school registration
const schoolRegistrationValidation = [
  body('schoolName')
    .trim()
    .notEmpty()
    .withMessage('School name is required')
    .isLength({ min: 3 })
    .withMessage('School name must be at least 3 characters long'),

  body('address')
    .trim()
    .notEmpty()
    .withMessage('Address is required'),

  body('city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),

  body('state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),

  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),

  body('adminName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Admin name must be at least 2 characters long'),

  body('establishedYear')
    .optional({ checkFalsy: true })
    .isInt({ min: 1800, max: new Date().getFullYear() })
    .withMessage('Please provide a valid establishment year'),

  body('website')
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage('Please provide a valid website URL')
];

// Validation rules for admin login
const adminLoginValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Validation rules for updating school details
const updateSchoolValidation = [
  body('schoolName')
    .optional()
    .trim()
    .isLength({ min: 3 })
    .withMessage('School name must be at least 3 characters long'),

  body('address')
    .optional({ checkFalsy: true })
    .trim(),

  body('city')
    .optional({ checkFalsy: true })
    .trim(),

  body('state')
    .optional({ checkFalsy: true })
    .trim(),

  body('phone')
    .optional({ checkFalsy: true })
    .trim(),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('password')
    .optional()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),

  body('establishedYear')
    .optional({ checkFalsy: true })
    .isInt({ min: 1800, max: new Date().getFullYear() })
    .withMessage('Please provide a valid establishment year'),

  body('website')
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage('Please provide a valid website URL')
];

// Email verification validations removed - no longer needed

// Validation rules for forgot password
const forgotPasswordValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail({ gmail_remove_dots: false })
];

// Validation rules for reset password
const resetPasswordValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('otp')
    .trim()
    .notEmpty()
    .withMessage('OTP is required')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits'),

  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
];

// Routes
router.post('/schools', schoolLogoUpload.single('logo'), schoolRegistrationValidation, registerSchool);
router.get('/schools', getAllSchools);
router.get('/schools/:id', getSchoolById);

// Admin authentication routes
router.post('/admin/login', adminLoginValidation, adminLogin);

// Email verification routes
router.post('/auth/verify-email', verifyEmail);
router.post('/auth/resend-verification', resendVerificationOTP);

// Debug route to check registered schools (development only)
router.get('/debug/schools', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ message: 'Not available in production' });
  }

  const { default: School } = await import('../models/School.js');
  const schools = await School.find({}).select('email schoolName isEmailVerified');
  res.json({ count: schools.length, schools });
});

// Password reset routes (OTP still needed for password reset)
router.post('/auth/forgot-password', forgotPasswordValidation, forgotPassword);
router.post('/auth/reset-password', resetPasswordValidation, resetPassword);

// Protected admin routes
router.get('/admin/school', protect, getSchoolDetails);
router.put('/admin/school', protect, updateSchoolValidation, updateSchoolDetails);
router.post('/admin/school/logo', protect, schoolLogoUpload.single('logo'), uploadSchoolLogo);

// Change password routes (protected - for logged-in admin)
router.post('/admin/send-change-password-otp', protect, sendChangePasswordOTP);
router.post('/admin/change-password', protect, changePassword);



// TEMP: fix admin email in tenant DB — DELETE after use
router.get('/fix-admin-email', async (req, res) => {
  try {
    const mongoose = await import('mongoose');
    const tenantDB = mongoose.default.connection.useDb('demo_school_db', { useCache: true });
    const admins = await tenantDB.collection('admins').find({}).toArray();
    console.log('All admins:', admins.map(a => ({ email: a.email, name: a.name })));

    const result = await tenantDB.collection('admins').findOneAndUpdate(
      { email: 'devehuzaifa@gmail.com' },
      { $set: { email: 'deve.huzaifa@gmail.com' } },
      { returnDocument: 'after' }
    );
    if (result) {
      res.json({ success: true, message: 'Admin email fixed', email: result.email });
    } else {
      res.json({ success: false, message: 'Admin not found', allAdmins: admins.map(a => ({ email: a.email, name: a.name })) });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// TEMP: inspect tenant DB — DELETE after use
router.get('/inspect-tenant', async (req, res) => {
  try {
    const mongoose = await import('mongoose');
    const tenantDB = mongoose.default.connection.useDb('demo_school_db', { useCache: true });
    const collections = await tenantDB.db.listCollections().toArray();
    const result = {};
    for (const col of collections) {
      const docs = await tenantDB.collection(col.name).find({}).toArray();
      result[col.name] = docs.map(d => {
        const { password, ...rest } = d;
        return rest;
      });
    }
    res.json({ collections: Object.keys(collections.map(c=>c.name)), data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
