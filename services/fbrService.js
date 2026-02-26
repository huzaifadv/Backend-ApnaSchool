import axios from 'axios';
import { decrypt } from '../utils/encryption.js';

/**
 * FBR POS Integration Service
 * Handles all communication with FBR API
 */

/**
 * Generate unique USIN (Universal Sale Invoice Number)
 * Format: SCHOOLID_TIMESTAMP_RANDOM
 * @param {string} schoolId - School MongoDB ID
 * @returns {string} - Unique invoice number
 */
export const generateUSIN = (schoolId) => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const shortSchoolId = schoolId.toString().slice(-8); // Last 8 chars of schoolId

  return `${shortSchoolId}_${timestamp}_${random}`;
};

/**
 * Prepare FBR transaction payload
 * @param {Object} params - Transaction parameters
 * @param {string} params.posId - POS ID from school config
 * @param {string} params.usin - Unique invoice number
 * @param {number} params.amount - Total bill amount
 * @param {string} params.studentName - Student name (optional)
 * @returns {Object} - FBR API payload
 */
export const prepareFBRPayload = ({ posId, usin, amount, studentName = 'Student' }) => {
  const now = new Date();

  // Format: YYYYMMDD HHMMSS (FBR format)
  const dateTime = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    ' ' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');

  return {
    POSID: posId,
    USIN: usin,
    DateTime: dateTime,
    TotalBillAmount: Number(amount).toFixed(2),
    TotalQuantity: 1,
    PaymentMode: 1, // 1 = Cash, 2 = Card, 3 = Online
    Items: [
      {
        ItemCode: 'FEE',
        ItemName: `School Fee - ${studentName}`,
        PCTCode: '9812.1100', // Education services PCT code
        Quantity: 1,
        TaxRate: 0, // Education is usually tax-exempt
        TotalAmount: Number(amount).toFixed(2)
      }
    ]
  };
};

/**
 * Call FBR API to report transaction
 * @param {Object} school - School document with fbrConfig
 * @param {Object} transactionData - Transaction details
 * @param {number} transactionData.amount - Fee amount
 * @param {string} transactionData.studentName - Student name
 * @returns {Object} - FBR API response with status
 */
export const reportToFBR = async (school, transactionData) => {
  try {
    // Validate school FBR configuration
    if (!school.fbrEnabled) {
      return {
        success: false,
        status: 'Failed',
        error: 'FBR integration is not enabled for this school'
      };
    }

    const { apiUrl, posId, token } = school.fbrConfig || {};

    if (!apiUrl || !posId || !token) {
      return {
        success: false,
        status: 'Failed',
        error: 'FBR configuration is incomplete. Please configure all required fields.'
      };
    }

    // Decrypt the API token
    let decryptedToken;
    try {
      decryptedToken = decrypt(token);
    } catch (error) {
      return {
        success: false,
        status: 'Failed',
        error: 'Failed to decrypt FBR token. Please reconfigure FBR settings.'
      };
    }

    // Generate unique invoice number
    const usin = generateUSIN(school._id);

    // Prepare FBR payload
    const payload = prepareFBRPayload({
      posId,
      usin,
      amount: transactionData.amount,
      studentName: transactionData.studentName
    });

    // Call FBR API
    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${decryptedToken}`
      },
      timeout: 15000 // 15 seconds timeout
    });

    // Check response status
    if (response.data && response.data.InvoiceNumber) {
      return {
        success: true,
        status: 'Success',
        invoiceNumber: response.data.InvoiceNumber,
        qrCodeString: response.data.QRCode || null,
        usin: usin,
        fullResponse: response.data,
        syncDateTime: new Date()
      };
    } else {
      return {
        success: false,
        status: 'Failed',
        error: 'FBR API returned invalid response',
        fullResponse: response.data,
        syncDateTime: new Date()
      };
    }

  } catch (error) {
    console.error('FBR API Error:', error.message);

    // Handle different error types
    let errorMessage = 'Failed to connect to FBR service';

    if (error.response) {
      // FBR API returned an error
      errorMessage = error.response.data?.message || error.response.data?.error || 'FBR API error';

      return {
        success: false,
        status: 'Failed',
        error: errorMessage,
        fullResponse: error.response.data,
        syncDateTime: new Date()
      };
    } else if (error.request) {
      // Request made but no response
      errorMessage = 'No response from FBR server. Please check your internet connection.';
    } else {
      // Error in setting up request
      errorMessage = error.message;
    }

    return {
      success: false,
      status: 'Failed',
      error: errorMessage,
      syncDateTime: new Date()
    };
  }
};

/**
 * Test FBR API connection with dummy data
 * Used for testing credentials before going live
 * @param {Object} config - FBR configuration
 * @param {string} config.apiUrl - FBR API URL
 * @param {string} config.posId - POS ID
 * @param {string} config.token - API Token (encrypted)
 * @returns {Object} - Test result
 */
export const testFBRConnection = async (config) => {
  try {
    const { apiUrl, posId, token } = config;

    if (!apiUrl || !posId || !token) {
      return {
        success: false,
        error: 'All FBR configuration fields are required'
      };
    }

    // Decrypt token
    let decryptedToken;
    try {
      decryptedToken = decrypt(token);
    } catch (error) {
      return {
        success: false,
        error: 'Failed to decrypt token. Invalid encryption format.'
      };
    }

    // Generate test USIN
    const testUsin = `TEST_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Prepare test payload
    const payload = prepareFBRPayload({
      posId,
      usin: testUsin,
      amount: 1.00, // Test with 1 PKR
      studentName: 'Test Student'
    });

    // Call FBR API
    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${decryptedToken}`
      },
      timeout: 15000
    });

    if (response.data && response.data.InvoiceNumber) {
      return {
        success: true,
        message: 'FBR connection successful!',
        invoiceNumber: response.data.InvoiceNumber,
        response: response.data
      };
    } else {
      return {
        success: false,
        error: 'Invalid response from FBR API',
        response: response.data
      };
    }

  } catch (error) {
    console.error('FBR Test Connection Error:', error.message);

    let errorMessage = 'Connection failed';

    if (error.response) {
      errorMessage = error.response.data?.message || error.response.data?.error || 'FBR API returned an error';

      return {
        success: false,
        error: errorMessage,
        statusCode: error.response.status,
        response: error.response.data
      };
    } else if (error.request) {
      errorMessage = 'No response from FBR server. Please check API URL and internet connection.';
    } else {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage
    };
  }
};
