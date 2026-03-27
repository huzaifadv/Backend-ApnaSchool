import jwt from 'jsonwebtoken';
import SuperAdmin from '../models/SuperAdmin.js';
import School from '../models/School.js';
import Admin from '../models/Admin.js';
import Student from '../models/Student.js';
import { getModel } from '../models/dynamicModels.js';
import SuperAdminNotice from '../models/SuperAdminNotice.js';

/**
 * Generate JWT token for Super Admin
 */
const generateToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // Super Admin token expires in 7 days
  );
};

/**
 * @desc    Login Super Admin
 * @route   POST /api/super-admin/login
 * @access  Public
 */
const loginSuperAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Fixed super admin credentials
    const FIXED_EMAIL = 'apnaschool.edu@gmail.com';
    const FIXED_PASSWORD = '@Apnaschool786$';

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    // Check if the provided credentials match the fixed credentials
    if (email !== FIXED_EMAIL || password !== FIXED_PASSWORD) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if super admin exists in database
    let superAdmin = await SuperAdmin.findOne({ email: FIXED_EMAIL }).select('+password');

    // If database is empty or super admin doesn't exist, create it
    if (!superAdmin) {
      console.log('Creating super admin for first time login...');

      try {
        superAdmin = await SuperAdmin.create({
          name: 'Super Admin',
          email: FIXED_EMAIL,
          password: FIXED_PASSWORD,
          role: 'SUPER_ADMIN',
          isActive: true,
          lastLogin: new Date(),
        });

        console.log('Super admin created successfully');
      } catch (createError) {
        // If error is due to existing super admin, try to find it again
        if (createError.message.includes('Only one Super Admin can exist')) {
          superAdmin = await SuperAdmin.findOne({}).select('+password');

          // Update existing super admin with fixed credentials
          if (superAdmin) {
            superAdmin.email = FIXED_EMAIL;
            superAdmin.password = FIXED_PASSWORD;
            superAdmin.isActive = true;
            superAdmin.loginAttempts = 0;
            superAdmin.lockUntil = undefined;
            await superAdmin.save();
            console.log('Updated existing super admin with fixed credentials');
          }
        } else {
          throw createError;
        }
      }
    } else {
      // Super admin exists - verify it's active
      // Check if account is locked
      if (superAdmin.isLocked()) {
        // Reset lock since they provided correct credentials
        await superAdmin.resetLoginAttempts();
      }

      // Check if account is active
      if (!superAdmin.isActive) {
        // Reactivate account since they provided correct credentials
        superAdmin.isActive = true;
      }

      // Reset login attempts on successful login
      await superAdmin.resetLoginAttempts();

      // Update last login
      superAdmin.lastLogin = new Date();
      await superAdmin.save();
    }

    // Generate token
    const token = generateToken(superAdmin._id, superAdmin.role);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        superAdmin: {
          id: superAdmin._id,
          name: superAdmin.name,
          email: superAdmin.email,
          role: superAdmin.role,
          lastLogin: superAdmin.lastLogin,
        },
      },
    });
  } catch (error) {
    console.error('Super Admin Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
    });
  }
};

/**
 * @desc    Get Super Admin profile
 * @route   GET /api/super-admin/profile
 * @access  Private (Super Admin)
 */
const getSuperAdminProfile = async (req, res) => {
  try {
    const superAdmin = await SuperAdmin.findById(req.superAdmin.id);

    if (!superAdmin) {
      return res.status(404).json({
        success: false,
        message: 'Super Admin not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: superAdmin._id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: superAdmin.role,
        isActive: superAdmin.isActive,
        lastLogin: superAdmin.lastLogin,
        createdAt: superAdmin.createdAt,
      },
    });
  } catch (error) {
    console.error('Get Super Admin Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile',
    });
  }
};

/**
 * @desc    Update Super Admin password
 * @route   PUT /api/super-admin/update-password
 * @access  Private (Super Admin)
 */
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long',
      });
    }

    // Get Super Admin with password
    const superAdmin = await SuperAdmin.findById(req.superAdmin.id).select('+password');

    if (!superAdmin) {
      return res.status(404).json({
        success: false,
        message: 'Super Admin not found',
      });
    }

    // Verify current password
    const isMatch = await superAdmin.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Update password
    superAdmin.password = newPassword;
    await superAdmin.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    console.error('Update Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating password',
    });
  }
};

/**
 * @desc    Get all schools with filtering (Dashboard overview)
 * @route   GET /api/super-admin/schools?filter=trial|pending|active|suspended
 * @access  Private (Super Admin)
 */
