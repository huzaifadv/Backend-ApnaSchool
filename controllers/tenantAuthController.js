import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { initializeTenantDB } from '../config/tenantDB.js';
import { getModel } from '../models/dynamicModels.js';
import { sendPasswordResetEmail, sendVerificationEmail, sendSchoolRegistrationOTP } from '../utils/emailService.js';
import { generateOTP, hashOTP, verifyOTP, getOTPExpiry } from '../utils/otpHelper.js';

/**
 * Tenant-aware Authentication Controller
 * Handles school registration with automatic database creation
 */

/**
 * @desc    Register a new school (creates main school record + tenant database)
 * @route   POST /api/schools/register
 * @access  Public
 */
export const registerSchool = async (req, res, next) => {
  try {
    console.log('=== Multi-Tenant School Registration Started ===');
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
      pincode,
      phone,
      email,
      password,
      establishedYear,
      website,
      adminName,
      adminPhone,
      selectedPlan,
      planPrice,
      planDuration
    } = req.body;

    // Import School model from main database
    const { default: School } = await import('../models/School.js');

    // Check if school already exists
    const existingSchool = await School.findOne({ email });
    if (existingSchool) {
      console.log('School already exists with email:', email);
      return res.status(400).json({
        success: false,
        message: 'School with this email already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    console.log('Step 1: Creating school record in main database...');

    // Plan details mapping
    const planDetails = {
      'FREE_TRIAL': { price: 0, duration: '14 days' },
      'BASIC': { price: 2999, duration: '1 month' },
      'STANDARD': { price: 4999, duration: '1 month' },
      'PREMIUM': { price: 7999, duration: '1 month' }
    };

    // Use provided values or fallback to defaults
    const plan = planDetails[selectedPlan] || {};
    const finalPlanPrice = planPrice !== undefined ? planPrice : (plan.price || 0);
    const finalPlanDuration = planDuration || (plan.duration || '14 days');
    const finalSelectedPlan = selectedPlan || 'FREE_TRIAL';
    const planType = finalSelectedPlan === 'FREE_TRIAL' ? 'trial' : 'paid';

    // Both trial and paid plans: Require email verification first
    // After email verification:
    //   - Trial plans: Activate immediately
    //   - Paid plans: Require super admin approval before activation
    const isTrial = planType === 'trial';
    const approvalStatus = isTrial ? 'approved' : 'pending';
    const accountStatus = 'inactive'; // All accounts start inactive until email verified
    const isActive = false; // All accounts start inactive until email verified

    // Create school in main database
    const school = new School({
      schoolName,
      address,
      city,
      state,
      pincode: pincode || undefined, // Optional field
      phone,
      email,
      password: hashedPassword,
      establishedYear: establishedYear || undefined, // Optional
      website: website || undefined, // Optional
      selectedPlan: finalSelectedPlan,
      planPrice: finalPlanPrice,
      planDuration: finalPlanDuration,
      planType,
      accountStatus,
      approvalStatus,
      isActive
    });

    await school.save();
    console.log(`✓ School created with ID: ${school._id}`);

    // Initialize trial dates for FREE_TRIAL plans
    if (planType === 'trial') {
      const trialStartDate = new Date();
      const trialEndDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

      school.trial = {
        isActive: true,
        startDate: trialStartDate,
        endDate: trialEndDate
      };

      // Also set planStartDate and planEndDate for consistency
      school.planStartDate = trialStartDate;
      school.planEndDate = trialEndDate;

      await school.save();
      console.log(`✓ Trial period initialized (14 days)`);
      console.log(`✓ Plan Start: ${trialStartDate}`);
      console.log(`✓ Plan End: ${trialEndDate}`);
    }

    // Step 2: Initialize tenant database for this school
    console.log('Step 2: Initializing tenant database...');
    try {
      await initializeTenantDB(school._id, school.schoolName);
      const dbName = schoolName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').substring(0, 50);
      console.log(`✓ Tenant database initialized: ${dbName}_db`);
    } catch (dbError) {
      // Rollback: Delete school if tenant DB creation fails
      console.error('Failed to create tenant database:', dbError);
      await School.findByIdAndDelete(school._id);
      return res.status(500).json({
        success: false,
        message: 'Failed to initialize school database. Registration aborted.'
      });
    }

    // Step 3: Create admin user in tenant database
    console.log('Step 3: Creating admin user in tenant database...');
    try {
      console.log('Getting Admin model for school:', school._id);
      const Admin = await getModel(school._id, 'admins');
      console.log('✓ Admin model retrieved');

      const adminData = {
        name: adminName || 'School Admin',
        email: email,
        password: hashedPassword,
        phone: adminPhone || phone,
        role: 'super_admin',
        isActive: true
      };
      console.log('Creating admin with data:', { ...adminData, password: '[HIDDEN]' });

      const admin = await Admin.create(adminData);

      console.log(`✓ Admin created in tenant database with ID: ${admin._id}`);

      // Step 4: Generate and send email verification OTP
      console.log('Step 4: Generating email verification OTP...');
      const otp = generateOTP();
      const hashedOTP = hashOTP(otp);
      const otpExpiry = getOTPExpiry();

      console.log('🔍 OTP Generation Debug:');
      console.log('   Generated OTP:', otp);
      console.log('   OTP Type:', typeof otp);
      console.log('   Hashed OTP:', hashedOTP);
      console.log('   OTP Expiry:', otpExpiry);

      // Store OTP in School model
      school.emailVerificationOTP = hashedOTP;
      school.emailVerificationExpires = otpExpiry;
      await school.save();

      console.log('✓ OTP generated and saved to database');
      console.log('🔑 OTP (for debugging):', process.env.NODE_ENV === 'development' ? otp : '******');

      // Return success response immediately (DB operations complete)
      const dbName = schoolName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').substring(0, 50);
      const schoolData = {
        _id: school._id,
        schoolName: school.schoolName,
        address: school.address,
        city: school.city,
        state: school.state,
        pincode: school.pincode,
        phone: school.phone,
        email: school.email,
        establishedYear: school.establishedYear,
        website: school.website,
        databaseName: `${dbName}_db`,
        isActive: school.isActive,
        createdAt: school.createdAt
      };

      console.log('=== School Registration Successful ===');

      // Send response immediately
      res.status(201).json({
        success: true,
        message: 'School registered successfully! Please check your email for the verification code.',
        requiresEmailVerification: true,
        email: school.email,
        data: schoolData,
        adminId: admin._id,
        // Include OTP in development mode for testing
        ...(process.env.NODE_ENV === 'development' && { otp })
      });

      // Send verification email asynchronously (non-blocking)
      sendSchoolRegistrationOTP(email, otp, schoolName)
        .then((emailResult) => {
          if (emailResult.success) {
            console.log('✅ Registration OTP email sent successfully to:', email);
            console.log('📬 Message ID:', emailResult.messageId);
          } else {
            console.error('⚠️ Email sending failed:', emailResult.error);
            console.error('⚠️ User can still verify using OTP from database');
          }
        })
        .catch((emailError) => {
          console.error('❌ Email sending error:', emailError.message);
          console.error('⚠️ User can still verify using OTP from database');
        });

    } catch (adminError) {
      // Rollback: Delete school if admin creation fails
      console.error('❌ Failed to create admin user:', adminError);
      console.error('Error details:', {
        name: adminError.name,
        message: adminError.message,
        stack: adminError.stack
      });

      await School.findByIdAndDelete(school._id);

      return res.status(500).json({
        success: false,
        message: 'Failed to create admin user. Registration aborted.',
        error: process.env.NODE_ENV === 'development' ? adminError.message : undefined
      });
    }

  } catch (error) {
    console.error('Registration Error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    next(error);
  }
};

/**
 * @desc    Admin login (uses tenant database)
 * @route   POST /api/admin/login
 * @access  Public
 */
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

    // Step 1: Find school in main database
    // Note: We don't check isActive here because we want to allow login
    // even if email is not verified yet (email verification happens after login)
    const { default: School } = await import('../models/School.js');

    const school = await School.findOne({ email });

    if (!school) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Step 2: Get admin from tenant database
    const Admin = await getModel(school._id, 'admins');
    const admin = await Admin.findOne({ email });

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

    // Validate password first
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if email is verified
    if (!school.isEmailVerified) {
      console.log(`⚠️ Login attempt with unverified email: ${email}`);

      // Check if OTP exists, if not generate a new one
      if (!school.emailVerificationOTP || !school.emailVerificationExpires) {
        const otp = generateOTP();
        const hashedOTP = hashOTP(otp);
        const otpExpiry = getOTPExpiry();

        school.emailVerificationOTP = hashedOTP;
        school.emailVerificationExpires = otpExpiry;
        await school.save();

        console.log('🔑 New OTP generated for unverified user:', process.env.NODE_ENV === 'development' ? otp : '******');

        // Send OTP email asynchronously
        sendSchoolRegistrationOTP(email, otp, school.schoolName)
          .then(() => console.log('✅ OTP email sent to unverified user'))
          .catch((err) => console.error('❌ Failed to send OTP email:', err.message));
      }

      return res.status(403).json({
        success: false,
        emailNotVerified: true,
        message: 'Please verify your email address to continue. We have sent a verification code to your email.',
        email: school.email
      });
    }

    // Generate JWT token with schoolId (expires in 10 days)
    const token = jwt.sign(
      {
        id: admin._id,
        schoolId: school._id,
        role: admin.role,
        email: admin.email,
        type: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '10d' }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      data: {
        adminId: admin._id,
        schoolId: school._id,
        schoolName: school.schoolName,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
};

/**
 * @desc    Get school details
 * @route   GET /api/admin/school
 * @access  Private (Admin only)
 */
export const getSchoolDetails = async (req, res, next) => {
  try {
    const { default: School } = await import('../models/School.js');

    const school = await School.findById(req.schoolId).select('-password -emailVerificationOTP -resetPasswordOTP');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    const dbName = school.schoolName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').substring(0, 50);

    // Format the response with plan and subscription details
    const schoolData = school.toObject();

    // Format plan name for display
    const planNameMap = {
      '7_DAYS_FREE_TRIAL': '7 Days Free Trial',
      'MONTHLY': 'Monthly Plan',
      'YEARLY': 'Yearly Plan',
      'FIVE_YEAR': '5 Year Plan'
    };

    res.status(200).json({
      success: true,
      data: {
        ...schoolData,
        databaseName: `${dbName}_db`,
        planDetails: {
          name: planNameMap[schoolData.selectedPlan] || schoolData.selectedPlan,
          type: schoolData.planType,
          price: schoolData.planPrice,
          duration: schoolData.planDuration,
          status: schoolData.accountStatus
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update school details
 * @route   PUT /api/admin/school
 * @access  Private (Admin only)
 */
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

    const { default: School } = await import('../models/School.js');

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

    res.status(200).json({
      success: true,
      message: 'School details updated successfully',
      data: updatedSchool
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all schools (for parent portal)
 * @route   GET /api/schools
 * @access  Public
 */
export const getAllSchools = async (req, res, next) => {
  try {
    const { default: School } = await import('../models/School.js');

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

/**
 * @desc    Get single school by ID (for parent portal)
 * @route   GET /api/schools/:id
 * @access  Public
 */
export const getSchoolById = async (req, res, next) => {
  try {
    const { default: School } = await import('../models/School.js');

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

/**
 * @desc    Verify email with OTP (School Registration)
 * @route   POST /api/auth/verify-email
 * @access  Public
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    console.log('📧 Email Verification Request:');
    console.log('   Email:', email);
    console.log('   Email Type:', typeof email);
    console.log('   OTP:', otp);

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    // Find school by email
    const { default: School } = await import('../models/School.js');

    // Normalize email (trim and lowercase ONLY - preserve dots)
    const normalizedEmail = email.trim().toLowerCase();
    console.log('   Normalized Email:', normalizedEmail);

    const school = await School.findOne({ email: normalizedEmail });

    if (!school) {
      console.log('❌ School not found with email:', normalizedEmail);

      // Check if any schools exist
      const allSchools = await School.find({}).select('email');
      console.log('📋 All registered school emails:', allSchools.map(s => s.email));

      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    console.log('✅ School found:', school.schoolName);

    // Get admin from tenant database
    const Admin = await getModel(school._id, 'admins');
    const admin = await Admin.findOne({ email: normalizedEmail });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Check if already verified
    if (school.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Check if OTP exists
    if (!school.emailVerificationOTP || !school.emailVerificationExpires) {
      return res.status(400).json({
        success: false,
        message: 'No verification OTP found. Please request a new one.'
      });
    }

    // Check if OTP expired
    if (new Date() > school.emailVerificationExpires) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }

    // Verify OTP
    console.log('🔍 OTP Verification Debug:');
    console.log('   Received OTP:', otp);
    console.log('   OTP Type:', typeof otp);
    console.log('   Stored Hashed OTP:', school.emailVerificationOTP);
    console.log('   OTP Expires:', school.emailVerificationExpires);
    console.log('   Current Time:', new Date());

    const isOTPValid = verifyOTP(otp, school.emailVerificationOTP);
    console.log('   Is OTP Valid?', isOTPValid);

    if (!isOTPValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Mark email as verified and clear OTP
    school.isEmailVerified = true;
    school.emailVerificationOTP = undefined;
    school.emailVerificationExpires = undefined;

    // Activate the school ONLY for trial plans
    // Paid plans need super admin approval first
    if (school.planType === 'trial') {
      school.isActive = true;
      school.accountStatus = 'active';
      console.log(`✓ Trial school activated: ${school.schoolName}`);
    } else {
      console.log(`✓ Email verified. Waiting for admin approval (Paid plan): ${school.schoolName}`);
    }

    await school.save();

    // Return different messages for trial vs paid plans
    const message = school.planType === 'trial'
      ? 'Email verified successfully! Your 14-day trial is now active. Redirecting to login...'
      : 'Email verified successfully! Your account is awaiting admin approval for paid plan activation.';

    // Return success with redirect instruction
    res.status(200).json({
      success: true,
      message,
      redirectToLogin: true,
      planType: school.planType,
      isActive: school.isActive,
      canLogin: school.planType === 'trial',
      requiresApproval: school.planType === 'paid' && !school.isActive,
      data: {
        schoolId: school._id,
        schoolName: school.schoolName,
        email: school.email
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    next(error);
  }
};

/**
 * @desc    Resend email verification OTP
 * @route   POST /api/auth/resend-verification
 * @access  Public
 */
export const resendVerificationOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find school by email
    const { default: School } = await import('../models/School.js');

    // Normalize email (trim and lowercase ONLY - preserve dots)
    const normalizedEmail = email.trim().toLowerCase();
    const school = await School.findOne({ email: normalizedEmail });

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Check if already verified
    if (school.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const hashedOTP = hashOTP(otp);
    const otpExpiry = getOTPExpiry();

    // Update school with new OTP
    school.emailVerificationOTP = hashedOTP;
    school.emailVerificationExpires = otpExpiry;
    await school.save();

    console.log('🔑 Resend OTP (for debugging):', process.env.NODE_ENV === 'development' ? otp : '******');

    // Send response immediately (DB update complete)
    res.status(200).json({
      success: true,
      message: 'Verification OTP sent successfully. Please check your email.',
      // Include OTP in development mode for testing
      ...(process.env.NODE_ENV === 'development' && { otp })
    });

    // Send verification email asynchronously (non-blocking)
    sendSchoolRegistrationOTP(email, otp, school.schoolName)
      .then((emailResult) => {
        if (emailResult.success) {
          console.log('✓ Resend verification OTP sent to:', email);
        } else {
          console.error('✗ Failed to resend verification OTP:', emailResult.error);
        }
      })
      .catch((emailError) => {
        console.error('✗ Failed to resend verification OTP:', emailError.message);
        // OTP is still valid in DB, user can retry resend if needed
      });

  } catch (error) {
    console.error('Resend verification error:', error);
    next(error);
  }
};

/**
 * @desc    Forgot password - Send reset OTP (Feature 2)
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find school by email
    const { default: School } = await import('../models/School.js');
    const school = await School.findOne({ email });

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Get admin from tenant database
    const Admin = await getModel(school._id, 'admins');
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Generate OTP for password reset
    const otp = generateOTP();
    const hashedOTP = hashOTP(otp);
    const otpExpiry = getOTPExpiry();

    // Save OTP to admin
    admin.resetPasswordCode = hashedOTP;
    admin.resetPasswordExpires = otpExpiry;
    await admin.save();

    console.log('📧 Attempting to send password reset OTP to:', email);
    console.log('🔑 OTP Generated (for debugging):', process.env.NODE_ENV === 'development' ? otp : '******');

    // Send response IMMEDIATELY (don't wait for email)
    res.status(200).json({
      success: true,
      message: 'Password reset OTP sent to your email. Please check your inbox.',
      // Only include OTP in development mode for testing
      ...(process.env.NODE_ENV === 'development' && { otp })
    });

    // Send password reset email in background (non-blocking)
    sendPasswordResetEmail(email, otp, admin.name)
      .then((emailResult) => {
        if (emailResult.success) {
          console.log('✅ Password reset email sent successfully to:', email);
          console.log('📬 Message ID:', emailResult.messageId);
        } else {
          console.error('⚠️ Email sending failed:', emailResult.error);
        }
      })
      .catch((emailError) => {
        console.error('❌ Email sending error:', emailError.message);
      });

  } catch (error) {
    console.error('Forgot password error:', error);
    next(error);
  }
};

/**
 * @desc    Reset password with OTP (Feature 2)
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and new password are required'
      });
    }

    // Validate password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Find school by email
    const { default: School } = await import('../models/School.js');
    const school = await School.findOne({ email });

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Get admin from tenant database
    const Admin = await getModel(school._id, 'admins');
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Check if reset OTP exists
    if (!admin.resetPasswordCode || !admin.resetPasswordExpires) {
      return res.status(400).json({
        success: false,
        message: 'No password reset request found. Please request a new one.'
      });
    }

    // Check if OTP expired
    if (new Date() > admin.resetPasswordExpires) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }

    // Verify OTP
    const isOTPValid = verifyOTP(otp, admin.resetPasswordCode);

    if (!isOTPValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear reset fields
    admin.password = hashedPassword;
    admin.resetPasswordCode = undefined;
    admin.resetPasswordExpires = undefined;
    await admin.save();

    // Auto-login: Generate JWT token
    const token = jwt.sign(
      {
        id: admin._id,
        schoolId: school._id,
        role: admin.role,
        email: admin.email,
        type: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '10d' }
    );

    // Return token for auto-login
    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
      token,
      user: {
        adminId: admin._id,
        schoolId: school._id,
        schoolName: school.schoolName,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });

  } catch (error) {
    console.error('Reset password error:', error);
    next(error);
  }
};

/**
 * @desc    Change password (for logged-in admin)
 * @route   POST /api/admin/change-password
 * @access  Private (Admin only)
 */
export const changePassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    // Validate inputs
    if (!email || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Validate password length
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Find school by email
    const { default: School } = await import('../models/School.js');
    const school = await School.findOne({ email });

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Verify that the schoolId matches the logged-in admin's school
    if (school._id.toString() !== req.schoolId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    // Get admin from tenant database
    const Admin = await getModel(school._id, 'admins');
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Check if OTP exists
    if (!admin.resetPasswordCode || !admin.resetPasswordExpires) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found. Please request a new one.'
      });
    }

    // Check if OTP expired
    if (new Date() > admin.resetPasswordExpires) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }

    // Verify OTP
    const isOTPValid = verifyOTP(otp, admin.resetPasswordCode);

    if (!isOTPValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password in both Admin (tenant DB) and School (main DB)
    admin.password = hashedPassword;
    admin.resetPasswordCode = undefined;
    admin.resetPasswordExpires = undefined;
    await admin.save();

    // Update password in School model as well
    school.password = hashedPassword;
    await school.save();

    console.log(`✓ Password changed successfully for: ${email}`);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully! Please login with your new password.'
    });

  } catch (error) {
    console.error('Change password error:', error);
    next(error);
  }
};

/**
 * @desc    Send OTP for password change (for logged-in admin)
 * @route   POST /api/admin/send-change-password-otp
 * @access  Private (Admin only)
 */
export const sendChangePasswordOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find school by email
    const { default: School } = await import('../models/School.js');
    const school = await School.findOne({ email });

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Verify that the schoolId matches the logged-in admin's school
    if (school._id.toString() !== req.schoolId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    // Get admin from tenant database
    const Admin = await getModel(school._id, 'admins');
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const hashedOTP = hashOTP(otp);
    const otpExpiry = getOTPExpiry();

    // Save OTP to admin
    admin.resetPasswordCode = hashedOTP;
    admin.resetPasswordExpires = otpExpiry;
    await admin.save();

    console.log('📧 Sending password change OTP to:', email);
    console.log('🔑 OTP (for debugging):', process.env.NODE_ENV === 'development' ? otp : '******');

    // Send response immediately
    res.status(200).json({
      success: true,
      message: 'OTP sent to your email. Please check your inbox.',
      ...(process.env.NODE_ENV === 'development' && { otp })
    });

    // Send email asynchronously
    sendPasswordResetEmail(email, otp, admin.name)
      .then((emailResult) => {
        if (emailResult.success) {
          console.log('✅ Change password OTP sent successfully to:', email);
        } else {
          console.error('⚠️ Failed to send change password OTP:', emailResult.error);
        }
      })
      .catch((emailError) => {
        console.error('❌ Email sending error:', emailError.message);
      });

  } catch (error) {
    console.error('Send change password OTP error:', error);
    next(error);
  }
};

export default {
  registerSchool,
  adminLogin,
  verifyEmail,
  resendVerificationOTP,
  forgotPassword,
  resetPassword,
  getSchoolDetails,
  updateSchoolDetails,
  getAllSchools,
  getSchoolById,
  sendChangePasswordOTP,
  changePassword
};
