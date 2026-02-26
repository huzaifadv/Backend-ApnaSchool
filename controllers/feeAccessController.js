// Fee access verification removed - direct access granted

// @desc    Request fee section access (disabled - direct access)
// @route   POST /api/admin/fee-access/request
// @access  Private (Admin only)
export const requestFeeAccess = async (req, res) => {
  res.status(200).json({
    success: true,
    alreadyVerified: true,
    message: 'Access granted.',
    accessExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  });
};

// @desc    Verify code (disabled - direct access)
// @route   POST /api/admin/fee-access/verify
// @access  Private (Admin only)
export const verifyFeeAccess = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Access granted successfully',
    accessExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    validFor: '365 days'
  });
};

// @desc    Check if admin has valid fee section access (always true)
// @route   GET /api/admin/fee-access/check
// @access  Private (Admin only)
export const checkFeeAccess = async (req, res) => {
  res.status(200).json({
    success: true,
    hasAccess: true,
    hoursLeft: 8760,
    message: 'Access granted'
  });
};
