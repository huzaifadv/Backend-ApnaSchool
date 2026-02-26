import jwt from 'jsonwebtoken';

/**
 * Tenant Middleware for Multi-tenant Architecture
 * Extracts schoolId from authenticated requests and attaches it to req object
 */

/**
 * Extract schoolId from JWT token and attach to request
 * This middleware should be used after authentication middleware
 */
export const extractSchoolId = async (req, res, next) => {
  try {
    // Check if schoolId is already set (from auth middleware or previous middleware)
    if (req.schoolId) {
      return next();
    }

    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Extract schoolId from token
    if (!decoded.schoolId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token: School ID not found'
      });
    }

    // Attach schoolId and other user info to request
    req.schoolId = decoded.schoolId;
    req.userId = decoded.id;
    req.userType = decoded.type; // 'admin', 'student', 'parent', etc.

    // For parent type, attach studentId
    if (decoded.type === 'parent' && decoded.studentId) {
      req.studentId = decoded.studentId;
    }

    next();
  } catch (error) {
    console.error('Error in extractSchoolId middleware:', error.message);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Authentication token expired'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error processing authentication'
    });
  }
};

/**
 * Validate school and enforce global access control
 * This middleware enforces ALL access rules:
 * - trialActive = true → full access
 * - trialExpired → block everything except logout
 * - approvalStatus = pending → block everything except logout
 * - accountStatus = suspended → block everything
 * - approved + active → full access
 */
export const validateSchool = async (req, res, next) => {
  try {
    // Skip access control for logout endpoint
    if (req.path === '/logout' || req.path.includes('/logout')) {
      return next();
    }

    if (!req.schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School ID not found in request'
      });
    }

    const { default: School } = await import('../models/School.js');

    const school = await School.findById(req.schoolId).select(
      'isActive planType approvalStatus accountStatus trial subscription suspensionReason suspendedAt rejectionReason'
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
        blockAllFeatures: true
      });
    }

    const CONTACT_EMAIL = 'apnaschool.edu@gmail.com';

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

    // RULE 2: Check if approval is pending
    if (school.approvalStatus === 'pending') {
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

      return res.status(403).json({
        success: false,
        blocked: true,
        reason: 'pending_approval',
        awaitingApproval: true,
        planType: 'trial',
        message: 'Your account is awaiting approval.',
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

      // Trial expired → Block everything except logout
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

      // Trial active → Attach info
      req.trialInfo = {
        isActive: true,
        endDate: school.trial.endDate,
        daysRemaining: Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24))
      };
    }

    // RULE 5: Check paid plan status
    if (school.planType === 'paid') {
      if (school.approvalStatus !== 'approved') {
        return res.status(403).json({
          success: false,
          blocked: true,
          reason: 'not_approved',
          message: 'Your account is not approved.',
          contactEmail: CONTACT_EMAIL,
          blockAllFeatures: true
        });
      }

      if (school.accountStatus !== 'active') {
        return res.status(403).json({
          success: false,
          blocked: true,
          reason: 'inactive',
          accountInactive: true,
          message: 'Your account is inactive.',
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

        req.subscriptionInfo = {
          plan: school.subscription.plan,
          endDate: school.subscription.endDate,
          daysRemaining: Math.ceil((subscriptionEndDate - now) / (1000 * 60 * 60 * 24))
        };
      }
    }

    // RULE 6: Check overall active status
    if (!school.isActive) {
      return res.status(403).json({
        success: false,
        blocked: true,
        reason: 'not_active',
        message: 'School account is not active.',
        contactEmail: CONTACT_EMAIL,
        blockAllFeatures: true
      });
    }

    // All checks passed - attach school info
    req.school = school;
    req.schoolInfo = {
      planType: school.planType,
      approvalStatus: school.approvalStatus,
      accountStatus: school.accountStatus,
      isActive: school.isActive
    };

    next();
  } catch (error) {
    console.error('Error in validateSchool middleware:', error.message);
    return res.status(500).json({
      success: false,
      blocked: true,
      message: 'Error validating school',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Extract schoolId from request body (for school registration)
 * Used in specific routes where schoolId comes from body instead of token
 */
export const extractSchoolIdFromBody = (req, res, next) => {
  if (req.body.schoolId) {
    req.schoolId = req.body.schoolId;
  }
  next();
};

/**
 * Extract schoolId from URL params
 * Used in routes like /api/school/:schoolId/students
 */
export const extractSchoolIdFromParams = (req, res, next) => {
  if (req.params.schoolId) {
    req.schoolId = req.params.schoolId;
  }
  next();
};

/**
 * Require specific user type for a route
 * @param {Array} allowedTypes - Array of allowed user types ['admin', 'teacher', etc.]
 */
export const requireUserType = (allowedTypes) => {
  return (req, res, next) => {
    if (!req.userType) {
      return res.status(401).json({
        success: false,
        message: 'User type not found in request'
      });
    }

    if (!allowedTypes.includes(req.userType)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required user type: ${allowedTypes.join(' or ')}`
      });
    }

    next();
  };
};

/**
 * Combined middleware: Extract schoolId and validate
 * Use this as a shortcut for most protected routes
 */
export const tenantAuth = [extractSchoolId, validateSchool];

export default {
  extractSchoolId,
  validateSchool,
  extractSchoolIdFromBody,
  extractSchoolIdFromParams,
  requireUserType,
  tenantAuth
};
