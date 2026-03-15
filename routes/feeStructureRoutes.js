/**
 * Fee Structure Routes
 * /api/admin/fee-structures
 */

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getFeeStructures,
  getFeeStructureByClass,
  createOrUpdateFeeStructure,
  updateLateFeePolicy,
  deleteFeeStructure,
  cloneFeeStructure
} from '../controllers/feeStructureController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.route('/')
  .get(getFeeStructures)
  .post(createOrUpdateFeeStructure);

router.get('/class/:classId', getFeeStructureByClass);

router.route('/:id')
  .delete(deleteFeeStructure);

router.patch('/:id/late-fee-policy', updateLateFeePolicy);
router.post('/:id/clone', cloneFeeStructure);

export default router;
