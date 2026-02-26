import express from 'express';
import {
  getParentDiaryEntries,
  getParentDiaryById
} from '../controllers/parentDiaryController.js';
import { protectParent } from '../middleware/authMiddleware.js';

const router = express.Router();

// All parent diary routes require parent authentication
router.use(protectParent);

// Routes
router.get('/', getParentDiaryEntries);
router.get('/:id', getParentDiaryById);

export default router;
