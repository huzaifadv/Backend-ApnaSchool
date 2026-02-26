import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import School from '../models/School.js';

const router = express.Router();

// Get available subscription plans
router.get('/plans', async (req, res) => {
  try {
    const plans = [
      {
        id: 'monthly',
        name: 'Monthly Plan',
        price: 999,
        duration: 30,
        features: [
          'Unlimited Students',
          'Attendance Management',
          'Report Card Generation',
          'Parent Portal Access',
          'Notice Board',
          'Diary Management',
          'Email Support'
        ]
      },
      {
        id: 'quarterly',
        name: 'Quarterly Plan',
        price: 2499,
        duration: 90,
        savings: 15,
        features: [
          'All Monthly Features',
          'Priority Support',
          '15% Discount',
          'Advanced Analytics'
        ]
      },
      {
        id: 'yearly',
        name: 'Yearly Plan',
        price: 7999,
        duration: 365,
        savings: 33,
        popular: true,
        features: [
          'All Quarterly Features',
          '33% Discount',
          'Dedicated Account Manager',
          'Custom Integrations',
          'Training Sessions',
          'Premium Support'
        ]
      }
    ];

    res.json({ success: true, plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create subscription order
router.post('/create-order', protect, async (req, res) => {
  try {
    const { planId } = req.body;
    const schoolId = req.schoolId;

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    // Here you would integrate with payment gateway (Razorpay, Stripe, etc.)
    // For now, returning a mock order
    const order = {
      orderId: `ORDER_${Date.now()}`,
      planId,
      amount: planId === 'monthly' ? 999 : planId === 'quarterly' ? 2499 : 7999,
      currency: 'INR',
      schoolId: school._id
    };

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Verify payment and activate subscription
router.post('/verify-payment', protect, async (req, res) => {
  try {
    const { orderId, paymentId, planId } = req.body;
    const schoolId = req.schoolId;

    // Here you would verify payment with payment gateway
    // For now, simulating successful payment verification

    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    // Calculate subscription end date based on plan
    const durationDays = planId === 'monthly' ? 30 : planId === 'quarterly' ? 90 : 365;
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setDate(subscriptionEndDate.getDate() + durationDays);

    // Update school subscription fields (will be added to School model)
    school.subscription = {
      plan: planId,
      status: 'active',
      startDate: new Date(),
      endDate: subscriptionEndDate,
      paymentId,
      orderId
    };

    // Remove trial status if exists
    if (school.trial) {
      school.trial.isActive = false;
    }

    await school.save();

    res.json({
      success: true,
      message: 'Subscription activated successfully',
      subscription: school.subscription
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get current subscription status
router.get('/status', protect, async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    const response = {
      success: true,
      subscription: school.subscription || null,
      trial: school.trial || null,
      isTrialActive: school.trial?.isActive && new Date(school.trial.endDate) > new Date(),
      isSubscriptionActive: school.subscription?.status === 'active' &&
                           new Date(school.subscription.endDate) > new Date()
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get plan details (comprehensive)
router.get('/plan-details', protect, async (req, res) => {
  try {
    const schoolId = req.schoolId;

    // Import SchoolRegistry dynamically to avoid circular dependencies
    const { default: SchoolRegistry } = await import('../models/SchoolRegistry.js');

    // Get data from both School and SchoolRegistry
    const school = await School.findById(schoolId).select('trial subscription planType selectedPlan');
    const schoolRegistry = await SchoolRegistry.findOne({ schoolId });

    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    // Prepare response with comprehensive plan details
    const now = new Date();
    let planData = {};

    if (schoolRegistry) {
      // Use SchoolRegistry as primary source (more reliable)
      planData = {
        planType: schoolRegistry.planType,
        selectedPlan: schoolRegistry.selectedPlan,
        planStartDate: schoolRegistry.planStartDate,
        planEndDate: schoolRegistry.planEndDate,
        accountStatus: schoolRegistry.accountStatus,
        approvalStatus: schoolRegistry.approvalStatus,
        trialActive: schoolRegistry.trialActive,
        trialDaysRemaining: schoolRegistry.trialDaysRemaining,
        isTrialExpired: schoolRegistry.isTrialExpired,
        isSubscriptionActive: schoolRegistry.isSubscriptionActive
      };
    } else {
      // Fallback to School model
      planData = {
        planType: school.planType || 'trial',
        selectedPlan: school.selectedPlan || 'FREE_TRIAL',
        planStartDate: school.trial?.startDate || school.subscription?.startDate,
        planEndDate: school.trial?.endDate || school.subscription?.endDate,
        accountStatus: school.accountStatus || 'inactive',
        approvalStatus: school.approvalStatus || 'pending',
        trialActive: school.trial?.isActive,
        trialDaysRemaining: school.trial?.endDate
          ? Math.ceil((new Date(school.trial.endDate) - now) / (1000 * 60 * 60 * 24))
          : 0,
        isTrialExpired: school.trial?.endDate ? now > new Date(school.trial.endDate) : true,
        isSubscriptionActive: school.subscription?.status === 'active' &&
                             school.subscription?.endDate &&
                             now <= new Date(school.subscription.endDate)
      };
    }

    res.json({
      success: true,
      data: planData
    });
  } catch (error) {
    console.error('Error fetching plan details:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
