import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Branch from '../models/Branch.js';
import BranchAdminAccess from '../models/BranchAdminAccess.js';
import School from '../models/School.js';
import Institution from '../models/Institution.js';
import { getModel } from '../models/dynamicModels.js';
import { initializeBranchDB } from '../config/tenantDB.js';
import { sendAdminInviteOTP, sendBranchAdminInviteEmail, sendBranchAdminVerifiedEmail } from '../utils/emailService.js';
import { generateOTP, hashOTP, verifyOTP, getOTPExpiry } from '../utils/otpHelper.js';

const INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000;

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const isBranchAllowed = (access, branchId) => {
  if (access.role === 'super_admin') return true;
  return access.assignedBranches.some((b) => b.branchId.toString() === branchId.toString());
};

const ensureHeadquarters = async (req) => {
  if (!req.schoolId) return false;
  const branch = await Branch.findById(req.schoolId).select('isHeadquarters schoolId');
  if (!branch) return false;
  if (!branch.isHeadquarters) return false;
  return branch;
};

export const listBranches = async (req, res) => {
  try {
    const access = req.adminAccess;
    const schoolId = req.mainSchoolId || req.schoolId;

    const branches = await Branch.find({ schoolId, isActive: true })
      .select('_id branchName address city province isHeadquarters')
      .lean();

    const filtered = access.role === 'super_admin'
      ? branches
      : branches.filter((b) => isBranchAllowed(access, b._id));

    res.json({ success: true, data: filtered });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const selectBranch = async (req, res) => {
  try {
    const { branchId } = req.body;
    if (!branchId) {
      return res.status(400).json({ success: false, message: 'branchId is required' });
    }

    const access = req.adminAccess;
    const schoolId = access.schoolId;

    const branch = await Branch.findOne({ _id: branchId, schoolId }).select('_id branchName city province isHeadquarters');
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    if (!isBranchAllowed(access, branch._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized for this branch' });
    }

    const Admin = await getModel(branch._id, 'admins');
    let admin = await Admin.findOne({ email: access.email });

    if (!admin) {
      admin = await Admin.create({
        name: access.name,
        email: access.email,
        password: access.password,
        role: access.role === 'super_admin' ? 'super_admin' : 'admin',
        isActive: true,
        isEmailVerified: true
      });
    }

    const token = jwt.sign(
      {
        accessId: access._id,
        schoolId,
        branchId: branch._id,
        adminDbId: admin._id,
        role: access.role,
        email: access.email,
        type: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '10d' }
    );

    res.json({
      success: true,
      token,
      branch: {
        id: branch._id,
        name: branch.branchName,
        city: branch.city,
        province: branch.province,
        isHeadquarters: branch.isHeadquarters
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const requestBranchUpgrade = async (req, res) => {
  try {
    const schoolId = req.mainSchoolId || req.schoolId;
    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    if (school.branchStructure === 'multiple') {
      return res.status(400).json({ success: false, message: 'School already has multiple branches enabled' });
    }

    if (school.branchUpgradeStatus === 'pending') {
      return res.status(400).json({ success: false, message: 'Upgrade request already pending' });
    }

    school.branchUpgradeStatus = 'pending';
    school.branchUpgradeRequestedAt = new Date();
    school.branchUpgradeNotes = 'Requested from school portal';
    await school.save({ validateModifiedOnly: true });

    return res.json({ success: true, message: 'Upgrade request submitted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const createBranch = async (req, res) => {
  try {
    const schoolId = req.mainSchoolId || req.schoolId;
    const {
      branchName,
      address,
      city,
      province,
      phone,
      email,
      estimatedStudents,
      adminName,
      adminEmail,
      adminPassword
    } = req.body;

    if (!branchName || !address || !city || !province || !phone || !email || !estimatedStudents || !adminEmail || !adminPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    if (school.branchStructure !== 'multiple') {
      return res.status(403).json({ success: false, message: 'Branch creation requires Business upgrade approval' });
    }

    if (school.selectedPlan !== 'BUSINESS' || school.planType !== 'paid' || school.approvalStatus !== 'approved' || school.accountStatus !== 'active') {
      return res.status(403).json({ success: false, message: 'Business plan must be approved to add branches' });
    }

    if (req.schoolId && req.schoolId !== schoolId) {
      const currentBranch = await Branch.findById(req.schoolId).select('isHeadquarters schoolId');
      if (!currentBranch || currentBranch.schoolId.toString() !== schoolId.toString() || !currentBranch.isHeadquarters) {
        return res.status(403).json({ success: false, message: 'Only headquarters can add branches' });
      }
    }

    const existingBranchEmail = await Branch.findOne({ email: email.toLowerCase().trim() });
    if (existingBranchEmail) {
      return res.status(400).json({ success: false, message: 'Branch email already in use' });
    }

    let institution = await Institution.findOne({ schoolId });
    if (!institution) {
      institution = await Institution.create({
        schoolId,
        institutionType: school.institutionType || 'school',
        branchStructure: 'multiple',
        totalBranches: 1
      });
    }

    const existingBranches = await Branch.find({ schoolId })
      .select('_id isHeadquarters createdAt')
      .sort({ createdAt: 1 })
      .lean();
    const hasHeadquarters = existingBranches.some((b) => b.isHeadquarters);
    let shouldBeHeadquarters = existingBranches.length === 0;

    if (!hasHeadquarters && existingBranches.length > 0) {
      const oldestBranch = existingBranches[0];
      await Branch.updateOne({ _id: oldestBranch._id }, { isHeadquarters: true });
      shouldBeHeadquarters = false;
    }

    const branch = await Branch.create({
      institutionId: institution._id,
      schoolId,
      branchName: branchName.trim(),
      address: address.trim(),
      city: city.trim(),
      province: province.trim(),
      phone: phone.trim(),
      email: email.toLowerCase().trim(),
      estimatedStudents: Number(estimatedStudents),
      isHeadquarters: shouldBeHeadquarters
    });

    institution.branchStructure = 'multiple';
    institution.totalBranches = (institution.totalBranches || 1) + 1;
    await institution.save({ validateModifiedOnly: true });

    await initializeBranchDB(branch._id);

    const accessEmail = adminEmail.toLowerCase().trim();
    const existingAccess = await BranchAdminAccess.findOne({ schoolId, email: accessEmail });
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    if (existingAccess) {
      const alreadyAssigned = existingAccess.assignedBranches.some((b) => b.branchId.toString() === branch._id.toString());
      if (!alreadyAssigned) {
        existingAccess.assignedBranches.push({
          branchId: branch._id,
          role: 'admin',
          isPrimary: shouldBeHeadquarters
        });
      }
      if (shouldBeHeadquarters) {
        existingAccess.assignedBranches.forEach((assignment) => {
          assignment.isPrimary = assignment.branchId.toString() === branch._id.toString();
        });
      }
      existingAccess.isEmailVerified = true;
      await existingAccess.save({ validateModifiedOnly: true });
    } else {
      await BranchAdminAccess.create({
        schoolId,
        name: (adminName || 'Branch Admin').trim(),
        email: accessEmail,
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        isEmailVerified: true,
        assignedBranches: [{ branchId: branch._id, role: 'admin', isPrimary: true }],
        createdBy: req.admin?._id
      });
    }

    const mainAccessEmail = req.admin?.email?.toLowerCase().trim();
    if (mainAccessEmail && mainAccessEmail !== accessEmail) {
      const mainAccess = await BranchAdminAccess.findOne({ schoolId, email: mainAccessEmail });
      if (mainAccess) {
        const hasAssignment = mainAccess.assignedBranches.some((b) => b.branchId.toString() === branch._id.toString());
        if (!hasAssignment) {
          mainAccess.assignedBranches.push({
            branchId: branch._id,
            role: mainAccess.role || 'super_admin',
            isPrimary: shouldBeHeadquarters
          });
        }
        if (shouldBeHeadquarters) {
          mainAccess.assignedBranches.forEach((assignment) => {
            assignment.isPrimary = assignment.branchId.toString() === branch._id.toString();
          });
        }
        await mainAccess.save({ validateModifiedOnly: true });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Branch created successfully',
      data: {
        id: branch._id,
        name: branch.branchName,
        email: branch.email,
        city: branch.city,
        province: branch.province
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getBranchDetails = async (req, res) => {
  try {
    const branchId = req.params.branchId;
    if (!branchId) {
      return res.status(400).json({ success: false, message: 'branchId is required' });
    }

    const headquarters = await ensureHeadquarters(req);
    if (!headquarters) {
      return res.status(403).json({ success: false, message: 'Only headquarters can view branch details' });
    }

    const schoolId = req.mainSchoolId || req.schoolId;
    const branch = await Branch.findOne({ _id: branchId, schoolId }).lean();
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    const Students = await getModel(branchId, 'students');
    const Staffs = await getModel(branchId, 'staffs');

    const [studentCount, staffCount] = await Promise.all([
      Students.countDocuments({}),
      Staffs.countDocuments({})
    ]);

    const access = await BranchAdminAccess.findOne({
      schoolId,
      assignedBranches: { $elemMatch: { branchId: branch._id, isPrimary: true } }
    }).select('name email role isActive isEmailVerified').lean();

    return res.json({
      success: true,
      data: {
        id: branch._id,
        name: branch.branchName,
        address: branch.address,
        city: branch.city,
        province: branch.province,
        email: branch.email,
        phone: branch.phone,
        estimatedStudents: branch.estimatedStudents,
        isHeadquarters: branch.isHeadquarters,
        isActive: branch.isActive,
        createdAt: branch.createdAt,
        studentCount,
        staffCount,
        admin: access || null
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const resetBranchAdminPassword = async (req, res) => {
  try {
    const branchId = req.params.branchId;
    const { newPassword, confirmPassword } = req.body;

    if (!branchId) {
      return res.status(400).json({ success: false, message: 'branchId is required' });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'newPassword and confirmPassword are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
    }

    const headquarters = await ensureHeadquarters(req);
    if (!headquarters) {
      return res.status(403).json({ success: false, message: 'Only headquarters can reset branch passwords' });
    }

    const schoolId = req.mainSchoolId || req.schoolId;
    const branch = await Branch.findOne({ _id: branchId, schoolId }).select('_id');
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    const access = await BranchAdminAccess.findOne({
      schoolId,
      assignedBranches: { $elemMatch: { branchId: branch._id, isPrimary: true } }
    });
    if (!access) {
      return res.status(404).json({ success: false, message: 'Branch admin not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    access.password = hashedPassword;
    await access.save({ validateModifiedOnly: true });

    const Admin = await getModel(branchId, 'admins');
    const adminRecord = await Admin.findOne({ email: access.email });
    if (adminRecord) {
      adminRecord.password = hashedPassword;
      await adminRecord.save({ validateModifiedOnly: true });
    }

    return res.json({ success: true, message: 'Branch admin password reset successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const sendInviteOTP = async (req, res) => {
  try {
    const access = req.adminAccess;
    const schoolId = access.schoolId;

    const school = await School.findById(schoolId).select('email schoolName');
    if (!school?.email) {
      return res.status(400).json({ success: false, message: 'School email not found' });
    }

    const otp = generateOTP();
    school.inviteEmailOTP = hashOTP(otp);
    school.inviteEmailOTPExpires = getOTPExpiry();
    await school.save();

    const mailResult = await sendAdminInviteOTP(school.email, otp, school.schoolName);
    if (!mailResult.success) {
      return res.status(500).json({ success: false, message: 'Failed to send OTP email' });
    }

    res.json({ success: true, message: 'Verification code sent to school email' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listInvitedAdmins = async (req, res) => {
  try {
    const access = req.adminAccess;
    const schoolId = access.schoolId;

    const records = await BranchAdminAccess.find({ schoolId })
      .populate('assignedBranches.branchId', 'branchName')
      .sort({ createdAt: -1 })
      .lean();

    const data = records.map((record) => ({
      id: record._id,
      name: record.name,
      email: record.email,
      role: record.role,
      isActive: record.isActive,
      isEmailVerified: record.isEmailVerified,
      createdAt: record.createdAt,
      branches: (record.assignedBranches || []).map((assignment) => ({
        id: assignment.branchId?._id || assignment.branchId,
        name: assignment.branchId?.branchName || 'Branch',
        role: assignment.role,
        isPrimary: assignment.isPrimary
      }))
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const inviteBranchAdmin = async (req, res) => {
  try {
    const { email, password, name, branchId, otp } = req.body;
    if (!email || !password || !name || !branchId || !otp) {
      return res.status(400).json({
        success: false,
        message: 'email, password, name, branchId, and otp are required'
      });
    }

    const access = req.adminAccess;
    const schoolId = access.schoolId;

    const school = await School.findById(schoolId).select('inviteEmailOTP inviteEmailOTPExpires');
    if (!school?.inviteEmailOTP || !school?.inviteEmailOTPExpires) {
      return res.status(400).json({ success: false, message: 'Verification code required' });
    }

    if (new Date() > new Date(school.inviteEmailOTPExpires)) {
      return res.status(400).json({ success: false, message: 'Verification code expired' });
    }

    const isOtpValid = verifyOTP(otp, school.inviteEmailOTP);
    if (!isOtpValid) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    school.inviteEmailOTP = undefined;
    school.inviteEmailOTPExpires = undefined;
    await school.save();

    const branch = await Branch.findOne({ _id: branchId, schoolId }).select('branchName');
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    const existing = await BranchAdminAccess.findOne({ schoolId, email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Admin already exists for this school' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(inviteToken);
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

    await BranchAdminAccess.create({
      schoolId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'admin',
      isActive: true,
      isEmailVerified: false,
      verificationTokenHash: tokenHash,
      verificationExpires: expiresAt,
      assignedBranches: [{ branchId, role: 'admin', isPrimary: true }],
      createdBy: access._id
    });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/admin/verify-branch-access?token=${inviteToken}&email=${encodeURIComponent(email)}`;

    await sendBranchAdminInviteEmail({
      to: email,
      name,
      branchName: branch.branchName,
      verifyUrl,
      password
    });

    res.json({ success: true, message: 'Invite sent successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const verifyBranchInvite = async (req, res) => {
  try {
    const { token, email } = req.query;
    if (!token || !email) {
      return res.status(400).json({ success: false, message: 'token and email are required' });
    }

    const tokenHash = hashToken(token.toString());
    const access = await BranchAdminAccess.findOne({
      email: email.toLowerCase().trim(),
      verificationTokenHash: tokenHash,
      verificationExpires: { $gt: new Date() }
    });

    if (!access) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification link' });
    }

    access.isEmailVerified = true;
    access.verificationTokenHash = undefined;
    access.verificationExpires = undefined;
    await access.save();

    const branchId = access.assignedBranches?.[0]?.branchId;
    if (branchId) {
      const Admin = await getModel(branchId, 'admins');
      const existingAdmin = await Admin.findOne({ email: access.email });
      if (!existingAdmin) {
        await Admin.create({
          name: access.name,
          email: access.email,
          password: access.password,
          role: access.role === 'super_admin' ? 'super_admin' : 'admin',
          isActive: true,
          isEmailVerified: true
        });
      }

      const branch = await Branch.findById(branchId).select('branchName');
      await sendBranchAdminVerifiedEmail({
        to: access.email,
        name: access.name,
        branchName: branch?.branchName || 'your branch'
      });
    }

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