const getAllSchools = async (req, res) => {
  try {
    const { filter } = req.query;
    let query = {};

    // Apply filters based on query parameter
    switch (filter) {
      case 'trial':
        // Schools with trial plan type
        query.planType = 'trial';
        break;

      case 'pending':
        // Schools pending approval or renewal (includes expired trial and paid plans)
        query.approvalStatus = 'pending';
        // Show both trial and paid plans that need approval/renewal
        break;

      case 'active':
        // Schools with active status
        query.accountStatus = 'active';
        query.approvalStatus = 'approved';
        break;

      case 'suspended':
        // Suspended schools
        query.accountStatus = 'suspended';
        break;

      case 'rejected':
        // Rejected schools
        query.approvalStatus = 'rejected';
        break;

      case 'paid':
        // Paid plan schools
        query.planType = 'paid';
        break;

      default:
        // No filter - return all schools
        break;
    }

    const schools = await School.find(query)
      .select('schoolName email phone address city state selectedPlan billingCycle planType planPrice planDuration approvalStatus accountStatus isActive createdAt trial subscription planStartDate planEndDate fbrEnabled')
      .sort({ createdAt: -1 });

    // Import SchoolRegistry to get plan dates
    const { default: SchoolRegistry } = await import('../models/SchoolRegistry.js');

    // Get admin count, student count, and plan dates for each school
    const schoolsWithDetails = await Promise.all(
      schools.map(async (school) => {
        // Count admins from global database
        const adminCount = await Admin.countDocuments({ schoolId: school._id });

        // Count students from tenant database
        let totalStudents = 0;
        try {
          const StudentModel = await getModel(school._id, 'students');
          totalStudents = await StudentModel.countDocuments();
        } catch (error) {
          console.error(`Error counting students for school ${school.schoolName}:`, error.message);
        }

        // Get plan dates from SchoolRegistry first, then fallback to School model
        const schoolRegistry = await SchoolRegistry.findOne({ schoolId: school._id });
        let planStartDate = null;
        let planEndDate = null;

        if (schoolRegistry) {
          // Use SchoolRegistry data (most reliable)
          planStartDate = schoolRegistry.planStartDate;
          planEndDate = schoolRegistry.planEndDate;
        } else if (school.trial || school.subscription) {
          // Fallback to School model
          if (school.planType === 'trial' && school.trial) {
            planStartDate = school.trial.startDate;
            planEndDate = school.trial.endDate;
          } else if (school.planType === 'paid' && school.subscription) {
            planStartDate = school.subscription.startDate;
            planEndDate = school.subscription.endDate;
          }
        }

        // Debug logging
        console.log(`[DEBUG] School: ${school.schoolName}, Registry: ${!!schoolRegistry}, StartDate: ${planStartDate}, EndDate: ${planEndDate}`);

        // Debug logging for specific schools
        if (school.schoolName && school.schoolName.toLowerCase().includes('kips')) {
          console.log('=== KIPS COLLEGE DEBUG ===');
          console.log('School ID:', school._id);
          console.log('School Name:', school.schoolName);
          console.log('Total Students from tenant DB:', totalStudents);

          // Check all students for this school from tenant database
          try {
            const StudentModel = await getModel(school._id, 'students');
            const allStudents = await StudentModel.find();
            console.log('All students in tenant DB:', allStudents.length);
            console.log('Student records:', allStudents.map(s => ({
              name: s.fullName,
              isActive: s.isActive,
              rollNumber: s.rollNumber
            })));
          } catch (error) {
            console.error('Error fetching students for debug:', error.message);
          }
        }

        return {
          ...school.toObject(),
          adminCount,
          totalStudents,
          planStartDate,
          planEndDate,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: schoolsWithDetails.length,
      filter: filter || 'all',
      data: schoolsWithDetails,
    });
  } catch (error) {
    console.error('Get All Schools Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching schools',
    });
  }
};

/**
 * @desc    Get school by ID with details
 * @route   GET /api/super-admin/schools/:id
 * @access  Private (Super Admin)
 */
const getSchoolById = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    // Get admins for this school
    const admins = await Admin.find({ schoolId: school._id })
      .select('name email phone isActive createdAt');

    res.status(200).json({
      success: true,
      data: {
        school,
        admins,
      },
    });
  } catch (error) {
    console.error('Get School By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching school details',
    });
  }
};

/**
 * @desc    Toggle school active status
 * @route   PUT /api/super-admin/schools/:id/toggle-status
 * @access  Private (Super Admin)
 */
const toggleSchoolStatus = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    school.isActive = !school.isActive;
    await school.save();

    res.status(200).json({
      success: true,
      message: `School ${school.isActive ? 'activated' : 'deactivated'} successfully`,
      data: school,
    });
  } catch (error) {
    console.error('Toggle School Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error toggling school status',
    });
  }
};

/**
 * @desc    Get platform statistics
 * @route   GET /api/super-admin/stats
 * @access  Private (Super Admin)
 */
const getPlatformStats = async (req, res) => {
  try {
    const totalSchools = await School.countDocuments();
    const activeSchools = await School.countDocuments({ isActive: true });
    const totalAdmins = await Admin.countDocuments();

    // Get schools created in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSchools = await School.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

    res.status(200).json({
      success: true,
      data: {
        totalSchools,
        activeSchools,
        inactiveSchools: totalSchools - activeSchools,
        totalAdmins,
        recentSchools,
      },
    });
  } catch (error) {
    console.error('Get Platform Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching statistics',
    });
  }
};

