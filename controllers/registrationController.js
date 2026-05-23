import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Institution from '../models/Institution.js';
import Branch from '../models/Branch.js';
import Payment from '../models/Payment.js';
import School from '../models/School.js';
import { initializeTenantDB, initializeBranchDB } from '../config/tenantDB.js';
import { getModel } from '../models/dynamicModels.js';
import { generateOTP, hashOTP, verifyOTP } from '../utils/otpHelper.js';
import BranchAdminAccess from '../models/BranchAdminAccess.js';

const PLAN_PRICES = {
  BASIC:    { MONTHLY: 4999,  YEARLY: 49990 },
  STANDARD: { MONTHLY: 9999,  YEARLY: 99990 },
  PREMIUM:  { MONTHLY: 14999, YEARLY: 149990 },
  BUSINESS: { MONTHLY: 0,     YEARLY: 0 }
};

const STUDENT_LIMITS = { BASIC: 300, STANDARD: 600, PREMIUM: 1200, BUSINESS: -1 };

// Map wizard plan names to SchoolRegistry enum
const REGISTRY_PLAN_MAP = { BASIC: 'BASIC', STANDARD: 'PREMIUM', PREMIUM: 'ENTERPRISE', BUSINESS: 'ENTERPRISE' };

// JWT secret for OTP tokens (stateless — no DB needed)
const OTP_JWT_SECRET = process.env.OTP_JWT_SECRET || process.env.JWT_SECRET || 'apnaschool_otp_secret_2024';

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return '';
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(2, user.length - 2))}@${domain}`;
};

const generatePassword = () => {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const nums    = '0123456789';
  const special = '!@#$%^&*';
  const all     = upper + lower + nums + special;

  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    nums[Math.floor(Math.random() * nums.length)],
    special[Math.floor(Math.random() * special.length)]
  ];
  for (let i = 0; i < 8; i++) chars.push(all[Math.floor(Math.random() * all.length)]);
  return chars.sort(() => Math.random() - 0.5).join('');
};

// ── 1. Send OTP (stateless — uses JWT, no DB session) ─────────────────────────
// Accepts: { email }
// Returns: { otpToken, adminEmailMasked }
export const sendVerificationOTPs = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'email is required' });

    const normalised = email.toLowerCase().trim();
    const otp = generateOTP();
    const hashedOtp = hashOTP(otp);
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Sign a JWT carrying the hashed OTP — no DB write needed
    const otpToken = jwt.sign(
      { email: normalised, hashedOtp, expiresAt },
      OTP_JWT_SECRET,
      { expiresIn: '10m' }
    );

    // Send OTP email (best-effort)
    try {
      const { sendEmail } = await import('../utils/emailService.js');
      await sendEmail({
        to: normalised,
        subject: 'Verify Your Email – Apna School',
        html: `<h2>Email Verification</h2>
               <p>Your verification code is:</p>
               <h1 style="letter-spacing:8px;color:#6919c3">${otp}</h1>
               <p>This code expires in 10 minutes.</p>`
      });
    } catch (_err) {
      console.error('OTP email send error:', _err.message);
    }

    res.json({
      success: true,
      message: 'Verification code sent',
      otpToken,
      adminEmailMasked: maskEmail(normalised)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 2. Verify OTP (stateless — validates JWT token) ───────────────────────────
// Accepts: { otpToken, adminOTP }
// Returns: { verifiedToken } — a new token confirming email is verified
export const verifyOTPs = async (req, res) => {
  try {
    const { otpToken, adminOTP } = req.body;
    if (!otpToken || !adminOTP) {
      return res.status(400).json({ success: false, message: 'otpToken and adminOTP are required' });
    }

    let payload;
    try {
      payload = jwt.verify(otpToken, OTP_JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ success: false, errors: { adminOTP: 'Code expired. Please request a new one.' } });
    }

    if (Date.now() > payload.expiresAt) {
      return res.status(400).json({ success: false, errors: { adminOTP: 'Code expired. Please request a new one.' } });
    }

    if (!verifyOTP(adminOTP.trim(), payload.hashedOtp)) {
      return res.status(400).json({ success: false, errors: { adminOTP: 'Invalid code. Please try again.' } });
    }

    // Issue a short-lived "verified" token the frontend can store and send with completeRegistration
    const verifiedToken = jwt.sign(
      { email: payload.email, verified: true },
      OTP_JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({ success: true, message: 'Email verified successfully', verifiedToken });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 3. Check branch email availability ───────────────────────────────────────
export const checkBranchEmail = async (req, res) => {
  try {
    const { email, sessionId, branchIndex } = req.query;
    if (!email) return res.status(400).json({ success: false, message: 'email is required' });

    const normalised = email.toLowerCase().trim();
    const idx = parseInt(branchIndex ?? '-1');

    const schoolExists = await School.findOne({ email: normalised });

    let branchExists = false;
    const existingBranch = await Branch.findOne({ email: normalised });
    if (existingBranch) {
      const linkedSchool = await School.findById(existingBranch.schoolId);
      branchExists = !!linkedSchool;
    }

    // Check against other branches in the submitted list (sessionId used as a client hint, not DB lookup)
    let usedInSession = false;
    if (sessionId) {
      // sessionId is now just a client-side identifier — we can't look it up in DB
      // Duplicate-within-form checking is handled client-side
      usedInSession = false;
    }

    const available = !branchExists && !schoolExists && !usedInSession;
    res.json({ success: true, available });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 4. Check admin email / mobile availability ────────────────────────────────
export const checkAdminContact = async (req, res) => {
  try {
    const { email } = req.query;
    const result = { emailAvailable: true };

    if (email) {
      const normalised = email.toLowerCase().trim();
      const schoolExists = await School.findOne({ email: normalised });
      result.emailAvailable = !schoolExists;
    }

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 5. Get plans ──────────────────────────────────────────────────────────────
export const getPlans = async (_req, res) => {
  try {
    const plans = [
      {
        id: 'BASIC',
        name: 'Basic',
        monthlyPrice: 4999,
        yearlyPrice: 49990,
        studentLimit: 300,
        recommended: false,
        features: ['Up to 300 students', 'Attendance management', 'Fee management', 'Parent portal', 'Basic reports']
      },
      {
        id: 'STANDARD',
        name: 'Standard',
        monthlyPrice: 9999,
        yearlyPrice: 99990,
        studentLimit: 600,
        recommended: true,
        features: ['Up to 600 students', 'All Basic features', 'Exam & question bank', 'SMS notifications', 'Advanced analytics', 'Staff portal']
      },
      {
        id: 'PREMIUM',
        name: 'Premium',
        monthlyPrice: 14999,
        yearlyPrice: 149990,
        studentLimit: 1200,
        recommended: false,
        features: ['Up to 1200 students', 'All Standard features', 'FBR POS integration', 'AI-powered insights', 'ID card generator', 'Priority support']
      },
      {
        id: 'BUSINESS',
        name: 'Business',
        monthlyPrice: 0,
        yearlyPrice: 0,
        studentLimit: -1,
        recommended: false,
        features: ['Custom student limit (1200+)', 'Multi-branch access', 'Enterprise reporting', 'Dedicated support', 'Custom onboarding']
      }
    ];

    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 6. Initiate payment (browser-session based — no DB session read) ──────────
// Accepts: { plan, billingCycle, gateway } — no sessionId needed
export const initiatePayment = async (req, res) => {
  try {
    const { plan, billingCycle, gateway } = req.body;
    if (!plan || !billingCycle || !gateway) {
      return res.status(400).json({ success: false, message: 'plan, billingCycle and gateway are required' });
    }

    const amount = PLAN_PRICES[plan]?.[billingCycle];
    if (amount === undefined) return res.status(400).json({ success: false, message: 'Invalid plan or billing cycle' });

    // Create a payment record (lightweight — no session linkage needed yet)
    const payment = await Payment.create({ gateway, amount, plan, billingCycle, status: 'pending' });

    // HMAC signature for integrity
    const hmacData = `${payment._id}:${amount}:${gateway}`;
    const signature = crypto
      .createHmac('sha256', process.env.PAYMENT_HMAC_SECRET || 'apnaschool_hmac_secret')
      .update(hmacData)
      .digest('hex');

    await Payment.findByIdAndUpdate(payment._id, { hmacSignature: signature });

    const paymentDetails = {
      paymentId: payment._id,
      amount,
      currency: 'PKR',
      signature
    };

    if (gateway === 'jazzcash') {
      paymentDetails.accountNumber = process.env.JAZZCASH_ACCOUNT || '03249664550';
      paymentDetails.accountName   = process.env.JAZZCASH_ACCOUNT_NAME || 'Khateeb Ur Rehman';
      paymentDetails.whatsapp      = process.env.WHATSAPP_NUMBER || '03249664550';
      paymentDetails.instructions  = `Send PKR ${amount.toLocaleString()} to JazzCash ${paymentDetails.accountNumber} then WhatsApp the screenshot.`;
    } else if (gateway === 'easypaisa') {
      paymentDetails.accountNumber = process.env.EASYPAISA_ACCOUNT || '03466066100';
      paymentDetails.accountName   = process.env.EASYPAISA_ACCOUNT_NAME || 'Khateeb Ur Rehman';
      paymentDetails.whatsapp      = process.env.WHATSAPP_NUMBER || '03249664550';
      paymentDetails.instructions  = `Send PKR ${amount.toLocaleString()} to EasyPaisa ${paymentDetails.accountNumber} then WhatsApp the screenshot.`;
    } else if (gateway === 'stripe') {
      paymentDetails.instructions = 'Stripe payment integration coming soon. Please use JazzCash or EasyPaisa.';
    }

    res.json({ success: true, data: paymentDetails });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── 7. Complete registration (all data in request body — no DB session) ────────
// Accepts full wizard data: { verifiedToken, institutionType, branchStructure,
//   branchCount, branches, admin: {fullName, mobile, email, password},
//   selectedPlan, billingCycle, paymentId }
export const completeRegistration = async (req, res) => {
  try {
    const {
      verifiedToken,
      institutionType,
      branchStructure,
      branchCount,
      branches,
      admin,
      selectedPlan,
      billingCycle,
      paymentId
    } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!verifiedToken) {
      return res.status(400).json({ success: false, message: 'Email verification is required. Please complete the verification step.' });
    }
    if (!institutionType || !branchStructure || !Array.isArray(branches) || branches.length === 0) {
      return res.status(400).json({ success: false, message: 'Incomplete registration data. Please complete all steps.' });
    }
    if (!admin?.email || !admin?.fullName || !admin?.mobile || !admin?.password) {
      return res.status(400).json({ success: false, message: 'Admin details are incomplete.' });
    }
    if (!selectedPlan) {
      return res.status(400).json({ success: false, message: 'Please select a plan.' });
    }

    // ── Verify the OTP token ──────────────────────────────────────────────────
    let tokenPayload;
    try {
      tokenPayload = jwt.verify(verifiedToken, OTP_JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Email verification has expired. Please re-verify your email.' });
    }

    if (!tokenPayload.verified || tokenPayload.email !== admin.email.toLowerCase().trim()) {
      return res.status(400).json({ success: false, message: 'Email verification mismatch. Please re-verify.' });
    }

    // ── Hash password ─────────────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(admin.password, 10);

    const plan         = selectedPlan;
    const cycle        = billingCycle || 'MONTHLY';
    const isTrial      = plan === 'FREE_TRIAL';
    const planPrice    = isTrial ? 0 : (PLAN_PRICES[plan]?.[cycle] ?? 0);
    const planDuration = isTrial ? '7 days' : (cycle === 'YEARLY' ? '1 year' : '1 month');

    const trialStart = new Date();
    const trialEnd   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const primaryBranch = branches[0];

    // ── Create main School record ─────────────────────────────────────────────
    const school = await School.create({
      schoolName:     primaryBranch.branchName,
      address:        primaryBranch.address,
      city:           primaryBranch.city,
      state:          primaryBranch.province,
      phone:          primaryBranch.phone,
      email:          admin.email.toLowerCase().trim(),
      password:       hashedPassword,
      adminName:      admin.fullName,
      adminPhone:     admin.mobile,
      selectedPlan:   plan,
      billingCycle:   isTrial ? 'MONTHLY' : cycle,
      planPrice,
      planDuration,
      planType:       isTrial ? 'trial' : 'paid',
      studentLimit:   isTrial ? 100 : (STUDENT_LIMITS[plan] ?? 300),
      isActive:       isTrial,
      approvalStatus: isTrial ? 'approved' : 'pending',
      accountStatus:  isTrial ? 'active'   : 'inactive',
      isEmailVerified: true,
      trial: isTrial ? { isActive: true, startDate: trialStart, endDate: trialEnd } : undefined,
      planStartDate:  isTrial ? trialStart : undefined,
      planEndDate:    isTrial ? trialEnd   : undefined,
      institutionType,
      branchStructure
    });

    // ── Initialize tenant database ────────────────────────────────────────────
    await initializeTenantDB(school._id, primaryBranch.branchName);

    // ── Create admin in tenant DB ─────────────────────────────────────────────
    const Admin = await getModel(school._id, 'admins');
    await Admin.create({
      name:     admin.fullName,
      email:    admin.email.toLowerCase().trim(),
      password: hashedPassword,
      phone:    admin.mobile,
      role:     'super_admin',
      isActive: true
    });

    // ── Create Institution record ─────────────────────────────────────────────
    const institution = await Institution.create({
      schoolId:        school._id,
      institutionType,
      branchStructure,
      totalBranches:   parseInt(branchCount) || branches.length,
    });

    // ── Remove orphaned Branch records with same emails ───────────────────────
    const branchEmails = branches.map((b) => b.email).filter(Boolean);
    if (branchEmails.length) {
      const orphaned = await Branch.find({ email: { $in: branchEmails } });
      const orphanedIds = [];
      for (const ob of orphaned) {
        const linked = await School.findById(ob.schoolId);
        if (!linked) orphanedIds.push(ob._id);
      }
      if (orphanedIds.length) await Branch.deleteMany({ _id: { $in: orphanedIds } });
    }

    // ── Create Branch records ─────────────────────────────────────────────────
    const branchDocs = branches.map((b, i) => ({
      institutionId:     institution._id,
      schoolId:          school._id,
      branchName:        b.branchName,
      address:           b.address,
      city:              b.city,
      province:          b.province,
      phone:             b.phone,
      email:             b.email,
      estimatedStudents: b.estimatedStudents,
      isHeadquarters:    i === 0
    }));
    const insertedBranches = await Branch.insertMany(branchDocs);

    // ── Initialize branch DBs for multi-branch schools ────────────────────────
    if (branchStructure === 'multiple') {
      for (const branch of insertedBranches) {
        await initializeBranchDB(branch._id);
        const BranchAdmin = await getModel(branch._id, 'admins');
        await BranchAdmin.create({
          name:     admin.fullName,
          email:    admin.email.toLowerCase().trim(),
          password: hashedPassword,
          phone:    admin.mobile,
          role:     'super_admin',
          isActive: true,
          isEmailVerified: true
        });
      }
    }

    // ── Create BranchAdminAccess record ──────────────────────────────────────
    await BranchAdminAccess.create({
      schoolId: school._id,
      name: admin.fullName,
      email: admin.email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'super_admin',
      isActive: true,
      isEmailVerified: true,
      assignedBranches: insertedBranches.map((b, i) => ({
        branchId: b._id,
        role: 'super_admin',
        isPrimary: i === 0
      }))
    });

    // ── Link payment to school ────────────────────────────────────────────────
    if (paymentId) {
      await Payment.findByIdAndUpdate(paymentId, { schoolId: school._id });
    }

    // ── Create SchoolRegistry entry (best-effort) ─────────────────────────────
    try {
      const SchoolRegistry = (await import('../models/SchoolRegistry.js')).default;
      const registryPlan = REGISTRY_PLAN_MAP[plan] || 'BASIC';
      await SchoolRegistry.create({
        schoolId:           school._id,
        schoolName:         primaryBranch.branchName,
        schoolEmail:        admin.email.toLowerCase().trim(),
        schoolPhone:        primaryBranch.phone,
        schoolAddress:      `${primaryBranch.address}, ${primaryBranch.city}`,
        selectedPlan:       registryPlan,
        planType:           'paid',
        approvalStatus:     'pending',
        accountStatus:      'inactive',
        trialActive:        false,
        primaryContactName:  admin.fullName,
        primaryContactEmail: admin.email.toLowerCase().trim(),
        primaryContactPhone: admin.mobile
      });
    } catch (_err) {
      // SchoolRegistry failure must not abort registration
    }

    // ── Send confirmation email (best-effort) ─────────────────────────────────
    try {
      const { sendEmail } = await import('../utils/emailService.js');
      await sendEmail({
        to:      admin.email,
        subject: 'Registration Received – Apna School',
        html: `
          <h2>Welcome to Apna School, ${admin.fullName}!</h2>
          <p>Your <strong>${institutionType}</strong> <em>${primaryBranch.branchName}</em> has been registered successfully.</p>
          <p><strong>Plan:</strong> ${plan} (${cycle})</p>
          <p>Your account is pending approval by our team. You will receive an email once approved.</p>
          <p><strong>Login Email:</strong> ${admin.email}</p>
          <p><strong>Password:</strong> The password you set during registration.</p>
          <br/>
          <p>For queries WhatsApp: ${process.env.WHATSAPP_NUMBER || '03249664550'}</p>
        `
      });
    } catch (_err) {
      // Email failure must not abort registration
    }

    res.json({
      success: true,
      message: isTrial
        ? 'Registration successful! Your 7-day free trial has started.'
        : 'Registration submitted! Awaiting admin approval.',
      data: {
        schoolId:        school._id,
        institutionName: primaryBranch.branchName,
        email:           admin.email,
        selectedPlan:    plan,
        isTrial,
        awaitingApproval: !isTrial
      }
    });
  } catch (err) {
    console.error('Registration completion error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Legacy stubs (kept for route compatibility — no-ops now) ──────────────────
export const initSession    = async (_req, res) => res.json({ success: true, sessionId: crypto.randomBytes(16).toString('hex') });
export const getSession     = async (_req, res) => res.status(404).json({ success: false, message: 'Session not found or expired' });
export const saveStructure  = async (_req, res) => res.json({ success: true, message: 'Structure saved' });
export const saveBranches   = async (_req, res) => res.json({ success: true, message: 'Branches saved' });
export const saveAdmin      = async (_req, res) => res.json({ success: true, message: 'Admin saved' });
export const savePlan       = async (_req, res) => res.json({ success: true, message: 'Plan saved' });
