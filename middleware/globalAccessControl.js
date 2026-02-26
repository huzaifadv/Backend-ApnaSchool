import School from '../models/School.js';

/**
 * Global Access Control Middleware
 *
 * This middleware enforces access control rules for ALL admin API routes.
 * Must be applied AFTER the protect middleware.
 *
 * Access Rules:
 * 1. trialActive = true → Full access
 * 2. trialExpired → Block everything except logout
 * 3. approvalStatus = pending → Block everything except logout
 * 4. accountStatus = suspended → Block everything
 * 5. approved + active → Full access
 *
 * Backend-enforced - NOT frontend only
 * Rejects ALL API calls if user is not allowed
 */

const CONTACT_EMAIL = 'apnaschool.edu@gmail.com';

export const globalAccessControl = async (req, res, next) => {
  try {
    // Skip access control for logout endpoint
    if (req.path === '/logout' || req.path.includes('/logout')) {
      return next();
    }

    // Get school information
    const school = await School.findById(req.schoolId).select(
      'planType approvalStatus accountStatus isActive trial subscription suspensionReason suspendedAt'
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
        blockAccess: true
      });
    }

    // RULE 1: Check if suspended (highest priority - blocks everything)
    if (school.accountStatus === 'suspended') {
      return res.status(403).json({
        success: false,
        blocked: true,
        reason: 'suspended',
        accountSuspended: true,
        message: 'Your account has been suspended. Please contact support.',
        contactEmail: CONTACT_EMAIL,
        suspensionReason: school.suspensionReason,
        suspendedAt: school.suspendedAt,
        blockAllFeatures: true
      });
    }

    // RULE 2: Check if approval is pending (blocks all features except logout)
    if (school.approvalStatus === 'pending') {
      // For paid plans - show pending invoice message
      if (school.planType === 'paid') {
        return res.status(403).json({
          success: false,
          blocked: true,
          reason: 'pending_approval',
          awaitingApproval: true,
          planType: 'paid',
          message: 'Pending invoice approval',
          contactEmail: CONTACT_EMAIL,
          blockAllFeatures: true
        });
      }

      // For trial plans - show pending approval message
      return res.status(403).json({
        success: false,
        blocked: true,
        reason: 'pending_approval',
        awaitingApproval: true,
        planType: 'trial',
        message: 'Your account is awaiting approval. Please wait for administrator confirmation.',
        contactEmail: CONTACT_EMAIL,
        blockAllFeatures: true
      });
    }

    // RULE 3: Check if rejected
    if (school.approvalStatus === 'rejected') {
      return res.status(403).json({
        success: false,
        blocked: true,
        reason: 'rejected',
        accountRejected: true,
        message: 'Your account has been rejected. Please contact support.',
        contactEmail: CONTACT_EMAIL,
        rejectionReason: school.rejectionReason,
        blockAllFeatures: true
      });
    }

    // RULE 4: Check trial status (for trial plan type)
    if (school.planType === 'trial') {
      const now = new Date();

      // Check if trial exists and is configured
      if (!school.trial || !school.trial.endDate) {
        return res.status(403).json({
          success: false,
          blocked: true,
          reason: 'trial_not_configured',
          message: 'Trial period not configured. Please contact support.',
          contactEmail: CONTACT_EMAIL,
          blockAllFeatures: true
        });
      }

      const trialEndDate = new Date(school.trial.endDate);
      const trialActive = school.trial.isActive && now <= trialEndDate;

      // RULE 4a: Trial expired → Block everything except logout
      if (!trialActive) {
        const daysExpired = Math.ceil((now - trialEndDate) / (1000 * 60 * 60 * 24));

        return res.status(403).json({
          success: false,
          blocked: true,
          reason: 'trial_expired',
          trialExpired: true,
          message: 'Your free trial has ended. Please subscribe to continue.',
          contactEmail: CONTACT_EMAIL,
          trialEndDate: school.trial.endDate,
          daysExpired,
          blockAllFeatures: true
        });
      }

      // RULE 4b: Trial active → Full access (continue to next middleware)
      // Attach trial info to request for potential use
      req.trialInfo = {
        isActive: true,
        endDate: school.trial.endDate,
        daysRemaining: Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24))
      };
    }

    // RULE 5: Check paid plan status
    if (school.planType === 'paid') {
      // Must be approved
      if (school.approvalStatus !== 'approved') {
        return res.status(403).json({
          success: false,
          blocked: true,
          reason: 'not_approved',
          message: 'Your account is not approved. Please contact support.',
          contactEmail: CONTACT_EMAIL,
          blockAllFeatures: true
        });
      }

      // Must have active account status
      if (school.accountStatus !== 'active') {
        return res.status(403).json({
          success: false,
          blocked: true,
          reason: 'inactive',
          accountInactive: true,
          message: 'Your account is inactive. Please contact support.',
          contactEmail: CONTACT_EMAIL,
          blockAllFeatures: true
        });
      }

      // Check subscription expiry
      if (school.subscription && school.subscription.endDate) {
        const now = new Date();
        const subscriptionEndDate = new Date(school.subscription.endDate);

        if (now > subscriptionEndDate) {
          return res.status(403).json({
            success: false,
            blocked: true,
            reason: 'subscription_expired',
            subscriptionExpired: true,
            message: 'Your subscription has expired. Please renew to continue.',
            contactEmail: CONTACT_EMAIL,
            subscriptionEndDate: school.subscription.endDate,
            blockAllFeatures: true
          });
        }

        // Attach subscription info to request
        req.subscriptionInfo = {
          plan: school.subscription.plan,
          endDate: school.subscription.endDate,
          daysRemaining: Math.ceil((subscriptionEndDate - now) / (1000 * 60 * 60 * 24))
        };
      }

      // RULE 5: Approved + Active → Full access
    }

    // RULE 6: Check overall active status
    if (!school.isActive) {
      return res.status(403).json({
        success: false,
        blocked: true,
        reason: 'not_active',
        message: 'School account is not active. Please contact support.',
        contactEmail: CONTACT_EMAIL,
        blockAllFeatures: true
      });
    }

    // All checks passed - allow access
    req.schoolInfo = {
      planType: school.planType,
      approvalStatus: school.approvalStatus,
      accountStatus: school.accountStatus,
      isActive: school.isActive
    };

    next();
  } catch (error) {
    console.error('Global Access Control Error:', error);
    return res.status(500).json({
      success: false,
      blocked: true,
      message: 'Error checking access permissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Lightweight version for less critical routes
 * Can be used for routes that don't need full validation
 */
export const lightAccessControl = async (req, res, next) => {
  try {
    const school = await School.findById(req.schoolId).select('accountStatus approvalStatus');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Only block if suspended or rejected
    if (school.accountStatus === 'suspended' || school.approvalStatus === 'rejected') {
      return res.status(403).json({
        success: false,
        blocked: true,
        message: 'Access denied',
        contactEmail: CONTACT_EMAIL
      });
    }

    next();
  } catch (error) {
    console.error('Light Access Control Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking access permissions'
    });
  }
};
