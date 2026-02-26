import crypto from 'crypto';

/**
 * Production-Ready OTP Service
 * - Generates secure 6-digit OTPs
 * - Hashes OTPs before storage
 * - Verifies OTPs with timing-safe comparison
 * - Handles expiry and rate limiting
 */

// OTP Configuration
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 3;

/**
 * Generate a secure 6-digit OTP
 * @returns {string} 6-digit OTP
 */
export const generateOTP = () => {
  // Use crypto for better randomness
  const buffer = crypto.randomBytes(3);
  const otp = parseInt(buffer.toString('hex'), 16) % 1000000;
  return otp.toString().padStart(OTP_LENGTH, '0');
};

/**
 * Hash OTP using SHA-256
 * @param {string} otp - Plain OTP
 * @returns {string} Hashed OTP
 */
export const hashOTP = (otp) => {
  return crypto
    .createHash('sha256')
    .update(otp.toString())
    .digest('hex');
};

/**
 * Verify OTP with timing-safe comparison
 * @param {string} plainOTP - User-provided OTP
 * @param {string} hashedOTP - Stored hashed OTP
 * @returns {boolean} True if OTP matches
 */
export const verifyOTP = (plainOTP, hashedOTP) => {
  if (!plainOTP || !hashedOTP) return false;

  const hashedInput = hashOTP(plainOTP);

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hashedInput),
      Buffer.from(hashedOTP)
    );
  } catch (error) {
    return false;
  }
};

/**
 * Get OTP expiry timestamp
 * @param {number} minutes - Expiry duration in minutes (default: 10)
 * @returns {Date} Expiry timestamp
 */
export const getOTPExpiry = (minutes = OTP_EXPIRY_MINUTES) => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

/**
 * Check if OTP has expired
 * @param {Date} expiryDate - OTP expiry timestamp
 * @returns {boolean} True if expired
 */
export const isOTPExpired = (expiryDate) => {
  return !expiryDate || new Date() > new Date(expiryDate);
};

/**
 * Check rate limiting for OTP requests
 * @param {Date} lastRequest - Last OTP request timestamp
 * @param {number} attempts - Number of recent attempts
 * @returns {object} Rate limit check result
 */
export const checkRateLimit = (lastRequest, attempts = 0) => {
  const now = Date.now();
  const lastRequestTime = lastRequest ? new Date(lastRequest).getTime() : 0;
  const timeSinceLastRequest = now - lastRequestTime;

  // Check if within rate limit window
  if (timeSinceLastRequest < RATE_LIMIT_WINDOW) {
    if (attempts >= MAX_REQUESTS_PER_WINDOW) {
      const remainingTime = Math.ceil((RATE_LIMIT_WINDOW - timeSinceLastRequest) / 1000);
      return {
        allowed: false,
        message: `Too many requests. Please try again in ${remainingTime} seconds.`,
        retryAfter: remainingTime
      };
    }
  }

  return {
    allowed: true,
    message: 'Request allowed'
  };
};

/**
 * Validate OTP attempts
 * @param {number} attempts - Current attempt count
 * @returns {object} Validation result
 */
export const validateAttempts = (attempts = 0) => {
  if (attempts >= MAX_ATTEMPTS) {
    return {
      valid: false,
      message: 'Maximum verification attempts exceeded. Please request a new OTP.'
    };
  }

  return {
    valid: true,
    remainingAttempts: MAX_ATTEMPTS - attempts
  };
};

/**
 * Create OTP data for storage
 * @param {string} otp - Plain OTP
 * @returns {object} OTP data to store in database
 */
export const createOTPData = (otp) => {
  return {
    hashedOTP: hashOTP(otp),
    expiry: getOTPExpiry(),
    createdAt: new Date()
  };
};

/**
 * Clear OTP data (after successful verification)
 * @returns {object} Fields to clear
 */
export const clearOTPData = () => {
  return {
    $unset: {
      emailVerificationOTP: 1,
      emailVerificationExpires: 1
    },
    $set: {
      emailVerificationAttempts: 0
    }
  };
};

/**
 * Clear password reset data (after successful reset)
 * @returns {object} Fields to clear
 */
export const clearResetData = () => {
  return {
    $unset: {
      resetPasswordOTP: 1,
      resetPasswordExpires: 1
    },
    $set: {
      resetPasswordAttempts: 0
    }
  };
};

export default {
  generateOTP,
  hashOTP,
  verifyOTP,
  getOTPExpiry,
  isOTPExpired,
  checkRateLimit,
  validateAttempts,
  createOTPData,
  clearOTPData,
  clearResetData
};
