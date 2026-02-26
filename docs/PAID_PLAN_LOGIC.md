# Paid Plan Logic Documentation

## Overview
This document describes the implementation of the paid plan approval workflow for ApnaSchool. When schools select Monthly, Yearly, or 5-Year plans, they must wait for Super Admin approval before accessing the system.

## Plan Types

### Trial Plan (7_DAYS_FREE_TRIAL)
- **planType**: `trial`
- **approvalStatus**: `pending` → Auto-approved after email verification
- **accountStatus**: `inactive` → `active` after email verification
- **Access**: Granted after email verification
- **Duration**: 7 days

### Paid Plans (MONTHLY, YEARLY, FIVE_YEAR)
- **planType**: `paid`
- **approvalStatus**: `pending` → `approved` (by Super Admin)
- **accountStatus**: `inactive` → `active` (by Super Admin)
- **Access**: Granted ONLY after Super Admin approval
- **Duration**:
  - Monthly: 30 days
  - Yearly: 365 days
  - 5-Year: 1825 days

## School Registration Flow

### 1. User Fills Registration Form
Frontend collects:
- School details (name, address, city, state, phone, email)
- Admin details (name, phone, password)
- **Plan selection** (7_DAYS_FREE_TRIAL, MONTHLY, YEARLY, FIVE_YEAR)

### 2. Backend Processing (authController.js)

```javascript
// Determine plan type
const isPaidPlan = selectedPlan !== '7_DAYS_FREE_TRIAL';
const planType = isPaidPlan ? 'paid' : 'trial';

// Create school with proper fields
const school = await School.create({
  // ... other fields
  selectedPlan,
  planType,
  accountStatus: 'inactive',  // Always starts inactive
  approvalStatus: 'pending'   // Always starts pending
});
```

### 3. School Model Fields (School.js)

```javascript
{
  selectedPlan: String,        // 7_DAYS_FREE_TRIAL, MONTHLY, YEARLY, FIVE_YEAR
  planPrice: Number,           // 0, 4000, 40800, 200000
  planDuration: String,        // '7 days', '1 month', '1 year', '5 years'
  planType: String,            // 'trial' or 'paid'
  accountStatus: String,       // 'active' or 'inactive'
  approvalStatus: String,      // 'pending', 'approved', 'rejected'
  rejectionReason: String,     // Reason if rejected
  isActive: Boolean,           // Overall active status
  trial: {                     // For trial plans
    isActive: Boolean,
    startDate: Date,
    endDate: Date
  },
  subscription: {              // For paid plans
    plan: String,
    status: String,
    startDate: Date,
    endDate: Date,
    paymentId: String,
    orderId: String
  }
}
```

## Login Flow with Paid Plan Blocking

### 1. User Attempts Login (authController.js - adminLogin)

```javascript
// Fetch school with plan info
const admin = await Admin.findOne({ email })
  .populate('schoolId', 'schoolName isActive planType approvalStatus accountStatus selectedPlan');

// Validate credentials
const isPasswordValid = await bcrypt.compare(password, admin.password);

// PAID PLAN BLOCKING LOGIC
if (admin.schoolId.planType === 'paid') {
  if (admin.schoolId.approvalStatus === 'pending') {
    return res.status(403).json({
      success: false,
      awaitingApproval: true,
      planType: 'paid',
      message: 'Pending invoice approval',
      contactEmail: 'apnaschool.edu@gmail.com',
      selectedPlan: admin.schoolId.selectedPlan,
      blockAllFeatures: true
    });
  }

  if (admin.schoolId.approvalStatus === 'rejected') {
    return res.status(403).json({
      success: false,
      accountRejected: true,
      planType: 'paid',
      message: 'Your account has been rejected. Please contact support.',
      contactEmail: 'apnaschool.edu@gmail.com'
    });
  }

  if (admin.schoolId.accountStatus === 'inactive') {
    return res.status(403).json({
      success: false,
      accountInactive: true,
      planType: 'paid',
      message: 'Your account is inactive. Please contact support.',
      contactEmail: 'apnaschool.edu@gmail.com'
    });
  }
}

// Only proceed if approved and active
```

### 2. Login Response States

#### State 1: Pending Approval (Paid Plan)
```json
{
  "success": false,
  "awaitingApproval": true,
  "planType": "paid",
  "message": "Pending invoice approval",
  "contactEmail": "apnaschool.edu@gmail.com",
  "selectedPlan": "MONTHLY",
  "blockAllFeatures": true
}
```

