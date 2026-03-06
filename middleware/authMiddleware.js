import jwt from 'jsonwebtoken';
import { getModel } from '../models/dynamicModels.js';

// Protect routes - verify JWT token (multi-tenant aware)
export const protect = async (req, res, next) => {
  let token;

  // Check if token exists in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach schoolId to request first (needed to get tenant model)
      req.schoolId = decoded.schoolId;

      // Get Admin model from tenant database
      const Admin = await getModel(decoded.schoolId, 'admins');

      // Get admin from tenant database (exclude password)
      req.admin = await Admin.findById(decoded.id).select('-password');

      if (!req.admin) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized, admin not found'
        });
      }

      // Check if admin is active
      if (!req.admin.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token'
    });
  }
};

// Check if user has required role
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.admin.role}' is not authorized to access this route`
      });
    }
    next();
  };
};

// Protect parent routes - verify parent JWT token
export const protectParent = async (req, res, next) => {
  let token;

  // Check if token exists in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if token is for parent
      if (decoded.type !== 'parent') {
        return res.status(401).json({
          success: false,
          message: 'Not authorized, invalid token type'
        });
      }

      // Attach studentId and schoolId to request
      req.studentId = decoded.studentId;
      req.schoolId = decoded.schoolId;
      req.parentName = decoded.parentName;

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token'
    });
  }
};

// Protect routes - accepts BOTH admin and staff tokens
// This is useful for routes that should be accessible by both admin and staff
export const protectAdminOrStaff = async (req, res, next) => {
  let token;

  // Check if token exists in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach schoolId to request first (needed to get tenant model)
      req.schoolId = decoded.schoolId;

      // Check if this is a staff token (portal: 'staff')
      if (decoded.portal === 'staff') {
        // Staff token authentication
        const Staff = await getModel(decoded.schoolId, 'staffs');
        const staff = await Staff.findById(decoded.staffDbId);

        if (!staff) {
          return res.status(401).json({
            success: false,
            message: 'Not authorized, staff not found'
          });
        }

        if (!staff.isActive || staff.status === 'inactive') {
          return res.status(401).json({
            success: false,
            message: 'Account is deactivated'
          });
        }

        req.staff = staff;
        req.staffDbId = staff._id;
        req.userType = 'staff'; // Mark as staff request
      } else {
        // Admin token authentication
        const Admin = await getModel(decoded.schoolId, 'admins');
        req.admin = await Admin.findById(decoded.id).select('-password');

        if (!req.admin) {
          return res.status(401).json({
            success: false,
            message: 'Not authorized, admin not found'
          });
        }

        if (!req.admin.isActive) {
          return res.status(401).json({
            success: false,
            message: 'Account is deactivated'
          });
        }

        req.userType = 'admin'; // Mark as admin request
      }

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token'
    });
  }
};
