import jwt from 'jsonwebtoken';
import SuperAdmin from '../models/SuperAdmin.js';

/**
 * Middleware to protect Super Admin routes
 * Verifies JWT token and checks for SUPER_ADMIN role
 */
const superAdminAuth = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No authentication token provided.',
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired. Please login again.',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Authentication failed.',
      });
    }

    // Check if token is for Super Admin (not regular admin/parent)
    if (decoded.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden. Super Admin privileges required.',
      });
    }

    // Fetch Super Admin from database
    const superAdmin = await SuperAdmin.findById(decoded.id);

    if (!superAdmin) {
      return res.status(401).json({
        success: false,
        message: 'Super Admin not found. Invalid token.',
      });
    }

    // Check if Super Admin is active
    if (!superAdmin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Super Admin account is deactivated.',
      });
    }

    // Check if account is locked
    if (superAdmin.isLocked()) {
      return res.status(423).json({
        success: false,
        message: 'Account is locked due to multiple failed login attempts. Please try again later.',
      });
    }

    // Attach Super Admin to request object
    req.superAdmin = {
      id: superAdmin._id,
      name: superAdmin.name,
      email: superAdmin.email,
      role: superAdmin.role,
    };

    next();
  } catch (error) {
    console.error('Super Admin Auth Middleware Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.',
    });
  }
};

/**
 * Optional middleware to check if Super Admin exists
 * Used for setup/initialization routes
 */
const checkSuperAdminExists = async (req, res, next) => {
  try {
    const count = await SuperAdmin.countDocuments();
    req.superAdminExists = count > 0;
    next();
  } catch (error) {
    console.error('Check Super Admin Exists Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking Super Admin status.',
    });
  }
};

export {
  superAdminAuth,
  checkSuperAdminExists,
};
