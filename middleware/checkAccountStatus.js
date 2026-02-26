import School from '../models/School.js';

/**
 * Middleware to check account status and approval for paid plans
 * This middleware should be applied AFTER the protect middleware
 * to ensure admin/school information is available
 */
export const checkAccountStatus = async (req, res, next) => {
  try {
    // Get school information
    const school = await School.findById(req.schoolId).select('planType approvalStatus accountStatus selectedPlan');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // PAID PLAN BLOCKING LOGIC
    // If school has a paid plan (Monthly/Yearly/5-Year), check approval and status
    if (school.planType === 'paid') {
      // Block if awaiting approval
      if (school.approvalStatus === 'pending') {
        return res.status(403).json({
          success: false,
          awaitingApproval: true,
          planType: 'paid',
          message: 'Pending invoice approval',
          contactEmail: 'apnaschool.edu@gmail.com',
          selectedPlan: school.selectedPlan,
          blockAllFeatures: true
        });
      }

      // Block if rejected
      if (school.approvalStatus === 'rejected') {
        return res.status(403).json({
          success: false,
          accountRejected: true,
          planType: 'paid',
          message: 'Your account has been rejected. Please contact support.',
          contactEmail: 'apnaschool.edu@gmail.com'
        });
      }

      // Block if account is inactive (even if approved)
      if (school.accountStatus === 'inactive') {
        return res.status(403).json({
          success: false,
          accountInactive: true,
          planType: 'paid',
          message: 'Your account is inactive. Please contact support.',
          contactEmail: 'apnaschool.edu@gmail.com'
        });
      }

      // Only proceed if:
      // - approvalStatus === 'approved'
      // - accountStatus === 'active'
    }

    // For trial plans, this middleware doesn't block
    // (trial expiration is handled by checkTrialStatus middleware)

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error checking account status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
