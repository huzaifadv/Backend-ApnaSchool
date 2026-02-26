import crypto from 'crypto';

/**
 * Encryption Utility for FBR Token Security
 * Uses AES-256-CBC encryption with environment-based secret key
 */

// Use environment variable or fallback (MUST set in production)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-32-char-secret-key-change-in-prod!';
const IV_LENGTH = 16; // For AES, this is always 16

/**
 * Ensure the encryption key is exactly 32 bytes for AES-256
 */
const getEncryptionKey = () => {
  // If key is less than 32 chars, pad it; if more, truncate it
  const key = Buffer.from(ENCRYPTION_KEY);
  const keyBuffer = Buffer.alloc(32);
  key.copy(keyBuffer, 0, 0, Math.min(key.length, 32));
  return keyBuffer;
};

/**
 * Encrypt a text value (like FBR API token)
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text in format: iv:encryptedData
 */
export const encrypt = (text) => {
  if (!text) return null;

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV and encrypted data separated by ':'
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt an encrypted text value
 * @param {string} encryptedText - Encrypted text in format: iv:encryptedData
 * @returns {string} - Decrypted plain text
 */
export const decrypt = (encryptedText) => {
  if (!encryptedText) return null;

  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Check if a value is encrypted
 * @param {string} value - Value to check
 * @returns {boolean} - True if value appears to be encrypted
 */
export const isEncrypted = (value) => {
  if (!value || typeof value !== 'string') return false;

  // Check if it matches the format: hexIV:hexEncryptedData
  const parts = value.split(':');
  if (parts.length !== 2) return false;

  // Check if both parts are valid hex strings
  const hexRegex = /^[0-9a-fA-F]+$/;
  return hexRegex.test(parts[0]) && hexRegex.test(parts[1]) && parts[0].length === 32; // IV is 16 bytes = 32 hex chars
};
