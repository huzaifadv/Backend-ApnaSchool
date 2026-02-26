import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import School from '../models/School.js';
import Admin from '../models/Admin.js';
import SchoolRegistry from '../models/SchoolRegistry.js';

// @desc    Register a new school
// @route   POST /api/schools
// @access  Public
export const registerSchool = async (req, res, next) => {
  try {
    console.log('=== Registration Request Received ===');
    console.log('Request Body:', req.body);

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation Errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      schoolName,
      address,
      city,
      state,
      phone,
      email,
      password,
      establishedYear,
      website,
      adminName,
      adminPhone,
      selectedPlan,
      billingCycle,
      planPrice,
      planDuration
    } = req.body;

    console.log('Extracted fields:', { schoolName, email, phone, selectedPlan, billingCycle, planPrice, planDuration });

    // Validate plan selection
    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: 'Plan selection is required'
      });
    }

    // Determine if billing is yearly
    const isYearly = billingCycle === 'YEARLY';

    // Plan pricing and duration mapping (updated for monthly/yearly)
    const planDetails = {
      'FREE_TRIAL': { price: 0, duration: '14 days', durationDays: 14 },
      'BASIC': {
        price: isYearly ? 29999 : 2999,
        duration: isYearly ? '1 year' : '1 month',
        durationDays: isYearly ? 365 : 30
      },
      'STANDARD': {
        price: isYearly ? 49999 : 4999,
        duration: isYearly ? '1 year' : '1 month',
        durationDays: isYearly ? 365 : 30
      },
      'PREMIUM': {
        price: isYearly ? 69999 : 7999,
        duration: isYearly ? '1 year' : '1 month',
        durationDays: isYearly ? 365 : 30
      }
    };

    const plan = planDetails[selectedPlan];
    if (!plan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected'
      });
    }

    // Check if school already exists
    const existingSchool = await School.findOne({ email });
    if (existingSchool) {
      console.log('School already exists with email:', email);
      return res.status(400).json({
        success: false,
        message: 'School with this email already exists'
      });
    }

    // Check if SchoolRegistry already exists with this email (in case deletion failed)
    const existingRegistry = await SchoolRegistry.findOne({ schoolEmail: email });
    if (existingRegistry) {
      console.log('SchoolRegistry already exists with email, cleaning up...');
      await SchoolRegistry.deleteOne({ schoolEmail: email });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    console.log('Creating school...');

    // Determine plan type and account status based on selected plan
    const isPaidPlan = selectedPlan !== 'FREE_TRIAL';
    const planType = isPaidPlan ? 'paid' : 'trial';

    // Trial plans: Auto-approve and AUTO-ACTIVATE immediately (no OTP required)
    // Paid plans: Require super admin approval before activation
    const accountStatus = isPaidPlan ? 'inactive' : 'active'; // Trial: active immediately, Paid: inactive until approved
    const approvalStatus = isPaidPlan ? 'pending' : 'approved'; // Trial: approved immediately, Paid: pending until approved
    const isActive = !isPaidPlan; // Trial: true immediately, Paid: false until approved

    // Use values from request if provided, otherwise fall back to plan defaults
    const finalPlanPrice = planPrice !== undefined ? planPrice : plan.price;
    const finalPlanDuration = planDuration || plan.duration;

    // Create school
    const school = await School.create({
      schoolName,
      address,
      city,
      state,
      phone,
      email,
      password: hashedPassword,
      establishedYear,
      website,
      selectedPlan,
      billingCycle: billingCycle || 'MONTHLY',
      planPrice: finalPlanPrice,
      planDuration: finalPlanDuration,
      planType,
      accountStatus,
      isActive, // Trial: true, Paid: false
      approvalStatus // Trial: approved, Paid: pending
    });
    console.log('School created successfully:', school._id);

    console.log('Creating admin user...');
    // Check if admin with this email already exists and delete it (in case previous deletion failed)
    const existingAdmin = await Admin.findOne({ email: email });
    if (existingAdmin) {
      console.log('Found existing admin with same email, deleting...');
      await Admin.deleteOne({ email: email });
      console.log('Existing admin deleted successfully');
    }

    // Create admin user for the school
    let admin;
    try {
      admin = await Admin.create({
        schoolId: school._id,
        name: adminName || 'School Admin',
        email: email,
        password: hashedPassword,
        phone: adminPhone || phone,
        role: 'super_admin'
      });
      console.log('Admin created successfully:', admin._id);
    } catch (adminError) {
      console.error('Failed to create admin user:', adminError);
      console.error('Admin error name:', adminError.name);
      console.error('Admin error code:', adminError.code);

      // If it's a duplicate key error, try to force delete and retry once
      if (adminError.code === 11000 || adminError.name === 'MongoServerError') {
        console.log('Duplicate key error detected. Attempting to force delete and retry...');
        try {
          // Force delete any admin with this email
          await Admin.deleteMany({ email: email });
          console.log('Force deleted all admins with email:', email);

          // Retry admin creation
          admin = await Admin.create({
            schoolId: school._id,
            name: adminName || 'School Admin',
            email: email,
            password: hashedPassword,
            phone: adminPhone || phone,
            role: 'super_admin'
          });
          console.log('Admin created successfully on retry:', admin._id);
        } catch (retryError) {
          console.error('Failed to create admin user on retry:', retryError);
          // Rollback: Delete the school that was just created
          await School.findByIdAndDelete(school._id);
          throw new Error('Failed to create admin user. Registration aborted.');
        }
      } else {
        // Rollback: Delete the school that was just created
        await School.findByIdAndDelete(school._id);
        throw new Error('Failed to create admin user. Registration aborted.');
      }
    }

    // Initialize trial/subscription dates for the school
    if (planType === 'trial') {
      school.trial = {
        isActive: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000)
      };
      await school.save();
      console.log('Trial dates initialized:', school.trial);
    }

    // Calculate plan dates
    const planStartDate = new Date();
    const planEndDate = new Date();
    planEndDate.setDate(planEndDate.getDate() + plan.durationDays);

    console.log('Creating SchoolRegistry entry...');
    // Create SchoolRegistry entry
    let registryEntry;
    try {
      registryEntry = await SchoolRegistry.create({
        schoolId: school._id,
        schoolName,
        schoolEmail: email,
        schoolPhone: phone,
        schoolAddress: `${address}, ${city}, ${state}`,

        // Plan details - map to registry format
        selectedPlan: selectedPlan === 'FREE_TRIAL' ? 'FREE' :
                      selectedPlan === 'BASIC' ? 'BASIC' :
                      selectedPlan === 'STANDARD' ? 'PREMIUM' :
                      selectedPlan === 'PREMIUM' ? 'ENTERPRISE' : 'FREE',
        planType: selectedPlan === 'FREE_TRIAL' ? 'trial' : 'paid',
        planStartDate,
        planEndDate,
        trialActive: selectedPlan === 'FREE_TRIAL',

        // Status - Trial: approved & active immediately, Paid: pending & inactive
        approvalStatus: approvalStatus,
        accountStatus: accountStatus,

        // Usage
        totalAdmins: 1,

        // Contact info
        primaryContactName: adminName || 'School Admin',
        primaryContactEmail: email,
      primaryContactPhone: adminPhone || phone,

      // Metadata
      registrationSource: 'web',
      notes: `Registered with ${selectedPlan} plan (PKR ${plan.price})`
      });
      console.log('SchoolRegistry entry created:', registryEntry._id);
    } catch (registryError) {
      console.error('Failed to create SchoolRegistry:', registryError);
      // Rollback: Delete school and admin
      await School.findByIdAndDelete(school._id);
      if (admin && admin._id) {
        await Admin.findByIdAndDelete(admin._id);
      }
      throw new Error('Failed to create school registry. Registration aborted.');
    }

    // Return school data without password
    const schoolData = {
      _id: school._id,
      schoolName: school.schoolName,
      address: school.address,
      city: school.city,
      state: school.state,
      phone: school.phone,
      email: school.email,
      establishedYear: school.establishedYear,
      website: school.website,
      selectedPlan: school.selectedPlan,
      planPrice: school.planPrice,
      planDuration: school.planDuration,
      planType: school.planType,
      isActive: school.isActive,
      approvalStatus: school.approvalStatus,
      accountStatus: school.accountStatus,
      createdAt: school.createdAt
    };

    console.log('Sending success response...');

    // Different message based on plan type
    const message = isPaidPlan
      ? 'School registered successfully. Your registration is pending approval. You can login after super admin approval.'
      : 'School registered successfully. Your 14-day trial is active. You can login now.';

    res.status(201).json({
      success: true,
      message,
      canLogin: !isPaidPlan, // Trial can login immediately, Paid cannot until approved
      data: schoolData,
      adminId: admin._id
    });

  } catch (error) {
    console.error('Registration Error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    next(error);
  }
};