/**
 * @desc    Check if Super Admin exists (for setup)
 * @route   GET /api/super-admin/exists
 * @access  Public
 */
const checkSuperAdminExists = async (req, res) => {
  try {
    const count = await SuperAdmin.countDocuments();
    res.status(200).json({
      success: true,
      exists: count > 0,
    });
  } catch (error) {
    console.error('Check Super Admin Exists Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error checking Super Admin status',
    });
  }
};

/**
 * @desc    Approve school (for paid plans)
 * @route   PUT /api/super-admin/schools/:id/approve
 * @access  Private (Super Admin)
 */
const approveSchool = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    // Check if selectedPlan needs to be migrated from old values to new values
    const planMigrationMap = {
      '7_DAYS_FREE_TRIAL': 'FREE_TRIAL',
      'MONTHLY': 'BASIC',
      'YEARLY': 'STANDARD',
      'FIVE_YEAR': 'PREMIUM'
    };

    // Migrate old plan values to new ones if needed
    if (planMigrationMap[school.selectedPlan]) {
      console.log(`Migrating plan from ${school.selectedPlan} to ${planMigrationMap[school.selectedPlan]}`);
      school.selectedPlan = planMigrationMap[school.selectedPlan];
    }

    // Update approval status and account status
    school.approvalStatus = 'approved';
    school.accountStatus = 'active';
    school.isActive = true;

    // Initialize trial dates if it's a trial plan
    if (school.planType === 'trial' && !school.trial?.endDate) {
      const trialDays = 14; // 14 days trial
      const trialStartDate = new Date();
      const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

      school.trial = {
        isActive: true,
        startDate: trialStartDate,
        endDate: trialEndDate
      };

      // Also set planStartDate and planEndDate
      school.planStartDate = trialStartDate;
      school.planEndDate = trialEndDate;
    }

    // Initialize subscription dates if it's a paid plan
    if (school.planType === 'paid' && !school.subscription?.endDate) {
      // Check billing cycle - yearly (365 days) or monthly (30 days)
      const isYearly = school.billingCycle === 'YEARLY';
      const planDurationDays = isYearly ? 365 : 30;
      const subscriptionStartDate = new Date();
      const subscriptionEndDate = new Date(Date.now() + planDurationDays * 24 * 60 * 60 * 1000);

      // Update plan price and duration based on billing cycle
      const planPricing = {
        'BASIC': { monthly: 2999, yearly: 29999 },
        'STANDARD': { monthly: 4999, yearly: 49999 },
        'PREMIUM': { monthly: 7999, yearly: 69999 }
      };

      if (planPricing[school.selectedPlan]) {
        school.planPrice = isYearly ? planPricing[school.selectedPlan].yearly : planPricing[school.selectedPlan].monthly;
        school.planDuration = isYearly ? '1 year' : '1 month';
      }

      school.subscription = {
        plan: isYearly ? 'yearly' : 'monthly',
        status: 'active',
        startDate: subscriptionStartDate,
        endDate: subscriptionEndDate
      };

      // Also set planStartDate and planEndDate
      school.planStartDate = subscriptionStartDate;
      school.planEndDate = subscriptionEndDate;

      console.log(`✓ Approved school with ${isYearly ? 'YEARLY' : 'MONTHLY'} billing cycle`);
      console.log(`  Plan: ${school.selectedPlan}`);
      console.log(`  Price: PKR ${school.planPrice}`);
      console.log(`  Duration: ${school.planDuration}`);
      console.log(`  End Date: ${subscriptionEndDate.toLocaleDateString()}`);
    }

    await school.save({ validateModifiedOnly: true });

    // Also update SchoolRegistry if it exists
    try {
      const { default: SchoolRegistry } = await import('../models/SchoolRegistry.js');
      const schoolRegistry = await SchoolRegistry.findOne({ schoolId: school._id });

      if (schoolRegistry) {
        schoolRegistry.approvalStatus = 'approved';
        schoolRegistry.accountStatus = 'active';

        // Update plan dates in registry based on plan type
        if (school.planType === 'trial') {
          schoolRegistry.planStartDate = school.trial?.startDate || new Date();
          schoolRegistry.planEndDate = school.trial?.endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
          schoolRegistry.trialActive = true;
        } else if (school.planType === 'paid') {
          const isYearly = school.billingCycle === 'YEARLY';
          const durationDays = isYearly ? 365 : 30;
          schoolRegistry.planStartDate = school.subscription?.startDate || new Date();
          schoolRegistry.planEndDate = school.subscription?.endDate || new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
          schoolRegistry.trialActive = false;
        }

        await schoolRegistry.save();
        console.log('SchoolRegistry updated successfully with plan dates');
      }
    } catch (registryError) {
      console.error('Error updating SchoolRegistry:', registryError);
      // Don't fail the approval if registry update fails
    }

    res.status(200).json({
      success: true,
      message: 'School approved successfully',
      data: school,
    });
  } catch (error) {
    console.error('Approve School Error:', error);
    console.error('Error details:', error.message);
    if (error.errors) {
      console.error('Validation errors:', error.errors);
    }
    res.status(500).json({
      success: false,
      message: error.message || 'Server error approving school',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Reject school
 * @route   PUT /api/super-admin/schools/:id/reject
 * @access  Private (Super Admin)
 */
const rejectSchool = async (req, res) => {
  try {
    const { reason } = req.body;
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    school.approvalStatus = 'rejected';
    school.accountStatus = 'inactive';
    school.isActive = false;
    school.rejectionReason = reason || 'Not specified';

    await school.save({ validateModifiedOnly: true });

    res.status(200).json({
      success: true,
      message: 'School rejected',
      data: school,
    });
  } catch (error) {
    console.error('Reject School Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error rejecting school',
    });
  }
};

/**
 * @desc    Get pending schools (awaiting approval)
 * @route   GET /api/super-admin/schools/pending
 * @access  Private (Super Admin)
 */
const getPendingSchools = async (req, res) => {
  try {
    // Only show PAID plans in pending approval (trial plans auto-approve)
    const pendingSchools = await School.find({
      approvalStatus: 'pending',
      planType: 'paid' // Only paid plans need approval
    })
      .select('schoolName email phone address selectedPlan planType planPrice accountStatus createdAt')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: pendingSchools.length,
      data: pendingSchools,
    });
  } catch (error) {
    console.error('Get Pending Schools Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching pending schools',
    });
  }
};

