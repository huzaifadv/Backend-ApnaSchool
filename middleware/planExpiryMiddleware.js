import School from '../models/School.js';

/**
 * Middleware to check if school's plan has expired
 * Blocks access if plan is expired and grace period is over
 */
export const checkPlanExpiry = async (req, res, next) => {
  try {
    // Skip check for super admin
    if (req.admin && req.admin.role === 'super_admin') {
      return next();
    }

    // Get school from database
    const school = await School.findById(req.schoolId);

    if (!school) {
      return res.status(403).json({
        success: false,
        message: 'School not found',
        planExpired: true
      });
    }

    const now = new Date();

    // Check trial expiry
    if (school.planType === 'trial' && school.trial?.endDate) {
      if (now > new Date(school.trial.endDate)) {
        school.isPlanExpired = true;
        school.trial.isActive = false;
        school.paymentStatus = 'overdue';
        school.accountStatus = 'suspended';
        school.approvalStatus = 'pending'; // Move to pending for Super Admin action
        await school.save();

        return res.status(403).json({
          success: false,
          message: 'Trial period has expired. Please upgrade to a paid plan.',
          planExpired: true,
          trialExpired: true,
          planType: school.planType,
          planEndDate: school.trial.endDate
        });
      }
    }

    // Check paid plan expiry
    if (school.planType === 'paid' && school.planEndDate) {
      const planEndDate = new Date(school.planEndDate);
      const gracePeriodEnd = school.gracePeriodEndDate
        ? new Date(school.gracePeriodEndDate)
        : new Date(planEndDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days grace

      if (now > gracePeriodEnd) {
        // Grace period over - block access and set to pending
        school.isPlanExpired = true;
        school.subscription.status = 'expired';
        school.paymentStatus = 'overdue';
        school.accountStatus = 'suspended';
        school.approvalStatus = 'pending'; // Move to pending for Super Admin action
        await school.save();

        return res.status(403).json({
          success: false,
          message: 'Your subscription has expired. Please contact administrator for renewal.',
          planExpired: true,
          paidPlanExpired: true,
          planType: school.planType,
          planEndDate: school.planEndDate,
          gracePeriodEndDate: gracePeriodEnd,
          selectedPlan: school.selectedPlan
        });
      } else if (now > planEndDate) {
        // In grace period - allow access but warn
        school.isPlanExpired = true;
        school.paymentStatus = 'pending';
        await school.save();

        // Set warning header but allow access
        res.locals.planWarning = {
          message: `Your plan expired on ${planEndDate.toLocaleDateString()}. Grace period ends on ${gracePeriodEnd.toLocaleDateString()}.`,
          daysLeft: Math.ceil((gracePeriodEnd - now) / (24 * 60 * 60 * 1000))
        };
      }
    }

    // Check if account is suspended
    if (school.accountStatus === 'suspended') {
      return res.status(403).json({
        success: false,
        message: school.suspensionReason || 'Your account has been suspended. Please contact administrator.',
        accountSuspended: true,
        suspensionReason: school.suspensionReason
      });
    }

    // Check if account is inactive
    if (!school.isActive || school.accountStatus === 'inactive') {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive. Please contact administrator.',
        accountInactive: true
      });
    }

    // All checks passed
    next();

  } catch (error) {
    console.error('Plan expiry check error:', error);
    next(error);
  }
};

/**
 * Middleware for read-only access during grace period
 * Allows GET requests but blocks POST, PUT, DELETE
 */
export const gracePeriodRestriction = async (req, res, next) => {
  try {
    // Skip for super admin or GET requests
    if (req.admin?.role === 'super_admin' || req.method === 'GET') {
      return next();
    }

    const school = await School.findById(req.schoolId);

    if (school && school.isPlanExpired) {
      return res.status(403).json({
        success: false,
        message: 'Your plan has expired. You can only view data. Please renew to add/edit/delete.',
        readOnlyMode: true,
        planExpired: true
      });
    }

    next();
  } catch (error) {
    console.error('Grace period restriction error:', error);
    next(error);
  }
};

export default { checkPlanExpiry, gracePeriodRestriction };
