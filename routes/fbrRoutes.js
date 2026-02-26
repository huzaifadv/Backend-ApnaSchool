import express from 'express';
import {
  getFBRConfig,
  updateFBRConfig,
  testFBRAPI,
  getFBRStatus
} from '../controllers/fbrController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * All FBR routes require School Admin authentication
 * Multi-tenant safety: schoolId is extracted from JWT by protect middleware
 */

// Get FBR configuration
router.get('/config', protect, getFBRConfig);

// Update FBR configuration
router.put('/config', protect, updateFBRConfig);

// Test FBR API connection
router.post('/test', protect, testFBRAPI);

// Get FBR status (enabled + configured check)
router.get('/status', protect, getFBRStatus);

export default router;
