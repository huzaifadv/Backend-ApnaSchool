/**
 * SchoolRegistry Controller
 * Handles all SchoolRegistry operations for Super Admin
 */

import SchoolRegistry from '../models/SchoolRegistry.js';
import School from '../models/School.js';

/**
 * @desc    Get all schools in registry
 * @route   GET /api/super-admin/registry/schools
 * @access  Super Admin
 */
export const getAllSchoolsInRegistry = async (req, res) => {
  try {
    const {
      approvalStatus,
      accountStatus,
      planType,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 50
    } = req.query;

    // Build filter query
    const filter = {};

    if (approvalStatus) filter.approvalStatus = approvalStatus;
    if (accountStatus) filter.accountStatus = accountStatus;
    if (planType) filter.planType = planType;

    if (search) {
      filter.$or = [
        { schoolName: { $regex: search, $options: 'i' } },
        { schoolEmail: { $regex: search, $options: 'i' } },
        { primaryContactName: { $regex: search, $options: 'i' } },
      ];
    }

    // Pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [schools, total] = await Promise.all([
      SchoolRegistry.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      SchoolRegistry.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: {
        schools,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Get all schools in registry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch schools',
      error: error.message,
    });
  }
};

/**
 * @desc    Get single school from registry
 * @route   GET /api/super-admin/registry/schools/:id
 * @access  Super Admin
 */
export const getSchoolFromRegistry = async (req, res) => {
  try {
    const school = await SchoolRegistry.findById(req.params.id).populate('schoolId');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found in registry',
      });
    }

    res.status(200).json({
      success: true,
      data: school,
    });
  } catch (error) {
    console.error('Get school from registry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch school',
      error: error.message,
    });
  }
};

/**
 * @desc    Get platform statistics
 * @route   GET /api/super-admin/registry/stats
 * @access  Super Admin
 */
export const getPlatformStatistics = async (req, res) => {
  try {
    const stats = await SchoolRegistry.getPlatformStats();

    // Get additional stats
    const suspendedSchools = await SchoolRegistry.countDocuments({ accountStatus: 'suspended' });
    const expiredTrials = await SchoolRegistry.countDocuments({
      planType: 'trial',
      trialActive: true,
      planEndDate: { $lt: new Date() },
    });

    // Recent registrations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentRegistrations = await SchoolRegistry.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    });

    // Revenue potential (paid schools)
    const revenueStats = await SchoolRegistry.aggregate([
      { $match: { planType: 'paid' } },
      {
        $group: {
          _id: '$selectedPlan',
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        suspendedSchools,
        expiredTrials,
        recentRegistrations,
        revenueStats,
      },
    });
  } catch (error) {
    console.error('Get platform statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message,
    });
  }
};

/**
 * @desc    Approve school
 * @route   PUT /api/super-admin/registry/schools/:id/approve
 * @access  Super Admin
 */
export const approveSchool = async (req, res) => {
  try {
    const school = await SchoolRegistry.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found in registry',
      });
    }

    await school.approve();

    // Also update the School model
    await School.findByIdAndUpdate(school.schoolId, {
      isActive: true,
      approvalStatus: 'approved',
    });

    res.status(200).json({
      success: true,
      message: 'School approved successfully',
      data: school,
    });
  } catch (error) {
    console.error('Approve school error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve school',
      error: error.message,
    });
  }
};

/**
 * @desc    Reject school
 * @route   PUT /api/super-admin/registry/schools/:id/reject
 * @access  Super Admin
 */
export const rejectSchool = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
      });
    }

    const school = await SchoolRegistry.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found in registry',
      });
    }

    await school.reject(reason);

    // Also update the School model
    await School.findByIdAndUpdate(school.schoolId, {
      isActive: false,
      approvalStatus: 'rejected',
    });

    res.status(200).json({
      success: true,
      message: 'School rejected successfully',
      data: school,
    });
  } catch (error) {
    console.error('Reject school error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject school',
      error: error.message,
    });
  }
};

/**
 * @desc    Suspend school
 * @route   PUT /api/super-admin/registry/schools/:id/suspend
 * @access  Super Admin
 */
export const suspendSchool = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Suspension reason is required',
      });
    }

    const school = await SchoolRegistry.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found in registry',
      });
    }

    await school.suspend(reason);

    // Also update the School model
    await School.findByIdAndUpdate(school.schoolId, {
      isActive: false,
    });

    res.status(200).json({
      success: true,
      message: 'School suspended successfully',
      data: school,
    });
  } catch (error) {
    console.error('Suspend school error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend school',
      error: error.message,
    });
  }
};

/**
 * @desc    Activate school (unsuspend)
 * @route   PUT /api/super-admin/registry/schools/:id/activate
 * @access  Super Admin
 */
export const activateSchool = async (req, res) => {
  try {
    const school = await SchoolRegistry.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found in registry',
      });
    }

    await school.activate();

    // Also update the School model
    await School.findByIdAndUpdate(school.schoolId, {
      isActive: true,
    });

    res.status(200).json({
      success: true,
      message: 'School activated successfully',
      data: school,
    });
  } catch (error) {
    console.error('Activate school error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to activate school',
      error: error.message,
    });
  }
};