// @desc    Admin login
// @route   POST /api/admin/login
// @access  Public
export const adminLogin = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Check if admin exists
    const admin = await Admin.findOne({ email }).populate('schoolId', 'schoolName isActive planType approvalStatus accountStatus selectedPlan suspensionReason suspendedAt');

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if admin is active
    if (!admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // CHECK SUSPENSION STATUS (applies to all plan types)
    if (admin.schoolId.accountStatus === 'suspended') {
      return res.status(403).json({
        success: false,
        accountSuspended: true,
        message: 'Your account has been suspended. Please contact support.',
        contactEmail: 'apnaschool.edu@gmail.com',
        suspensionReason: admin.schoolId.suspensionReason,
        suspendedAt: admin.schoolId.suspendedAt
      });
    }

    // PAID PLAN BLOCKING LOGIC
    // If school selected a paid plan (Monthly/Yearly/5-Year), block access until super admin approves
    if (admin.schoolId.planType === 'paid') {
      if (admin.schoolId.approvalStatus === 'pending') {
        return res.status(403).json({
          success: false,
          awaitingApproval: true,
          planType: 'paid',
          message: 'Pending invoice approval',
          contactEmail: 'apnaschool.edu@gmail.com',
          selectedPlan: admin.schoolId.selectedPlan,
          blockAllFeatures: true
        });
      }

      if (admin.schoolId.approvalStatus === 'rejected') {
        return res.status(403).json({
          success: false,
          accountRejected: true,
          planType: 'paid',
          message: 'Your account has been rejected. Please contact support.',
          contactEmail: 'apnaschool.edu@gmail.com'
        });
      }

      // If approved but account is still inactive
      if (admin.schoolId.accountStatus === 'inactive') {
        return res.status(403).json({
          success: false,
          accountInactive: true,
          planType: 'paid',
          message: 'Your account is inactive. Please contact support.',
          contactEmail: 'apnaschool.edu@gmail.com'
        });
      }
    }

    // Check if school is active (for approved accounts)
    if (!admin.schoolId.isActive) {
      return res.status(401).json({
        success: false,
        message: 'School account is inactive. Please contact support.',
        contactEmail: 'apnaschool.edu@gmail.com'
      });
    }

    // Check trial status and account status in SchoolRegistry
    const schoolRegistry = await SchoolRegistry.findOne({ schoolId: admin.schoolId._id });

    if (schoolRegistry) {
      // Check if awaiting approval (ONLY for paid plans, trial plans can access immediately)
      if (schoolRegistry.approvalStatus === 'pending' && schoolRegistry.planType === 'paid') {
        return res.status(403).json({
          success: false,
          awaitingApproval: true,
          message: 'Your account is awaiting approval. Please wait for administrator confirmation.'
        });
      }

      // Check if rejected
      if (schoolRegistry.approvalStatus === 'rejected') {
        return res.status(403).json({
          success: false,
          accountRejected: true,
          message: 'Your account has been rejected. Please contact support for more information.',
          rejectionReason: schoolRegistry.rejectionReason
        });
      }

      // Check if suspended
      if (schoolRegistry.accountStatus === 'suspended') {
        return res.status(403).json({
          success: false,
          accountSuspended: true,
          message: 'Your account has been suspended. Please contact support.'
        });
      }

      // Check trial expiration
      if (schoolRegistry.planType === 'trial') {
        const now = new Date();
        const trialEndDate = new Date(schoolRegistry.planEndDate);

        if (now > trialEndDate) {
          // Trial expired - update status and block login
          if (schoolRegistry.trialActive) {
            schoolRegistry.trialActive = false;
            schoolRegistry.accountStatus = 'inactive';
            await schoolRegistry.save();
          }

          return res.status(403).json({
            success: false,
            trialExpired: true,
            message: 'Your free trial has ended. Please subscribe to continue.',
            planEndDate: schoolRegistry.planEndDate,
            daysExpired: Math.ceil((now - trialEndDate) / (1000 * 60 * 60 * 24))
          });
        }

        // Trial active - calculate days remaining
        const daysRemaining = Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24));

        // Attach trial info to response
        var trialInfo = {
          isTrialActive: true,
          daysRemaining,
          planEndDate: schoolRegistry.planEndDate
        };
      }

      // Check if account is inactive (paid plan expired)
      if (schoolRegistry.planType === 'paid' && schoolRegistry.accountStatus === 'inactive') {
        const now = new Date();
        const planEndDate = new Date(schoolRegistry.planEndDate);

        if (now > planEndDate) {
          return res.status(403).json({
            success: false,
            subscriptionExpired: true,
            message: 'Your subscription has expired. Please renew to continue.',
            planEndDate: schoolRegistry.planEndDate
          });
        }
      }
    }

    // Generate JWT token (expires in 10 days)
    const token = jwt.sign(
      {
        id: admin._id,
        schoolId: admin.schoolId._id,
        role: admin.role,
        email: admin.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '10d' }
    );

    // Return success response
    const response = {
      success: true,
      message: 'Login successful',
      token,
      data: {
        adminId: admin._id,
        schoolId: admin.schoolId._id,
        schoolName: admin.schoolId.schoolName,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    };

    // Add trial info if exists
    if (trialInfo) {
      response.trialInfo = trialInfo;
    }

    res.status(200).json(response);

  } catch (error) {
    next(error);
  }
};

