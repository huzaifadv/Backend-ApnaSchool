import School from '../models/School.js';
import { encrypt, decrypt, isEncrypted } from '../utils/encryption.js';
import { testFBRConnection } from '../services/fbrService.js';

/**
 * FBR Configuration Controller
 * Handles School Admin FBR configuration and testing
 */

/**
 * @desc    Get school's FBR configuration
 * @route   GET /api/admin/fbr/config
 * @access  Private (School Admin)
 */
export const getFBRConfig = async (req, res) => {
  try {
    const schoolId = req.schoolId; // From auth middleware (protect sets req.schoolId)

    const school = await School.findById(schoolId).select('fbrEnabled fbrConfig');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Never return the encrypted token to frontend
    const configResponse = {
      fbrEnabled: school.fbrEnabled,
      apiUrl: school.fbrConfig?.apiUrl || '',
      posId: school.fbrConfig?.posId || '',
      registrationNumber: school.fbrConfig?.registrationNumber || '',
      hasToken: !!school.fbrConfig?.token, // Just indicate if token exists
      isConfigured: !!(
        school.fbrConfig?.apiUrl &&
        school.fbrConfig?.posId &&
        school.fbrConfig?.token &&
        school.fbrConfig?.registrationNumber
      )
    };

    res.status(200).json({
      success: true,
      data: configResponse
    });

  } catch (error) {
    console.error('Get FBR Config Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching FBR configuration',
      error: error.message
    });
  }
};

/**
 * @desc    Update school's FBR configuration
 * @route   PUT /api/admin/fbr/config
 * @access  Private (School Admin)
 */
export const updateFBRConfig = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const { apiUrl, posId, token, registrationNumber } = req.body;

    // Validate required fields
    if (!apiUrl || !posId || !registrationNumber) {
      return res.status(400).json({
        success: false,
        message: 'API URL, POS ID, and Registration Number are required'
      });
    }

    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Check if Super Admin has enabled FBR for this school
    if (!school.fbrEnabled) {
      return res.status(403).json({
        success: false,
        message: 'FBR integration is not enabled for your school. Please contact Super Admin.'
      });
    }

    // Initialize fbrConfig if it doesn't exist
    if (!school.fbrConfig) {
      school.fbrConfig = {};
    }

    // Update configuration
    school.fbrConfig.apiUrl = apiUrl.trim();
    school.fbrConfig.posId = posId.trim();
    school.fbrConfig.registrationNumber = registrationNumber.trim();

    // Only update token if provided (to allow updating other fields without changing token)
    if (token && token.trim()) {
      // Encrypt the token before saving
      try {
        school.fbrConfig.token = encrypt(token.trim());
      } catch (encryptError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to encrypt API token',
          error: encryptError.message
        });
      }
    }

    await school.save();

    console.log(`FBR Configuration updated for school: ${school.schoolName}`);

    res.status(200).json({
      success: true,
      message: 'FBR configuration updated successfully',
      data: {
        apiUrl: school.fbrConfig.apiUrl,
        posId: school.fbrConfig.posId,
        registrationNumber: school.fbrConfig.registrationNumber,
        hasToken: !!school.fbrConfig.token,
        isConfigured: true
      }
    });

  } catch (error) {
    console.error('Update FBR Config Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating FBR configuration',
      error: error.message
    });
  }
};

/**
 * @desc    Test FBR API connection
 * @route   POST /api/admin/fbr/test
 * @access  Private (School Admin)
 */
export const testFBRAPI = async (req, res) => {
  try {
    const schoolId = req.schoolId;

    const school = await School.findById(schoolId).select('schoolName fbrEnabled fbrConfig');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Check if FBR is enabled
    if (!school.fbrEnabled) {
      return res.status(403).json({
        success: false,
        message: 'FBR integration is not enabled for your school'
      });
    }

    // Check if configuration is complete
    const { apiUrl, posId, token, registrationNumber } = school.fbrConfig || {};

    if (!apiUrl || !posId || !token || !registrationNumber) {
      return res.status(400).json({
        success: false,
        message: 'FBR configuration is incomplete. Please configure all required fields.'
      });
    }

    // Test the connection using the service
    const testResult = await testFBRConnection({
      apiUrl,
      posId,
      token, // Already encrypted in database
      registrationNumber
    });

    if (testResult.success) {
      res.status(200).json({
        success: true,
        message: 'FBR connection test successful!',
        data: {
          invoiceNumber: testResult.invoiceNumber,
          testedAt: new Date()
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'FBR connection test failed',
        error: testResult.error,
        statusCode: testResult.statusCode
      });
    }

  } catch (error) {
    console.error('Test FBR API Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error testing FBR connection',
      error: error.message
    });
  }
};

/**
 * @desc    Check FBR status (enabled and configured)
 * @route   GET /api/admin/fbr/status
 * @access  Private (School Admin)
 */
export const getFBRStatus = async (req, res) => {
  try {
    const schoolId = req.schoolId;

    const school = await School.findById(schoolId).select('fbrEnabled fbrConfig schoolName');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    const isConfigured = !!(
      school.fbrConfig?.apiUrl &&
      school.fbrConfig?.posId &&
      school.fbrConfig?.token &&
      school.fbrConfig?.registrationNumber
    );

    res.status(200).json({
      success: true,
      data: {
        fbrEnabled: school.fbrEnabled,
        isConfigured: isConfigured,
        canUseFBR: school.fbrEnabled && isConfigured,
        schoolName: school.schoolName
      }
    });

  } catch (error) {
    console.error('Get FBR Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching FBR status',
      error: error.message
    });
  }
};
