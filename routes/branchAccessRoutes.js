import express from 'express';
import {
  listBranches,
  selectBranch,
  inviteBranchAdmin,
  sendInviteOTP,
  listInvitedAdmins,
  requestBranchUpgrade,
  createBranch,
  verifyBranchInvite,
  getBranchDetails,
  resetBranchAdminPassword
} from '../controllers/branchAccessController.js';
import { protect, authorize, protectAdminAccess, authorizeAdminAccess } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protectAdminAccess, listBranches);
router.get('/invites', protectAdminAccess, authorizeAdminAccess('super_admin'), listInvitedAdmins);
router.post('/select', protectAdminAccess, selectBranch);
router.post('/invite-otp', protectAdminAccess, authorizeAdminAccess('super_admin'), sendInviteOTP);
router.post('/invite', protectAdminAccess, authorizeAdminAccess('super_admin'), inviteBranchAdmin);
router.get('/:branchId/details', protect, authorizeAdminAccess('super_admin'), getBranchDetails);
router.put('/:branchId/reset-password', protect, authorizeAdminAccess('super_admin'), resetBranchAdminPassword);
router.post('/request-upgrade', protect, authorize('super_admin'), requestBranchUpgrade);
router.post('/create', protect, authorize('super_admin'), createBranch);
router.get('/verify-invite', verifyBranchInvite);

export default router;