/**
 * @desc    Upgrade school to paid plan
 * @route   PUT /api/super-admin/registry/schools/:id/upgrade
 * @access  Super Admin
 */
export const upgradeSchoolPlan = async (req, res) => {
  try {
    const { plan, duration = 30 } = req.body;

    if (!plan || !['BASIC', 'PREMIUM', 'ENTERPRISE'].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Valid plan is required (BASIC, PREMIUM, or ENTERPRISE)',
      });
    }

    const school = await SchoolRegistry.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found in registry',
      });
    }

    await school.upgradeToPaid(plan, duration);

    res.status(200).json({
      success: true,
      message: 'School upgraded to paid plan successfully',
      data: school,
    });
  } catch (error) {
    console.error('Upgrade school plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upgrade school plan',
      error: error.message,
    });
  }
};

/**
 * @desc    Extend school trial
 * @route   PUT /api/super-admin/registry/schools/:id/extend-trial
 * @access  Super Admin
 */
export const extendSchoolTrial = async (req, res) => {
  try {
    const { days = 30 } = req.body;

    const school = await SchoolRegistry.findById(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found in registry',
      });
    }

    await school.extendTrial(days);

    res.status(200).json({
      success: true,
      message: `School trial extended by ${days} days`,
      data: school,
    });
  } catch (error) {
    console.error('Extend school trial error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to extend school trial',
      error: error.message,
    });
  }
};

/**
 * @desc    Update school registry details
 * @route   PUT /api/super-admin/registry/schools/:id
 * @access  Super Admin
 */
export const updateSchoolRegistry = async (req, res) => {
  try {
    const allowedUpdates = [
      'schoolName',
      'schoolEmail',
      'schoolPhone',
      'schoolAddress',
      'selectedPlan',
      'primaryContactName',
      'primaryContactEmail',
      'primaryContactPhone',
      'notes',
      'storageLimit',
    ];

    const updates = {};
    Object.keys(req.body).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    const school = await SchoolRegistry.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found in registry',
      });
    }

    res.status(200).json({
      success: true,
      message: 'School registry updated successfully',
      data: school,
    });
  } catch (error) {
    console.error('Update school registry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update school registry',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete school from registry (PERMANENT)
 * @route   DELETE /api/super-admin/registry/schools/:id
 * @access  Super Admin
 */
export const deleteSchoolFromRegistry = async (req, res) => {
  try {
    const school = await SchoolRegistry.findByIdAndDelete(req.params.id);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found in registry',
      });
    }

    // Optionally also delete the School document
    // await School.findByIdAndDelete(school.schoolId);

    res.status(200).json({
      success: true,
      message: 'School deleted from registry successfully',
      data: school,
    });
  } catch (error) {
    console.error('Delete school from registry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete school from registry',
      error: error.message,
    });
  }
};

/**
 * @desc    Get pending approvals
 * @route   GET /api/super-admin/registry/pending
 * @access  Super Admin
 */
export const getPendingApprovals = async (req, res) => {
  try {
    const pendingSchools = await SchoolRegistry.getByApprovalStatus('pending');

    res.status(200).json({
      success: true,
      data: pendingSchools,
      count: pendingSchools.length,
    });
  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending approvals',
      error: error.message,
    });
  }
};

/**
 * @desc    Get expired trials
 * @route   GET /api/super-admin/registry/expired-trials
 * @access  Super Admin
 */
export const getExpiredTrials = async (req, res) => {
  try {
    const expiredTrials = await SchoolRegistry.getExpiredTrials();

    res.status(200).json({
      success: true,
      data: expiredTrials,
      count: expiredTrials.length,
    });
  } catch (error) {
    console.error('Get expired trials error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expired trials',
      error: error.message,
    });
  }
};

/**
 * @desc    Sync school registry with School collection
 * @route   POST /api/super-admin/registry/sync
 * @access  Super Admin
 */
export const syncSchoolRegistry = async (req, res) => {
  try {
    const schools = await School.find();
    let synced = 0;
    let created = 0;
    let errors = 0;

    for (const school of schools) {
      try {
        const existingEntry = await SchoolRegistry.findOne({ schoolId: school._id });

        if (existingEntry) {
          // Update existing entry
          await SchoolRegistry.findByIdAndUpdate(existingEntry._id, {
            schoolName: school.name,
            schoolEmail: school.email,
            schoolPhone: school.phone,
            schoolAddress: school.address,
          });
          synced++;
        } else {
          // Create new entry
          await SchoolRegistry.create({
            schoolId: school._id,
            schoolName: school.name,
            schoolEmail: school.email,
            schoolPhone: school.phone,
            schoolAddress: school.address,
            approvalStatus: school.isActive ? 'approved' : 'pending',
            accountStatus: school.isActive ? 'active' : 'deactivated',
          });
          created++;
        }
      } catch (err) {
        console.error(`Error syncing school ${school._id}:`, err.message);
        errors++;
      }
    }

    res.status(200).json({
      success: true,
      message: 'School registry synchronized successfully',
      data: {
        total: schools.length,
        synced,
        created,
        errors,
      },
    });
  } catch (error) {
    console.error('Sync school registry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync school registry',
      error: error.message,
    });
  }
};