/**
 * @desc    Suspend school
 * @route   PUT /api/super-admin/schools/:id/suspend
 * @access  Private (Super Admin)
 */
const suspendSchool = async (req, res) => {
  try {
    const { reason } = req.body;
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    // Suspend the school - immediate access block
    school.accountStatus = 'suspended';
    school.isActive = false;
    school.suspensionReason = reason || 'Suspended by Super Admin';
    school.suspendedAt = new Date();

    await school.save({ validateModifiedOnly: true });

    res.status(200).json({
      success: true,
      message: 'School suspended successfully',
      data: school,
    });
  } catch (error) {
    console.error('Suspend School Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error suspending school',
    });
  }
};

/**
 * @desc    Reactivate suspended school
 * @route   PUT /api/super-admin/schools/:id/reactivate
 * @access  Private (Super Admin)
 */
const reactivateSchool = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    // Only reactivate if school was previously approved
    if (school.approvalStatus !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reactivate school that was not previously approved. Please approve first.',
      });
    }

    // Reactivate the school
    school.accountStatus = 'active';
    school.isActive = true;
    school.suspensionReason = undefined;
    school.suspendedAt = undefined;
    school.reactivatedAt = new Date();

    await school.save({ validateModifiedOnly: true });

    res.status(200).json({
      success: true,
      message: 'School reactivated successfully',
      data: school,
    });
  } catch (error) {
    console.error('Reactivate School Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error reactivating school',
    });
  }
};

/**
 * @desc    Get dashboard statistics with breakdowns
 * @route   GET /api/super-admin/dashboard-stats
 * @access  Private (Super Admin)
 */
const getDashboardStats = async (req, res) => {
  try {
    // Total counts
    const totalSchools = await School.countDocuments();
    const activeSchools = await School.countDocuments({
      accountStatus: 'active',
      approvalStatus: 'approved'
    });
    // Only count PAID plans as pending (trial plans auto-approve)
    const pendingSchools = await School.countDocuments({
      approvalStatus: 'pending',
      planType: 'paid'
    });
    const suspendedSchools = await School.countDocuments({ accountStatus: 'suspended' });
    const rejectedSchools = await School.countDocuments({ approvalStatus: 'rejected' });

    // Plan type breakdowns
    const trialSchools = await School.countDocuments({ planType: 'trial' });
    const paidSchools = await School.countDocuments({ planType: 'paid' });

    // Plan-specific counts
    const basicSchools = await School.countDocuments({ selectedPlan: 'BASIC' });
    const standardSchools = await School.countDocuments({ selectedPlan: 'STANDARD' });
    const premiumSchools = await School.countDocuments({ selectedPlan: 'PREMIUM' });

    // Recent registrations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSchools = await School.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Revenue calculation (for paid plans that are approved)
    const approvedPaidSchools = await School.find({
      planType: 'paid',
      approvalStatus: 'approved'
    }).select('planPrice');

    const totalRevenue = approvedPaidSchools.reduce((sum, school) => sum + (school.planPrice || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalSchools,
          activeSchools,
          pendingSchools,
          suspendedSchools,
          rejectedSchools,
          recentSchools,
        },
        planTypes: {
          trial: trialSchools,
          paid: paidSchools,
        },
        planBreakdown: {
          basic: basicSchools,
          standard: standardSchools,
          premium: premiumSchools,
        },
        revenue: {
          total: totalRevenue,
          currency: 'PKR',
        },
      },
    });
  } catch (error) {
    console.error('Get Dashboard Stats Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching dashboard statistics',
    });
  }
};

