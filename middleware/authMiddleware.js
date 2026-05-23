import jwt from 'jsonwebtoken';
import { getModel } from '../models/dynamicModels.js';
import BranchAdminAccess from '../models/BranchAdminAccess.js';

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

      if (decoded.accessId && !decoded.branchId) {
        return res.status(400).json({
          success: false,
          message: 'Branch selection required'
        });
      }

      if (decoded.accessId) {
        const access = await BranchAdminAccess.findById(decoded.accessId);
        if (!access || !access.isActive) {
          return res.status(401).json({
            success: false,
            message: 'Not authorized, access revoked'
          });
        }
        req.adminAccess = access;
      }

      if (decoded.accessId && !decoded.branchId) {
        return res.status(400).json({
          success: false,
          message: 'Branch selection required'
        });
      }

      if (decoded.accessId) {
        const access = await BranchAdminAccess.findById(decoded.accessId);
        if (!access || !access.isActive) {
          return res.status(401).json({
            success: false,
            message: 'Not authorized, access revoked'
          });
        }
        req.adminAccess = access;
      }

      // Attach schoolId to request first (needed to get tenant model)
      if (decoded.branchId) {
        req.mainSchoolId = decoded.schoolId;
        req.schoolId = decoded.branchId;
      } else {
        req.schoolId = decoded.schoolId;
      }

      // Get Admin model from tenant database
      const Admin = await getModel(req.schoolId, 'admins');

      // Get admin from tenant database (exclude password)
      if (decoded.adminDbId) {
        req.admin = await Admin.findById(decoded.adminDbId).select('-password');
      } else {
        req.admin = await Admin.findById(decoded.id).select('-password');
      }

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
      if (decoded.branchId) {
        req.mainSchoolId = decoded.schoolId;
        req.schoolId = decoded.branchId;
      } else {
        req.schoolId = decoded.schoolId;
      }

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
        const Admin = await getModel(req.schoolId, 'admins');
        if (decoded.adminDbId) {
          req.admin = await Admin.findById(decoded.adminDbId).select('-password');
        } else {
          req.admin = await Admin.findById(decoded.id).select('-password');
        }

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

// Protect routes using admin access token (before branch selection)
export const protectAdminAccess = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.type !== 'admin' || !decoded.accessId) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized, invalid token type'
        });
      }

      const access = await BranchAdminAccess.findById(decoded.accessId);
      if (!access || !access.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized, access revoked'
        });
      }

      req.adminAccess = access;
      req.schoolId = decoded.schoolId;
      req.mainSchoolId = decoded.schoolId;
      req.userType = 'admin';

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

export const authorizeAdminAccess = (...roles) => {
  return (req, res, next) => {
    if (!req.adminAccess || !roles.includes(req.adminAccess.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.adminAccess?.role}' is not authorized to access this route`
      });
    }
    next();
  };
};
