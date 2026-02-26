/**
 * Check Trial Status Middleware
 * Blocks access if trial has expired
 */

import SchoolRegistry from '../models/SchoolRegistry.js';

/**
 * Check if school's trial has expired
 * If expired, block all access except logout and subscription pages
 */
export const checkTrialStatus = async (req, res, next) => {
  try {
    // Get school ID from authenticated admin
    const schoolId = req.admin?.schoolId?._id || req.admin?.schoolId;

    if (!schoolId) {
      return res.status(401).json({
        success: false,
        message: 'School not found',
      });
    }

    // Find school in registry
    const schoolRegistry = await SchoolRegistry.findOne({ schoolId });

    if (!schoolRegistry) {
      // If not in registry, allow access (backward compatibility)
      return next();
    }

    const now = new Date();
    const planEndDate = new Date(schoolRegistry.planEndDate);

    // Check if trial is active
    if (schoolRegistry.planType === 'trial') {
      // Trial has expired
      if (now > planEndDate) {
        // Update trial status
        if (schoolRegistry.trialActive) {
          schoolRegistry.trialActive = false;
          schoolRegistry.accountStatus = 'inactive';
          await schoolRegistry.save();
        }

        return res.status(403).json({
          success: false,
          planExpired: true,
          trialExpired: true,
          planType: 'trial',
          message: 'Your 7-day free trial has ended. Please subscribe to a paid plan to continue using the platform.',
          planEndDate: schoolRegistry.planEndDate,
        });
      }
    }

    // Check if paid plan has expired
    if (schoolRegistry.planType === 'paid') {
      // Paid plan has expired
      if (now > planEndDate) {
        // Update account status
        if (schoolRegistry.accountStatus !== 'inactive') {
          schoolRegistry.accountStatus = 'inactive';
          await schoolRegistry.save();
        }

        return res.status(403).json({
          success: false,
          planExpired: true,
          paidPlanExpired: true,
          planType: 'paid',
          selectedPlan: schoolRegistry.selectedPlan,
          message: 'Your subscription plan has ended. Please renew your plan to continue accessing the platform.',
          planEndDate: schoolRegistry.planEndDate,
          contactSupport: 'Please contact Super Admin to reactivate your plan.',
        });
      }
    }

    // Check if account is inactive (for paid plans too)
    if (schoolRegistry.accountStatus === 'inactive') {
      return res.status(403).json({
        success: false,
        accountInactive: true,
        message: 'Your account is inactive. Please contact support or subscribe to a plan.',
      });
    }

    // Check if account is suspended
    if (schoolRegistry.accountStatus === 'suspended') {
      return res.status(403).json({
        success: false,
        accountSuspended: true,
        message: 'Your account has been suspended. Please contact support.',
      });
    }

    // Check if awaiting approval
    if (schoolRegistry.approvalStatus === 'pending') {
      return res.status(403).json({
        success: false,
        awaitingApproval: true,
        message: 'Your account is awaiting approval. Please wait for administrator confirmation.',
      });
    }

    // All checks passed - allow access
    next();
  } catch (error) {
    console.error('Trial status check error:', error);
    // On error, allow access to prevent blocking legitimate users
    next();
  }
};

/**
 * Lightweight check - just returns trial info without blocking
 * Used for displaying trial status in UI
 */
export const getTrialInfo = async (req, res, next) => {
  try {
    const schoolId = req.admin?.schoolId?._id || req.admin?.schoolId;

    if (!schoolId) {
      return next();
    }

    const schoolRegistry = await SchoolRegistry.findOne({ schoolId });

    if (!schoolRegistry) {
      return next();
    }

    // Attach trial info to request
    req.trialInfo = {
      planType: schoolRegistry.planType,
      planEndDate: schoolRegistry.planEndDate,
      trialActive: schoolRegistry.trialActive,
      accountStatus: schoolRegistry.accountStatus,
      approvalStatus: schoolRegistry.approvalStatus,
      daysRemaining: schoolRegistry.trialDaysRemaining,
      isExpired: schoolRegistry.isTrialExpired,
    };

    next();
  } catch (error) {
    console.error('Get trial info error:', error);
    next();
  }
};