/**
 * @desc    Get all school admins
 * @route   GET /api/super-admin/admins
 * @access  Private (Super Admin)
 */
const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find()
      .select('name email phone schoolId isActive createdAt')
      .populate('schoolId', 'schoolName city state')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins,
    });
  } catch (error) {
    console.error('Get All Admins Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching admins',
    });
  }
};

/**
 * @desc    Extend school subscription
 * @route   PUT /api/super-admin/schools/:id/extend-subscription
 * @access  Private (Super Admin)
 */
const extendSubscription = async (req, res) => {
  try {
    const { days } = req.body;
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    if (!days || days <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid number of days to extend',
      });
    }

    // Extend trial or subscription based on plan type
    if (school.planType === 'trial') {
      const currentEndDate = school.trial?.endDate ? new Date(school.trial.endDate) : new Date();
      const newEndDate = new Date(currentEndDate.getTime() + days * 24 * 60 * 60 * 1000);

      school.trial = {
        ...school.trial,
        isActive: true,
        endDate: newEndDate,
      };
    } else if (school.planType === 'paid') {
      const currentEndDate = school.subscription?.endDate ? new Date(school.subscription.endDate) : new Date();
      const newEndDate = new Date(currentEndDate.getTime() + days * 24 * 60 * 60 * 1000);

      school.subscription = {
        ...school.subscription,
        status: 'active',
        endDate: newEndDate,
      };
    }

    await school.save({ validateModifiedOnly: true });

    res.status(200).json({
      success: true,
      message: `Subscription extended by ${days} days successfully`,
      data: school,
    });
  } catch (error) {
    console.error('Extend Subscription Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error extending subscription',
    });
  }
};

/**
 * @desc    Update school plan
 * @route   PUT /api/super-admin/schools/:id/update-plan
 * @access  Private (Super Admin)
 */
const updateSchoolPlan = async (req, res) => {
  try {
    const { selectedPlan, billingCycle = 'monthly' } = req.body;
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    // Update the selected plan and billing cycle
    school.selectedPlan = selectedPlan;
    school.billingCycle = billingCycle.toUpperCase();

    // Set plan start date to now
    const startDate = new Date();
    let endDate = new Date();
    let planPrice = 0;
    let planDuration = '';
    let studentLimit = 100;

    // Calculate pricing, duration, and student limit based on plan and cycle
    if (selectedPlan === 'FREE_TRIAL') {
      school.planType = 'trial';
      planPrice = 0;
      planDuration = '14 days';
      studentLimit = 100;
      // Trial: 14 days from now
      endDate.setDate(endDate.getDate() + 14);
    } else if (selectedPlan === 'BASIC') {
      school.planType = 'paid';
      studentLimit = 300;

      if (billingCycle === 'yearly') {
        planPrice = 29999;
        planDuration = '1 year';
        // 365 days from now
        endDate.setDate(endDate.getDate() + 365);
      } else {
        planPrice = 2999;
        planDuration = '1 month';
        // 30 days from now
        endDate.setDate(endDate.getDate() + 30);
      }
    } else if (selectedPlan === 'STANDARD') {
      school.planType = 'paid';
      studentLimit = 600;

      if (billingCycle === 'yearly') {
        planPrice = 49999;
        planDuration = '1 year';
        endDate.setDate(endDate.getDate() + 365);
      } else {
        planPrice = 4999;
        planDuration = '1 month';
        endDate.setDate(endDate.getDate() + 30);
      }
    } else if (selectedPlan === 'PREMIUM') {
      school.planType = 'paid';
      studentLimit = -1; // Unlimited

      if (billingCycle === 'yearly') {
        planPrice = 69999;
        planDuration = '1 year';
        endDate.setDate(endDate.getDate() + 365);
      } else {
        planPrice = 7999;
        planDuration = '1 month';
        endDate.setDate(endDate.getDate() + 30);
      }
    }

    // Set plan details
    school.planPrice = planPrice;
    school.planDuration = planDuration;
    school.studentLimit = studentLimit;
    school.planStartDate = startDate;
    school.planEndDate = endDate;

    // Reset plan expiry flags
    school.isPlanExpired = false;
    school.paymentStatus = 'paid';
    school.accountStatus = 'active';
    school.isActive = true;

    // Update trial dates if trial plan
    if (school.planType === 'trial') {
      school.trial = {
        isActive: true,
        startDate: startDate,
        endDate: endDate
      };
    } else {
      // Update subscription dates if paid plan
      school.subscription = {
        plan: billingCycle === 'yearly' ? 'yearly' : 'monthly',
        status: 'active',
        startDate: startDate,
        endDate: endDate
      };
    }

    await school.save({ validateModifiedOnly: true });

    console.log(`✓ Plan updated for ${school.schoolName}:`);
    console.log(`  Plan: ${selectedPlan}`);
    console.log(`  Start Date: ${startDate.toLocaleDateString()}`);
    console.log(`  End Date: ${endDate.toLocaleDateString()}`);

    res.status(200).json({
      success: true,
      message: 'School plan updated successfully',
      data: school,
    });
  } catch (error) {
    console.error('Update School Plan Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating school plan',
    });
  }
};

