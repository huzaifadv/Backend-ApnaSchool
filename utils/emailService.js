import nodemailer from 'nodemailer';

/**
 * Email Service using Nodemailer
 * Handles sending OTP emails for verification and password reset
 */

// Create transporter
const createTransporter = () => {
  // Check if email is configured
  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your-email@gmail.com') {
    console.error('⚠️  EMAIL NOT CONFIGURED!');
    console.error('Please update EMAIL_USER and EMAIL_PASSWORD in .env file');
    console.error('See EMAIL_VERIFICATION_SETUP_GUIDE.md for instructions');
    return null; // Return null instead of throwing error
  }

  // Only log in development
  if (process.env.NODE_ENV === 'development') {
    console.log('📧 Email Configuration:');
    console.log('   SERVICE:', process.env.EMAIL_SERVICE || 'gmail');
    console.log('   USER:', process.env.EMAIL_USER);
    console.log('   PASSWORD:', process.env.EMAIL_PASSWORD ? '***' + process.env.EMAIL_PASSWORD.slice(-4) : 'NOT SET');
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      pool: true,
      maxConnections: 3,
      maxMessages: 10,
      connectionTimeout: 60000, // 60 seconds
      greetingTimeout: 30000, // 30 seconds
      socketTimeout: 60000, // 60 seconds
      debug: process.env.NODE_ENV === 'development',
      logger: process.env.NODE_ENV === 'development',
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates
        minVersion: 'TLSv1.2'
      }
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Email transporter created successfully');
    }
    return transporter;
  } catch (error) {
    console.error('❌ Failed to create email transporter:', error.message);
    return null;
  }
};

/**
 * Send Email Verification OTP
 * @param {String} email - Recipient email
 * @param {String} otp - 6-digit OTP
 * @param {String} adminName - Admin name
 * @returns {Promise} Send mail promise
 */
