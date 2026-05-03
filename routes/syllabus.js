import express from 'express';
import { generateSyllabus, getSyllabusHistory } from '../controllers/syllabusController.js';
import { protectStaff } from '../middleware/staffAuthMiddleware.js';

const router = express.Router();

router.post('/generate', protectStaff, generateSyllabus);
router.get('/history', protectStaff, getSyllabusHistory);

export default router;