**Frontend Action**:
- Display blocking modal/page
- Show message: "Pending invoice approval"
- Show contact email: apnaschool.edu@gmail.com
- Disable ALL features
- Allow ONLY logout

#### State 2: Account Rejected (Paid Plan)
```json
{
  "success": false,
  "accountRejected": true,
  "planType": "paid",
  "message": "Your account has been rejected. Please contact support.",
  "contactEmail": "apnaschool.edu@gmail.com"
}
```

**Frontend Action**:
- Display rejection message
- Show contact email
- Prevent access to system

#### State 3: Account Inactive (Paid Plan - Approved but Inactive)
```json
{
  "success": false,
  "accountInactive": true,
  "planType": "paid",
  "message": "Your account is inactive. Please contact support.",
  "contactEmail": "apnaschool.edu@gmail.com"
}
```

**Frontend Action**:
- Display inactive message
- Show contact email
- Prevent access to system

#### State 4: Approved and Active (Success)
```json
{
  "success": true,
  "token": "jwt_token_here",
  "data": {
    "adminId": "...",
    "schoolId": "...",
    "schoolName": "...",
    "name": "...",
    "email": "...",
    "role": "..."
  }
}
```

**Frontend Action**:
- Store token
- Redirect to dashboard
- Full system access

## Super Admin Approval Workflow

### Super Admin Endpoints

#### 1. Get Pending Schools
```
GET /api/super-admin/schools/pending
Authorization: Bearer {super_admin_token}
```

**Response**:
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "...",
      "schoolName": "ABC School",
      "email": "abc@school.com",
      "phone": "1234567890",
      "selectedPlan": "MONTHLY",
      "planType": "paid",
      "planPrice": 4000,
      "accountStatus": "inactive",
      "approvalStatus": "pending",
      "createdAt": "2025-12-14T..."
    }
  ]
}
```

#### 2. Approve School
```
PUT /api/super-admin/schools/:id/approve
Authorization: Bearer {super_admin_token}
```

**What Happens**:
1. Sets `approvalStatus = 'approved'`
2. Sets `accountStatus = 'active'`
3. Sets `isActive = true`
4. Initializes subscription dates:
   - `subscription.startDate = now`
   - `subscription.endDate = now + planDurationDays`
   - `subscription.status = 'active'`

**Response**:
```json
{
  "success": true,
  "message": "School approved successfully",
  "data": { /* updated school object */ }
}
```

#### 3. Reject School
```
PUT /api/super-admin/schools/:id/reject
Authorization: Bearer {super_admin_token}
Body: { "reason": "Invalid details" }
```

**What Happens**:
1. Sets `approvalStatus = 'rejected'`
2. Sets `accountStatus = 'inactive'`
3. Sets `isActive = false`
4. Sets `rejectionReason = reason`

**Response**:
```json
{
  "success": true,
  "message": "School rejected",
  "data": { /* updated school object */ }
}
```

## Middleware Protection

### checkAccountStatus Middleware
**Location**: `middleware/checkAccountStatus.js`

**Purpose**: Protect admin routes from access by unapproved paid plans

**Usage**:
```javascript
import { protect } from './middleware/authMiddleware.js';
import { checkAccountStatus } from './middleware/checkAccountStatus.js';

