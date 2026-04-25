import express from 'express';
import { generatePaper, getPapers, downloadPaper } from '../controllers/paperController.js';
import { protectStaff } from '../middleware/staffAuthMiddleware.js';

const router = express.Router();

router.post('/generate', protectStaff, generatePaper);
router.get('/', protectStaff, getPapers);
router.get('/:id/download', protectStaff, downloadPaper);

export default router;