export const sendVerificationEmail = async (email, otp, adminName) => {
  const transporter = createTransporter();

  // If transporter creation failed, return error without throwing
  if (!transporter) {
    console.error('Cannot send verification email - email service not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Email Verification - School Management System',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4CAF50;">Email Verification</h2>
        <p>Hello ${adminName},</p>
        <p>Thank you for registering with our School Management System.</p>
        <p>Your email verification OTP is:</p>
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          ${otp}
        </div>
        <p><strong>This OTP will expire in 10 minutes.</strong></p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #888; font-size: 12px;">School Management System</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending verification email:', error.message);
    // Return error info instead of throwing
    return { success: false, error: error.message };
  }
};

/**
 * Send School Registration Email Verification OTP
 * @param {String} email - Recipient email
 * @param {String} otp - 6-digit OTP
 * @param {String} schoolName - School name
 * @returns {Promise} Send mail promise
 */
export const sendSchoolRegistrationOTP = async (email, otp, schoolName) => {
  const transporter = createTransporter();

  // If transporter creation failed, return error without throwing
  if (!transporter) {
    console.error('Cannot send registration OTP email - email service not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const mailOptions = {
    from: `"Apna School" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Email Verification - Complete Your Registration',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #ff6b35; margin: 0; font-size: 28px;">Apna School</h1>
            <p style="color: #666; margin: 5px 0;">School Management System</p>
          </div>

          <h2 style="color: #ff6b35; margin-bottom: 20px;">Welcome to Apna School!</h2>
          <p style="color: #333; line-height: 1.6;">Hello <strong>${schoolName}</strong>,</p>
          <p style="color: #333; line-height: 1.6;">Thank you for registering with Apna School. To complete your registration, please verify your email address.</p>
          <p style="color: #333; line-height: 1.6;">Your email verification OTP is:</p>

          <div style="background: linear-gradient(135deg, #ff6b35 0%, #ff8c61 100%); padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
            <div style="background-color: white; padding: 15px; border-radius: 5px; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #ff6b35;">${otp}</span>
            </div>
          </div>

          <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <p style="margin: 0; color: #856404;"><strong>⏰ This OTP will expire in 10 minutes.</strong></p>
          </div>

          <p style="color: #666; line-height: 1.6; font-size: 14px;">Enter this OTP on the verification page to activate your account and start using Apna School.</p>
          <p style="color: #666; line-height: 1.6; font-size: 14px;">If you didn't register for an account, please ignore this email.</p>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

          <div style="text-align: center;">
            <p style="color: #999; font-size: 12px; margin: 5px 0;">© 2024 Apna School - Digital Education Platform</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0;">For support: <a href="mailto:apnaschooledu@gmail.com" style="color: #ff6b35;">apnaschooledu@gmail.com</a></p>
          </div>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('School registration OTP email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending registration OTP email:', error.message);
    // Return error info instead of throwing
    return { success: false, error: error.message };
  }
};

/**
 * Send Password Reset OTP
 * @param {String} email - Recipient email
 * @param {String} otp - 6-digit OTP
 * @param {String} adminName - Admin name
 * @returns {Promise} Send mail promise
 */
export const sendPasswordResetEmail = async (email, otp, adminName) => {
  const transporter = createTransporter();

  // If transporter creation failed, return error without throwing
  if (!transporter) {
    console.error('Cannot send password reset email - email service not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const mailOptions = {
    from: `"Apna School" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset Request - Apna School',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #ff6b35; margin: 0; font-size: 28px;">Apna School</h1>
            <p style="color: #666; margin: 5px 0;">School Management System</p>
          </div>

          <h2 style="color: #ff6b35; margin-bottom: 20px;">Password Reset Request</h2>
          <p style="color: #333; line-height: 1.6;">Hello ${adminName},</p>
          <p style="color: #333; line-height: 1.6;">We received a request to reset your password for your Apna School account.</p>
          <p style="color: #333; line-height: 1.6;">Your password reset OTP is:</p>

          <div style="background: linear-gradient(135deg, #ff6b35 0%, #ff8c61 100%); padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
            <div style="background-color: white; padding: 15px; border-radius: 5px; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #ff6b35;">${otp}</span>
            </div>
          </div>

          <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <p style="margin: 0; color: #856404;"><strong>⏰ This OTP will expire in 10 minutes.</strong></p>
          </div>

          <p style="color: #666; line-height: 1.6; font-size: 14px;">If you didn't request a password reset, please ignore this email or contact our support team if you have concerns.</p>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

          <div style="text-align: center;">
            <p style="color: #999; font-size: 12px; margin: 5px 0;">© 2024 Apna School - Digital Education Platform</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0;">For support: <a href="mailto:apnaschooledu@gmail.com" style="color: #ff6b35;">apnaschooledu@gmail.com</a></p>
          </div>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error.message);
    // Return error info instead of throwing
    return { success: false, error: error.message };
  }
};

export const sendEmailChangeOTP = async (email, otp, schoolName) => {
  const transporter = createTransporter();
  if (!transporter) {
    console.error('Cannot send email change OTP - email service not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const mailOptions = {
    from: `"Apna School" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your New Email - Apna School',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #7c3aed; margin: 0; font-size: 28px;">Apna School</h1>
            <p style="color: #666; margin: 5px 0;">School Management System</p>
          </div>
          <h2 style="color: #7c3aed; margin-bottom: 20px;">Verify New Email Address</h2>
          <p style="color: #333; line-height: 1.6;">A request was made to change the email for <strong>${schoolName}</strong>.</p>
          <p style="color: #333; line-height: 1.6;">Your verification OTP is:</p>
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
            <div style="background-color: white; padding: 15px; border-radius: 5px; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #7c3aed;">${otp}</span>
            </div>
          </div>
          <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <p style="margin: 0; color: #856404;"><strong>⏰ This OTP will expire in 10 minutes.</strong></p>
          </div>
          <p style="color: #666; font-size: 14px;">If you didn't request this change, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          <div style="text-align: center;">
            <p style="color: #999; font-size: 12px;">© 2024 Apna School - Digital Education Platform</p>
          </div>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email change OTP:', error.message);
    return { success: false, error: error.message };
  }
};

export default {
  sendVerificationEmail,
  sendSchoolRegistrationOTP,
  sendPasswordResetEmail,
  sendEmailChangeOTP
};