// Apply to protected routes
router.get('/admin/students', protect, checkAccountStatus, getStudents);
```

**Logic**:
1. Checks if `planType === 'paid'`
2. If yes, blocks access if:
   - `approvalStatus === 'pending'`
   - `approvalStatus === 'rejected'`
   - `accountStatus === 'inactive'`
3. Only allows access if:
   - `approvalStatus === 'approved'` AND
   - `accountStatus === 'active'`

## Frontend Implementation Guide

### 1. Registration Page
```jsx
// RegisterSchool.jsx
const handleSubmit = async (formData) => {
  const response = await registerSchool(formData);

  if (response.success) {
    // Check plan type
    if (formData.selectedPlan !== '7_DAYS_FREE_TRIAL') {
      // Paid plan - show pending approval message
      navigate('/pending-approval');
    } else {
      // Trial plan - show email verification
      navigate('/verify-email');
    }
  }
};
```

### 2. Pending Approval Page
```jsx
// PendingApproval.jsx
function PendingApproval() {
  return (
    <div className="pending-approval-container">
      <h1>Pending Invoice Approval</h1>
      <p>Your account is awaiting approval from our team.</p>
      <p>Please contact us at: <strong>apnaschool.edu@gmail.com</strong></p>
      <p>You will be able to access the system once your account is approved.</p>
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}
```

### 3. Login Handler
```jsx
// Login.jsx
const handleLogin = async (credentials) => {
  const response = await loginAPI(credentials);

  if (response.success) {
    // Success - redirect to dashboard
    localStorage.setItem('token', response.token);
    navigate('/dashboard');
  } else if (response.awaitingApproval) {
    // Paid plan - pending approval
    setShowBlockingModal(true);
    setBlockingMessage({
      title: 'Pending Invoice Approval',
      message: response.message,
      contactEmail: response.contactEmail
    });
  } else if (response.accountRejected) {
    // Account rejected
    setError('Your account has been rejected. Please contact support.');
  } else {
    // Other errors
    setError(response.message);
  }
};
```

### 4. Blocking Modal Component
```jsx
// BlockingModal.jsx
function BlockingModal({ isOpen, message, contactEmail, onLogout }) {
  return (
    <Modal isOpen={isOpen} backdrop="static" keyboard={false}>
      <ModalHeader>Access Restricted</ModalHeader>
      <ModalBody>
        <div className="text-center">
          <Icon name="lock" size={48} className="mb-3" />
          <h4>{message}</h4>
          <p className="mt-3">
            For assistance, please contact us at:
            <br />
            <strong>{contactEmail}</strong>
          </p>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button color="primary" onClick={onLogout}>
          Logout
        </Button>
      </ModalFooter>
    </Modal>
  );
}
```

### 5. Protected Route Wrapper
```jsx
// ProtectedRoute.jsx
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');

  if (!token) {
    return <Navigate to="/login" />;
  }

  // Make API call to check status
  const { data, loading, error } = useAccountStatus();

  if (loading) return <Spinner />;

  if (data?.awaitingApproval || data?.accountInactive) {
    return <Navigate to="/pending-approval" />;
  }

  return children;
}
```

## Testing Scenarios

### Scenario 1: Register with Paid Plan
1. Fill registration form
2. Select "MONTHLY" or "YEARLY" or "FIVE_YEAR"
3. Submit form
4. Verify:
   - School created with `planType = 'paid'`
   - `approvalStatus = 'pending'`
   - `accountStatus = 'inactive'`

### Scenario 2: Login with Pending Approval
1. Register with paid plan
2. Try to login
3. Verify:
   - Login blocked with 403 status
   - Response includes `awaitingApproval: true`
   - Message shows "Pending invoice approval"
   - Contact email displayed

### Scenario 3: Super Admin Approves
1. Super Admin logs in
2. Views pending schools
3. Clicks "Approve" on a school
4. Verify:
   - `approvalStatus = 'approved'`
   - `accountStatus = 'active'`
   - `isActive = true`
   - Subscription dates set

### Scenario 4: Login After Approval
1. School tries to login again
2. Verify:
   - Login successful
   - JWT token received
   - Full access granted

### Scenario 5: Super Admin Rejects
1. Super Admin views pending schools
2. Clicks "Reject" with reason
3. School tries to login
4. Verify:
   - Login blocked with rejection message
   - Cannot access system

## Security Considerations

1. **Double-check on every request**: Apply `checkAccountStatus` middleware to all admin routes
2. **Token validation**: Even with valid JWT, check approval status
3. **Frontend checks**: Don't rely solely on frontend - backend must enforce
4. **Rate limiting**: Limit login attempts for rejected accounts
5. **Audit logging**: Log all approval/rejection actions

## Database Queries

### Get all paid plans pending approval
```javascript
const pendingPaidPlans = await School.find({
  planType: 'paid',
  approvalStatus: 'pending'
});
```

### Get approved but inactive accounts
```javascript
const approvedInactive = await School.find({
  approvalStatus: 'approved',
  accountStatus: 'inactive'
});
```

### Get active paid subscriptions
```javascript
const activeSubscriptions = await School.find({
  planType: 'paid',
  approvalStatus: 'approved',
  accountStatus: 'active'
});
```

## Support Contact Information

**Primary Contact**: apnaschool.edu@gmail.com

**Support Hours**: Monday - Friday, 9 AM - 6 PM

**Response Time**: Within 24-48 hours

## Future Enhancements

1. **Email Notifications**: Send email when approved/rejected
2. **SMS Notifications**: Send SMS for status updates
3. **In-app Notifications**: Real-time approval status updates
4. **Payment Integration**: Auto-approve after payment verification
5. **Multi-level Approval**: Require multiple super admin approvals
6. **Approval Workflow**: Add comments and approval history
7. **Auto-expiry**: Auto-reject after X days of pending
8. **Reapplication**: Allow rejected schools to reapply