/**
 * @desc    Update school billing cycle
 * @route   PUT /api/super-admin/schools/:id/update-billing-cycle
 * @access  Private (Super Admin)
 */
const updateBillingCycle = async (req, res) => {
  try {
    const { billingCycle } = req.body;
    const school = await School.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    // Validate billing cycle
    if (!['MONTHLY', 'YEARLY'].includes(billingCycle)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid billing cycle. Must be MONTHLY or YEARLY',
      });
    }

    const oldBillingCycle = school.billingCycle;
    const isYearly = billingCycle === 'YEARLY';

    // Update billing cycle
    school.billingCycle = billingCycle;

    // Update plan price and duration based on current plan and new billing cycle
    const planPricing = {
      'BASIC': { monthly: 2999, yearly: 29999 },
      'STANDARD': { monthly: 4999, yearly: 49999 },
      'PREMIUM': { monthly: 7999, yearly: 69999 }
    };

    if (school.selectedPlan !== 'FREE_TRIAL' && planPricing[school.selectedPlan]) {
      school.planPrice = isYearly ? planPricing[school.selectedPlan].yearly : planPricing[school.selectedPlan].monthly;
      school.planDuration = isYearly ? '1 year' : '1 month';

      // Update subscription dates and plan
      if (school.subscription) {
        const startDate = new Date();
        const endDate = new Date();

        if (isYearly) {
          endDate.setFullYear(endDate.getFullYear() + 1);
        } else {
          endDate.setMonth(endDate.getMonth() + 1);
        }

        school.subscription.plan = isYearly ? 'yearly' : 'monthly';
        school.subscription.startDate = startDate;
        school.subscription.endDate = endDate;
        school.planStartDate = startDate;
        school.planEndDate = endDate;
      }
    }

    await school.save({ validateModifiedOnly: true });

    console.log(`✓ Billing cycle updated for ${school.schoolName}:`);
    console.log(`  Old Cycle: ${oldBillingCycle}`);
    console.log(`  New Cycle: ${billingCycle}`);
    console.log(`  New Price: PKR ${school.planPrice}`);
    console.log(`  New Duration: ${school.planDuration}`);

    res.status(200).json({
      success: true,
      message: 'Billing cycle updated successfully',
      data: school,
    });
  } catch (error) {
    console.error('Update Billing Cycle Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating billing cycle',
    });
  }
};

/**
 * @desc    Send notice to school admin portal
 * @route   POST /api/super-admin/notices
 * @access  Private (Super Admin)
 */
const sendNoticeToSchool = async (req, res) => {
  try {
    const { title, content, targetAll, schoolIds } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }
    if (!targetAll && (!schoolIds || !schoolIds.length)) {
      return res.status(400).json({ success: false, message: 'Select at least one school or target all' });
    }

    // Determine target schools
    let schools;
    if (targetAll) {
      schools = await School.find({ approvalStatus: 'approved' }).select('_id schoolName');
    } else {
      schools = await School.find({ _id: { $in: schoolIds }, approvalStatus: 'approved' }).select('_id schoolName');
    }

    if (!schools.length) {
      return res.status(404).json({ success: false, message: 'No valid schools found' });
    }

    // Save to main DB as a record
    const superAdminNotice = await SuperAdminNotice.create({
      title,
      content,
      targetAll: !!targetAll,
      targetSchools: schools.map(s => s._id),
    });

    // Push to each school's tenant DB
    await Promise.all(schools.map(async (school) => {
      try {
        const Notice = await getModel(school._id.toString(), 'notices');
        await Notice.create({ title, content, isSuperAdminNotice: true, targetAudience: 'all', isActive: true, priority: 'high' });
      } catch (err) {
        console.error(`Failed to push notice to school ${school._id}:`, err.message);
      }
    }));

    res.status(201).json({ success: true, message: `Notice sent to ${schools.length} school(s)`, data: superAdminNotice });
  } catch (error) {
    console.error('Send Notice Error:', error);
    res.status(500).json({ success: false, message: 'Server error sending notice' });
  }
};

