import { getModel } from '../models/dynamicModels.js';

// @desc    Create a new academic year
// @route   POST /api/admin/academic-years
// @access  Private (Admin only)
export const createAcademicYear = async (req, res) => {
  try {
    const { year, startDate, endDate, description } = req.body;
    const schoolId = req.schoolId;

    // Get tenant model
    const AcademicYear = await getModel(schoolId, 'academicyears');

    // Check if academic year already exists
    const existingYear = await AcademicYear.findOne({ year });
    if (existingYear) {
      return res.status(400).json({
        success: false,
        message: 'Academic year already exists'
      });
    }

    const hasCurrent = await AcademicYear.findOne({ isCurrent: true });

    // Create academic year
    const academicYear = await AcademicYear.create({
      year,
      startDate,
      endDate,
      description,
      isActive: true,
      isCurrent: !hasCurrent
    });

    res.status(201).json({
      success: true,
      message: 'Academic year created successfully',
      data: academicYear
    });
  } catch (error) {
    console.error('Error creating academic year:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create academic year'
    });
  }
};

// @desc    Get all academic years
// @route   GET /api/admin/academic-years
// @access  Private (Admin only)
export const getAcademicYears = async (req, res) => {
  try {
    const schoolId = req.schoolId;

    // Get tenant model
    const AcademicYear = await getModel(schoolId, 'academicyears');
    const { isActive, isCurrent } = req.query;

    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (isCurrent !== undefined) filter.isCurrent = isCurrent === 'true';

    const academicYears = await AcademicYear.find(filter).sort({ startDate: -1 });

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

// @desc    Get academic year by ID
// @route   GET /api/admin/academic-years/:id
// @access  Private (Admin only)
export const getAcademicYearById = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { id } = req.params;

    // Get tenant model
    const AcademicYear = await getModel(schoolId, 'academicyears');

    const academicYear = await AcademicYear.findById(id);

    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: 'Academic year not found'
      });
    }

    res.status(200).json({
      success: true,
      data: academicYear
    });
  } catch (error) {
    console.error('Error fetching academic year:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch academic year'
    });
  }
};

// @desc    Get current academic year
// @route   GET /api/admin/academic-years/current/active
// @access  Private (Admin only)
export const getCurrentAcademicYear = async (req, res) => {
  try {
    const schoolId = req.schoolId;

    // Get tenant model
    const AcademicYear = await getModel(schoolId, 'academicyears');

    const currentYear = await AcademicYear.findOne({ isCurrent: true });

    if (!currentYear) {
      return res.status(404).json({
        success: false,
        message: 'No current academic year set. Please activate an academic year.'
      });
    }

    res.status(200).json({
      success: true,
      data: currentYear
    });
  } catch (error) {
    console.error('Error fetching current academic year:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch current academic year'
    });
  }
};

// @desc    Update academic year
// @route   PUT /api/admin/academic-years/:id
// @access  Private (Admin only)
export const updateAcademicYear = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { id } = req.params;
    const { year, startDate, endDate, description, isActive } = req.body;

    // Get tenant model
    const AcademicYear = await getModel(schoolId, 'academicyears');

    const academicYear = await AcademicYear.findById(id);

    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: 'Academic year not found'
      });
    }

    // Update fields
    if (year) academicYear.year = year;
    if (startDate) academicYear.startDate = startDate;
    if (endDate) academicYear.endDate = endDate;
    if (description !== undefined) academicYear.description = description;
    if (isActive !== undefined) academicYear.isActive = isActive;

    await academicYear.save();

    res.status(200).json({
      success: true,
      message: 'Academic year updated successfully',
      data: academicYear
    });
  } catch (error) {
    console.error('Error updating academic year:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update academic year'
    });
  }
};

// @desc    Set current academic year (activate)
// @route   PUT /api/admin/academic-years/:id/set-current
// @access  Private (Admin only)
export const setCurrentAcademicYear = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { id } = req.params;

    // Get tenant model
    const AcademicYear = await getModel(schoolId, 'academicyears');

    // Check if academic year exists
    const academicYear = await AcademicYear.findById(id);

    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: 'Academic year not found'
      });
    }

    // Deactivate all other years as current
    await AcademicYear.updateMany(
      { isCurrent: true },
      { $set: { isCurrent: false } }
    );

    // Set this year as current
    academicYear.isCurrent = true;
    academicYear.isActive = true;
    await academicYear.save();

    res.status(200).json({
      success: true,
      message: 'Academic year set as current successfully',
      data: academicYear
    });
  } catch (error) {
    console.error('Error setting current academic year:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to set current academic year'
    });
  }
};

// @desc    Delete academic year
// @route   DELETE /api/admin/academic-years/:id
// @access  Private (Admin only)
export const deleteAcademicYear = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { id } = req.params;

    // Get tenant model
    const AcademicYear = await getModel(schoolId, 'academicyears');

    const academicYear = await AcademicYear.findById(id);

    if (!academicYear) {
      return res.status(404).json({
        success: false,
        message: 'Academic year not found'
      });
    }

    // Prevent deletion if it's the current academic year
    if (academicYear.isCurrent) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the current academic year. Please set another year as current first.'
      });
    }

    await academicYear.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Academic year deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting academic year:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete academic year'
    });
  }
};
