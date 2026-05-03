import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { getClassesForIDCard, getStaffForIDCard, generateIDCards, previewIDCard } from '../controllers/idCardController.js';

const router = express.Router();

router.use(protect); // Ensure the person is authenticated
router.use(authorize('admin', 'super_admin')); // Restrict to admin

router.get('/classes', getClassesForIDCard);
router.get('/staff', getStaffForIDCard);
router.post('/generate', generateIDCards);
router.post('/preview', previewIDCard);

export default router;