const getSuperAdminNotices = async (req, res) => {
  try {
    const notices = await SuperAdminNotice.find()
      .sort({ createdAt: -1 })
      .populate('targetSchools', 'schoolName');
    res.json({ success: true, data: notices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteSuperAdminNotice = async (req, res) => {
  try {
    const notice = await SuperAdminNotice.findByIdAndDelete(req.params.id);
    if (!notice) return res.status(404).json({ success: false, message: 'Notice not found' });

    // Determine which schools to clean up
    let schools;
    if (notice.targetAll) {
      schools = await School.find({ approvalStatus: 'approved' }).select('_id');
    } else {
      schools = notice.targetSchools.map(id => ({ _id: id }));
    }

    // Delete from each school's tenant DB
    await Promise.all(schools.map(async (school) => {
      try {
        const Notice = await getModel(school._id.toString(), 'notices');
        await Notice.deleteMany({ title: notice.title, isSuperAdminNotice: true });
      } catch (err) {
        console.error(`Failed to delete notice from school ${school._id}:`, err.message);
      }
    }));

    res.json({ success: true, message: 'Notice deleted from all schools' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get schools with pending payments
 * @route   GET /api/super-admin/pending-payments
 * @access  Private (Super Admin only)
 */
const getPendingPayments = async (req, res) => {
  try {
    const now = new Date();

    // Find schools where plan has expired or payment is pending
    const schools = await School.find({
      $or: [
        { paymentStatus: { $in: ['pending', 'overdue'] } },
        { isPlanExpired: true },
        { 'trial.endDate': { $lt: now }, planType: 'trial' },
        { planEndDate: { $lt: now }, planType: 'paid' }
      ],
      approvalStatus: 'approved' // Only approved schools
    })
      .select('schoolName email phone city state selectedPlan planType planPrice planDuration planEndDate trial paymentStatus lastPaymentDate isPlanExpired')
      .sort({ planEndDate: 1, 'trial.endDate': 1 }); // Oldest expiry first

    // Calculate additional info for each school
    const schoolsWithDetails = schools.map(school => {
      const schoolObj = school.toObject();
      const endDate = school.planType === 'trial' ? school.trial?.endDate : school.planEndDate;
      const daysOverdue = endDate ? Math.floor((now - new Date(endDate)) / (24 * 60 * 60 * 1000)) : 0;

      return {
        ...schoolObj,
        daysOverdue,
        amountDue: school.planPrice || 0,
        status: daysOverdue > 7 ? 'blocked' : daysOverdue > 0 ? 'grace_period' : 'expiring_soon'
      };
    });

    res.status(200).json({
      success: true,
      count: schoolsWithDetails.length,
      data: schoolsWithDetails,
    });
  } catch (error) {
    console.error('Get Pending Payments Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching pending payments',
    });
  }
};

/**
 * @desc    Mark school as paid and renew plan
 * @route   POST /api/super-admin/mark-paid/:schoolId
 * @access  Private (Super Admin only)
 */
const markSchoolAsPaid = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { amount, paymentMethod, transactionId, planDuration, notes } = req.body;

    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    // Calculate new plan dates
    const startDate = new Date();
    let endDate = new Date();

    switch (planDuration || school.planDuration) {
      case '1 month':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case '3 months':
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      case '6 months':
        endDate.setMonth(endDate.getMonth() + 6);
        break;
      case '1 year':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
      case '5 years':
        endDate.setFullYear(endDate.getFullYear() + 5);
        break;
      default:
        endDate.setMonth(endDate.getMonth() + 1); // Default 1 month
    }

    // Update school - Activate and approve
    school.paymentStatus = 'paid';
    school.lastPaymentDate = new Date();
    school.nextPaymentDue = endDate;
    school.planStartDate = startDate;
    school.planEndDate = endDate;
    school.isPlanExpired = false;
    school.planType = 'paid';
    school.accountStatus = 'active';
    school.approvalStatus = 'approved'; // Move from pending to approved
    school.isActive = true;

    // Reset trial if converting from trial
    if (school.trial) {
      school.trial.isActive = false;
    }

    // Update subscription
    school.subscription.status = 'active';
    school.subscription.startDate = startDate;
    school.subscription.endDate = endDate;

    // Add to payment history
    school.paymentHistory.push({
      amount: amount || school.planPrice,
      paymentDate: new Date(),
      paymentMethod: paymentMethod || 'manual',
      transactionId: transactionId || `TXN-${Date.now()}`,
      planType: school.selectedPlan,
      planDuration: planDuration || school.planDuration,
      paidBy: req.superAdmin?.name || 'Super Admin',
      notes: notes || 'Payment marked by super admin'
    });

    await school.save();

    res.status(200).json({
      success: true,
      message: 'School marked as paid and plan renewed successfully',
      data: {
        schoolName: school.schoolName,
        planStartDate: startDate,
        planEndDate: endDate,
        paymentStatus: school.paymentStatus,
        nextPaymentDue: endDate
      },
    });
  } catch (error) {
    console.error('Mark School as Paid Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error marking school as paid',
    });
  }
};

/**
 * @desc    Get payment history for a school
 * @route   GET /api/super-admin/payment-history/:schoolId
 * @access  Private (Super Admin only)
 */
const getPaymentHistory = async (req, res) => {
  try {
    const { schoolId } = req.params;

    const school = await School.findById(schoolId)
      .select('schoolName paymentHistory paymentStatus lastPaymentDate nextPaymentDue planEndDate');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        schoolName: school.schoolName,
        paymentStatus: school.paymentStatus,
        lastPaymentDate: school.lastPaymentDate,
        nextPaymentDue: school.nextPaymentDue,
        planEndDate: school.planEndDate,
        history: school.paymentHistory || []
      },
    });
  } catch (error) {
    console.error('Get Payment History Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching payment history',
    });
  }
};

