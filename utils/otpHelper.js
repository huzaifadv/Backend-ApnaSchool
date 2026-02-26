import crypto from 'crypto';

/**
 * OTP Helper Utility
 * Handles OTP generation and hashing for email verification and password reset
 */

/**
 * Generate 6-digit OTP
 * @returns {String} 6-digit OTP
 */
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Hash OTP using SHA256
 * @param {String} otp - Plain OTP to hash
 * @returns {String} Hashed OTP
 */
export const hashOTP = (otp) => {
  return crypto.createHash('sha256').update(otp).digest('hex');
};

/**
 * Verify OTP against hashed version
 * @param {String} plainOTP - Plain OTP from user input
 * @param {String} hashedOTP - Stored hashed OTP
 * @returns {Boolean} True if OTP matches
 */
export const verifyOTP = (plainOTP, hashedOTP) => {
  const hashedInput = hashOTP(plainOTP);
  return hashedInput === hashedOTP;
};

/**
 * Get OTP expiry time (10 minutes from now)
 * @returns {Date} Expiry date
 */
export const getOTPExpiry = () => {
  return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
};

export default {
  generateOTP,
  hashOTP,
  verifyOTP,
  getOTPExpiry
};
