/**
 * Middleware to validate that an academic year exists for the school
 * Required before allowing class/student creation
 */

import { getModel } from '../models/dynamicModels.js';

/**
 * @desc    Check if academic year exists for the school
 * @access  Private (Admin only)
 */
export const validateAcademicYearExists = async (req, res, next) => {
  try {
    const schoolId = req.schoolId;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School ID is required'
      });
    }

    // Get AcademicYear model from tenant database
    const AcademicYear = await getModel(schoolId, 'academicyears');

    // Check if at least one academic year exists
    const academicYearExists = await AcademicYear.findOne();

    if (!academicYearExists) {
      return res.status(400).json({
        success: false,
        message: 'Please create an academic year first before adding classes or students. Go to Academic Year section to create one.',
        code: 'NO_ACADEMIC_YEAR',
        requiresAcademicYear: true
      });
    }

    // Store in request for later use
    req.academicYearExists = true;
    next();
  } catch (error) {
    console.error('Error validating academic year:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to validate academic year'
    });
  }
};

/**
 * @desc    Get all academic years for the school (for dropdowns)
 * @access  Private (Admin only)
 */
export const getAcademicYearsForDropdown = async (req, res) => {
  try {
    const schoolId = req.schoolId;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School ID is required'
      });
    }

    // Get AcademicYear model from tenant database
    const AcademicYear = await getModel(schoolId, 'academicyears');

    // Get all active academic years
    const academicYears = await AcademicYear.find({ isActive: true })
      .sort({ startDate: -1 })
      .select('_id year isCurrent isActive');

    res.status(200).json({
      success: true,
      count: academicYears.length,
      data: academicYears
    });
  } catch (error) {
    console.error('Error fetching academic years:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch academic years'
    });
  }
};