/**
 * @desc    Delete school permanently (use with caution)
 * @route   DELETE /api/super-admin/schools/:schoolId
 * @access  Private (Super Admin only)
 */
const deleteSchool = async (req, res) => {
  try {
    const { schoolId } = req.params;

    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found',
      });
    }

    const schoolName = school.schoolName;
    const schoolEmail = school.email;

    // Step 1: Drop the tenant database completely
    try {
      const { getTenantConnection, getSchoolDBName, closeTenantConnection } = await import('../config/tenantDB.js');

      // Get the database name for this school
      const dbName = await getSchoolDBName(school.schoolName, schoolId);

      // Get connection to the tenant database
      const tenantConnection = await getTenantConnection(schoolId, school.schoolName);

      // Drop the entire database
      await tenantConnection.dropDatabase();
      console.log(`✓ Dropped tenant database: ${dbName}`);

      // Close the connection
      await closeTenantConnection(schoolId);
      console.log(`✓ Closed connection for school: ${schoolId}`);
    } catch (dbError) {
      console.error('Error dropping tenant database:', dbError.message);
      // Continue with deletion even if database drop fails
    }

    // Step 2: Delete all admins associated with this school
    try {
      const deletedAdmins = await Admin.deleteMany({ schoolId: schoolId });
      console.log(`✓ Deleted ${deletedAdmins.deletedCount} admin(s) for school: ${schoolName}`);
    } catch (adminError) {
      console.error('Error deleting admins:', adminError.message);
      // Throw error to stop deletion process if admin deletion fails
      throw new Error(`Failed to delete admin users: ${adminError.message}`);
    }

    // Step 3: Delete from SchoolRegistry if exists
    try {
      const { default: SchoolRegistry } = await import('../models/SchoolRegistry.js');
      await SchoolRegistry.findOneAndDelete({ schoolId: schoolId });
      console.log(`✓ Deleted SchoolRegistry entry for school: ${schoolName}`);
    } catch (registryError) {
      console.error('Error deleting SchoolRegistry:', registryError.message);
      throw new Error(`Failed to delete SchoolRegistry: ${registryError.message}`);
    }

    // Step 4: Delete from School model
    const deletedSchool = await School.findByIdAndDelete(schoolId);
    if (!deletedSchool) {
      throw new Error('Failed to delete School document from database');
    }
    console.log(`✓ Deleted School document: ${schoolName} (ID: ${schoolId})`);

    res.status(200).json({
      success: true,
      message: 'School and all associated data deleted permanently',
      data: {
        schoolName: schoolName,
        email: schoolEmail,
        deletedItems: {
          schoolDocument: true,
          tenantDatabase: true,
          schoolRegistry: true,
          admins: true
        }
      }
    });
  } catch (error) {
    console.error('Delete School Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting school',
      error: error.message
    });
  }
};

/**
 * @desc    Toggle FBR POS Integration for a school
 * @route   PUT /api/super-admin/schools/:id/fbr-toggle
 * @access  Private (Super Admin)
 */
const toggleFBRIntegration = async (req, res) => {
  try {
    const { id } = req.params;
    const { fbrEnabled } = req.body;

    // Validate input
    if (typeof fbrEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'fbrEnabled must be a boolean value'
      });
    }

    // Find school
    const school = await School.findById(id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Update FBR status
    school.fbrEnabled = fbrEnabled;
    await school.save();

    console.log(`FBR Integration ${fbrEnabled ? 'enabled' : 'disabled'} for school: ${school.schoolName}`);

    res.status(200).json({
      success: true,
      message: `FBR POS Integration ${fbrEnabled ? 'enabled' : 'disabled'} successfully`,
      data: {
        schoolId: school._id,
        schoolName: school.schoolName,
        fbrEnabled: school.fbrEnabled
      }
    });
  } catch (error) {
    console.error('Toggle FBR Integration Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error toggling FBR integration',
      error: error.message
    });
  }
};

export {
  loginSuperAdmin,
  getSuperAdminProfile,
  updatePassword,
  getAllSchools,
  getSchoolById,
  getPlatformStats,
  checkSuperAdminExists,
  approveSchool,
  rejectSchool,
  suspendSchool,
  reactivateSchool,
  getDashboardStats,
  extendSubscription,
  getAllAdmins,
  updateSchoolPlan,
  updateBillingCycle,
  sendNoticeToSchool,
  getSuperAdminNotices,
  deleteSuperAdminNotice,
  getPendingPayments,
  markSchoolAsPaid,
  getPaymentHistory,
  deleteSchool,
  toggleFBRIntegration,
};
