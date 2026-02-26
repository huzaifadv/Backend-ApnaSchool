import crypto from 'crypto';
import Student from '../models/Student.js';

/**
 * Generate a unique 8-character alphanumeric parent access code
 * Ensures collision-proof by checking against existing codes
 */
export const generateParentAccessCode = async (schoolId) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const codeLength = 8;
  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Generate random code
    code = '';
    const randomBytes = crypto.randomBytes(codeLength);

    for (let i = 0; i < codeLength; i++) {
      const randomIndex = randomBytes[i] % characters.length;
      code += characters[randomIndex];
    }

    // Check if code already exists for this school
    const existingStudent = await Student.findOne({
      schoolId,
      parentAccessCode: code
    });

    if (!existingStudent) {
      isUnique = true;
    }

    attempts++;
  }

  if (!isUnique) {
    throw new Error('Failed to generate unique access code. Please try again.');
  }

  return code;
};