// @desc    Get school details
// @route   GET /api/admin/school
// @access  Private (Admin only)
export const getSchoolDetails = async (req, res, next) => {
  try {
    const school = await School.findById(req.schoolId).select('-password');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Format plan details based on selectedPlan and billingCycle
    const isYearly = school.billingCycle === 'YEARLY';

    const planDetailsMap = {
      'FREE_TRIAL': { name: '14 Days Free Trial', type: 'trial', price: 0, duration: '14 days' },
      'BASIC': {
        name: 'Basic Plan',
        type: 'paid',
        price: isYearly ? 29999 : 2999,
        duration: isYearly ? '1 year' : '1 month'
      },
      'STANDARD': {
        name: 'Standard Plan',
        type: 'paid',
        price: isYearly ? 49999 : 4999,
        duration: isYearly ? '1 year' : '1 month'
      },
      'PREMIUM': {
        name: 'Premium Plan',
        type: 'paid',
        price: isYearly ? 69999 : 7999,
        duration: isYearly ? '1 year' : '1 month'
      }
    };

    const planDetails = planDetailsMap[school.selectedPlan] || {
      name: school.selectedPlan,
      type: school.planType || 'unknown',
      price: school.planPrice || 0,
      duration: school.planDuration || 'N/A'
    };

    // Add account status to plan details
    planDetails.status = school.accountStatus || 'inactive';

    // Add plan start and end dates
    // Priority: planStartDate/planEndDate > trial > subscription > SchoolRegistry

    console.log('[getSchoolDetails] SchoolId:', req.schoolId);
    console.log('[getSchoolDetails] School Name:', school.schoolName);
    console.log('[getSchoolDetails] Plan Type:', school.planType);
    console.log('[getSchoolDetails] planStartDate:', school.planStartDate);
    console.log('[getSchoolDetails] planEndDate:', school.planEndDate);
    console.log('[getSchoolDetails] Trial exists:', !!school.trial);
    console.log('[getSchoolDetails] Subscription exists:', !!school.subscription);

    // Use planStartDate/planEndDate if available
    if (school.planStartDate || school.planEndDate) {
      planDetails.startDate = school.planStartDate;
      planDetails.endDate = school.planEndDate;
      console.log('[getSchoolDetails] ✓ Using planStartDate/planEndDate');
    }
    // Fallback to trial dates for trial plans
    else if (school.planType === 'trial' && school.trial) {
      planDetails.startDate = school.trial.startDate;
      planDetails.endDate = school.trial.endDate;
      console.log('[getSchoolDetails] ✓ Using trial dates');
    }
    // Fallback to subscription dates for paid plans
    else if (school.planType === 'paid' && school.subscription) {
      planDetails.startDate = school.subscription.startDate;
      planDetails.endDate = school.subscription.endDate;
      console.log('[getSchoolDetails] ✓ Using subscription dates');
    }
    // Last resort: try SchoolRegistry
    else {
      try {
        const { default: SchoolRegistry } = await import('../models/SchoolRegistry.js');
        const schoolRegistry = await SchoolRegistry.findOne({ schoolId: req.schoolId });

        if (schoolRegistry) {
          planDetails.startDate = schoolRegistry.planStartDate;
          planDetails.endDate = schoolRegistry.planEndDate;
          console.log('[getSchoolDetails] ✓ Using SchoolRegistry dates');
        }
      } catch (registryError) {
        console.error('[getSchoolDetails] SchoolRegistry error:', registryError);
      }
    }

    console.log('[getSchoolDetails] Final dates - Start:', planDetails.startDate, 'End:', planDetails.endDate);

    // Convert school to object and add planDetails
    const schoolData = school.toObject();
    schoolData.planDetails = planDetails;

    res.status(200).json({
      success: true,
      data: schoolData
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Update school details
// @route   PUT /api/admin/school
// @access  Private (Admin only)
export const updateSchoolDetails = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const school = await School.findById(req.schoolId);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // If updating password, hash it
    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      req.body.password = await bcrypt.hash(req.body.password, salt);
    }

    // Update school
    const updatedSchool = await School.findByIdAndUpdate(
      req.schoolId,
      req.body,
      {
        new: true,
        runValidators: true
      }
    ).select('-password');

    // Format plan details based on selectedPlan
    const planDetailsMap = {
      'FREE_TRIAL': { name: '14 Days Free Trial', type: 'trial', price: 0, duration: '14 days' },
      'BASIC': { name: 'Basic Plan', type: 'paid', price: 2999, duration: '1 month' },
      'STANDARD': { name: 'Standard Plan', type: 'paid', price: 4999, duration: '1 month' },
      'PREMIUM': { name: 'Premium Plan', type: 'paid', price: 8999, duration: '1 month' }
    };

    const planDetails = planDetailsMap[updatedSchool.selectedPlan] || {
      name: updatedSchool.selectedPlan,
      type: updatedSchool.planType || 'unknown',
      price: updatedSchool.planPrice || 0,
      duration: updatedSchool.planDuration ? `${updatedSchool.planDuration} days` : 'N/A'
    };

    // Add account status to plan details
    planDetails.status = updatedSchool.accountStatus || 'inactive';

    // Convert to object and add planDetails
    const schoolData = updatedSchool.toObject();
    schoolData.planDetails = planDetails;

    res.status(200).json({
      success: true,
      message: 'School details updated successfully',
      data: schoolData
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Request password reset code
// @route   POST /api/admin/forgot-password
// @access  Public
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    // Find admin by email
    const admin = await Admin.findOne({ email, isActive: true });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

    // Generate 6-digit verification code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash the reset code before saving
    const salt = await bcrypt.genSalt(10);
    const hashedCode = await bcrypt.hash(resetCode, salt);

    // Save reset code and expiry (15 minutes from now)
    admin.resetPasswordCode = hashedCode;
    admin.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await admin.save();

    // TODO: Send email with reset code
    // For now, we'll log it (in production, use nodemailer or similar)
    console.log('Password reset code for', email, ':', resetCode);
    console.log('Code expires at:', new Date(admin.resetPasswordExpires));

    // In development, return the code in response
    // In production, remove this and only send via email
    const responseData = {
      success: true,
      message: 'Verification code sent to your email'
    };

    // Only include code in development mode
    if (process.env.NODE_ENV === 'development') {
      responseData.code = resetCode; // For testing purposes only
    }

    res.status(200).json(responseData);

  } catch (error) {
    next(error);
  }
};

// @desc    Verify reset code
// @route   POST /api/admin/verify-reset-code
// @access  Public
export const verifyResetCode = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    // Find admin
    const admin = await Admin.findOne({
      email,
      isActive: true,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!admin) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Verify the code
    const isCodeValid = await bcrypt.compare(code, admin.resetPasswordCode);

    if (!isCodeValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Code verified successfully'
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Reset password (simplified - no verification code needed)
// @route   POST /api/admin/reset-password
// @access  Public
export const resetPassword = async (req, res, next) => {
  try {
    const { email, newPassword } = req.body;

    // Validate password length
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Find admin by email
    const admin = await Admin.findOne({ email, isActive: true });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear any reset fields
    admin.password = hashedPassword;
    admin.resetPasswordCode = undefined;
    admin.resetPasswordExpires = undefined;
    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Email verification is no longer required
// Users can now login immediately after registration (trial plans)
// or after super admin approval (paid plans)

// @desc    Get all schools (for parent portal)
// @route   GET /api/schools
// @access  Public
export const getAllSchools = async (req, res, next) => {
  try {
    // Fetch all active schools
    const schools = await School.find({ isActive: true })
      .select('schoolName address city state pincode email phone establishedYear website')
      .sort({ schoolName: 1 });

    // Map to return proper structure
    const schoolsData = schools.map(school => ({
      _id: school._id,
      schoolName: school.schoolName,
      address: {
        street: school.address,
        city: school.city,
        state: school.state,
        pincode: school.pincode
      },
      contactEmail: school.email,
      contactPhone: school.phone,
      establishedYear: school.establishedYear,
      website: school.website
    }));

    res.status(200).json({
      success: true,
      count: schoolsData.length,
      data: schoolsData
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get single school by ID (for parent portal)
// @route   GET /api/schools/:id
// @access  Public
export const getSchoolById = async (req, res, next) => {
  try {
    const school = await School.findOne({
      _id: req.params.id,
      isActive: true
    }).select('schoolName address city state pincode email phone establishedYear website');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Return proper structure
    const schoolData = {
      _id: school._id,
      schoolName: school.schoolName,
      address: {
        street: school.address,
        city: school.city,
        state: school.state,
        pincode: school.pincode
      },
      contactEmail: school.email,
      contactPhone: school.phone,
      establishedYear: school.establishedYear,
      website: school.website
    };

    res.status(200).json({
      success: true,
      data: schoolData
    });

  } catch (error) {
    next(error);
  }
};
