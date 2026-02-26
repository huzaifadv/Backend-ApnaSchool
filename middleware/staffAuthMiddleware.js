/**
 * Staff Authentication Middleware
 *
 * SAFE EXTENSION — This file is entirely new.
 * It does NOT import from or modify authMiddleware.js.
 * It uses the same JWT_SECRET but a different token payload shape
 * (portal: 'staff') so tokens are non-interchangeable with admin/parent tokens.
 */

import jwt from 'jsonwebtoken';
import { getModel } from '../models/dynamicModels.js';

/**
 * @desc  Protect staff portal routes.
 *        Verifies that the Bearer token:
 *          1. Is a valid JWT signed with JWT_SECRET
 *          2. Has portal === 'staff'  (blocks admin/parent tokens from being reused)
 *          3. Belongs to an active staff member in the tenant DB
 *
 * Attaches to req:
 *   req.staff      — staff document (without password)
 *   req.staffDbId  — staff Mongoose _id (ObjectId)
 *   req.schoolId   — school ObjectId (for all downstream getModel calls)
 */
export const protectStaff = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // ── Portal guard — reject admin / parent tokens outright ──────────
      if (decoded.portal !== 'staff') {
        return res.status(401).json({
          success: false,
          message: 'Not authorized, invalid token type'
        });
      }

      // ── Attach schoolId for tenant DB lookups ─────────────────────────
      req.schoolId = decoded.schoolId;

      // ── Load staff from tenant DB (password excluded by schema select:false) ─
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

      req.staff     = staff;
      req.staffDbId = staff._id;

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

/**
 * @desc  Role-based access for staff portal routes.
 *        Usage:  authorizeStaff('teacher', 'coordinator')
 */
export const authorizeStaff = (...roles) => {
  return (req, res, next) => {
    if (!req.staff || !roles.includes(req.staff.role)) {
      return res.status(403).json({
        success: false,
        message: `Staff role '${req.staff?.role}' is not authorized to access this route`
      });
    }
    next();
  };
};

/**
 * @desc  Ownership guard — ensures a staff member can only touch their OWN records.
 *        Use as a helper inside controllers, not as standalone middleware,
 *        because the resource ID to compare is context-dependent.
 *
 * @param {ObjectId|String} resourceStaffId  — staffId stored on the resource document
 * @param {Object}          req              — Express request
 * @returns {Boolean}
 */
export const isOwner = (resourceStaffId, req) => {
  return resourceStaffId.toString() === req.staffDbId.toString();
};
