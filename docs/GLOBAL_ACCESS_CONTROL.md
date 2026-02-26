# Global Access Control Documentation

## Overview
Comprehensive backend-enforced access control system that protects ALL admin API routes based on school account status, trial/subscription status, and approval status.

## ⚠️ Critical: Backend-Enforced
**This is NOT frontend validation.** All access control is enforced at the API level. Even with valid JWT tokens, requests will be rejected if the school doesn't meet access criteria.

---

## Access Control Rules

### Rule Priority (Highest to Lowest):

1. **Suspended** → Blocks everything
2. **Pending Approval** → Blocks everything except logout
3. **Rejected** → Blocks everything
4. **Trial Expired** → Blocks everything except logout
5. **Subscription Expired** → Blocks everything except logout
6. **Inactive Account** → Blocks everything

### Detailed Rules:

#### ✅ RULE 1: Trial Active → Full Access
```javascript
Conditions:
- planType = 'trial'
- trial.isActive = true
- current_date <= trial.endDate
- approvalStatus = 'approved'
- accountStatus = 'active'
- isActive = true

Result: Full access to all features
```

#### ❌ RULE 2: Trial Expired → Block Everything Except Logout
```javascript
Conditions:
- planType = 'trial'
- current_date > trial.endDate

Result: ALL API calls rejected with 403
Response:
{
  "success": false,
  "blocked": true,
  "reason": "trial_expired",
  "trialExpired": true,
  "message": "Your free trial has ended. Please subscribe to continue.",
  "contactEmail": "apnaschool.edu@gmail.com",
  "trialEndDate": "...",
  "daysExpired": 5,
  "blockAllFeatures": true
}
```

#### ⏳ RULE 3: Pending Approval → Block Everything Except Logout
```javascript
Conditions:
- approvalStatus = 'pending'

Result: ALL API calls rejected with 403

For Paid Plans:
{
  "success": false,
  "blocked": true,
  "reason": "pending_approval",
  "awaitingApproval": true,
  "planType": "paid",
  "message": "Pending invoice approval",
  "contactEmail": "apnaschool.edu@gmail.com",
  "blockAllFeatures": true
}

For Trial Plans:
{
  "success": false,
  "blocked": true,
  "reason": "pending_approval",
  "awaitingApproval": true,
  "planType": "trial",
  "message": "Your account is awaiting approval.",
  "contactEmail": "apnaschool.edu@gmail.com",
  "blockAllFeatures": true
}
```

#### ⏸️ RULE 4: Suspended → Block Everything
```javascript
Conditions:
- accountStatus = 'suspended'

Result: ALL API calls rejected with 403 (including logout attempts)
Response:
{
  "success": false,
  "blocked": true,
  "reason": "suspended",
  "accountSuspended": true,
  "message": "Your account has been suspended. Please contact support.",
  "contactEmail": "apnaschool.edu@gmail.com",
  "suspensionReason": "Payment overdue",
  "suspendedAt": "...",
  "blockAllFeatures": true
}
```

#### ✅ RULE 5: Approved + Active → Full Access
```javascript
Conditions (Paid Plans):
- planType = 'paid'
- approvalStatus = 'approved'
- accountStatus = 'active'
- isActive = true
- current_date <= subscription.endDate

Result: Full access to all features
```

---

## Implementation

### Middleware: `validateSchool`
**Location**: `/backend/middleware/tenantMiddleware.js`

**Applied To**: ALL admin routes through `router.use(validateSchool)`

**How It Works**:
1. Extracts `schoolId` from JWT token
2. Fetches school from database with all status fields
3. Checks rules in priority order
4. Rejects request if any rule is violated
5. Allows request only if all checks pass

### Protected Routes:
```
✅ /api/admin/students/*
✅ /api/admin/classes/*
✅ /api/admin/attendance/*
✅ /api/admin/reports/*
✅ /api/admin/notices/*
✅ /api/admin/diary/*
✅ /api/admin/dashboard/*
```

**Exception**: `/api/admin/logout` is NOT blocked (allows users to logout even when blocked)

---

## Response Format

### Blocked Response Structure:
```json
{
  "success": false,
  "blocked": true,
  "reason": "trial_expired|pending_approval|suspended|rejected|subscription_expired|inactive|not_active",
  "message": "Human-readable message",
  "contactEmail": "apnaschool.edu@gmail.com",
  "blockAllFeatures": true,

  // Additional fields based on reason:
  "trialExpired": true,          // If trial expired
  "daysExpired": 5,              // Days since expiry
  "trialEndDate": "...",         // When trial ended

  "awaitingApproval": true,      // If pending approval
  "planType": "paid|trial",      // Plan type

  "accountSuspended": true,      // If suspended
  "suspensionReason": "...",     // Why suspended
  "suspendedAt": "...",          // When suspended

  "accountRejected": true,       // If rejected
  "rejectionReason": "...",      // Why rejected

  "subscriptionExpired": true,   // If subscription expired
  "subscriptionEndDate": "..."   // When subscription ended
}
```

---

## Testing Scenarios

### Test 1: Trial Active School
```javascript
// Setup
School: {
  planType: 'trial',
  approvalStatus: 'approved',
  accountStatus: 'active',
  isActive: true,
  trial: {
    isActive: true,
    endDate: Date.now() + 5 days
  }
}

// Test
GET /api/admin/students
Authorization: Bearer {valid_token}

// Expected: 200 OK - Access granted
```

### Test 2: Trial Expired School
```javascript
// Setup
School: {
  planType: 'trial',
  trial: {
    isActive: false,
    endDate: Date.now() - 2 days // 2 days ago
  }
}

// Test
GET /api/admin/students
Authorization: Bearer {valid_token}

// Expected: 403 Forbidden
{
  "success": false,
  "blocked": true,
  "reason": "trial_expired",
  "trialExpired": true,
  "message": "Your free trial has ended. Please subscribe to continue.",
  "daysExpired": 2,
  "blockAllFeatures": true
}
```

### Test 3: Pending Paid Plan
```javascript
// Setup
School: {
  planType: 'paid',
  selectedPlan: 'MONTHLY',
  approvalStatus: 'pending',
  accountStatus: 'inactive'
}

// Test
GET /api/admin/dashboard
Authorization: Bearer {valid_token}

// Expected: 403 Forbidden
{
  "success": false,
  "blocked": true,
  "reason": "pending_approval",
  "awaitingApproval": true,
  "planType": "paid",
  "message": "Pending invoice approval",
  "blockAllFeatures": true
}
```

### Test 4: Suspended School
```javascript
// Setup
School: {
  accountStatus: 'suspended',
  suspensionReason: 'Payment overdue',
  suspendedAt: Date.now() - 1 day
}

// Test
GET /api/admin/classes
Authorization: Bearer {valid_token}

// Expected: 403 Forbidden
{
  "success": false,
  "blocked": true,
  "reason": "suspended",
  "accountSuspended": true,
  "message": "Your account has been suspended. Please contact support.",
  "suspensionReason": "Payment overdue",
  "blockAllFeatures": true
}
```

### Test 5: Approved Paid Plan
```javascript
// Setup
School: {
  planType: 'paid',
  selectedPlan: 'YEARLY',
  approvalStatus: 'approved',
  accountStatus: 'active',
  isActive: true,
  subscription: {
    status: 'active',
    endDate: Date.now() + 300 days
  }
}

// Test
GET /api/admin/students
Authorization: Bearer {valid_token}

// Expected: 200 OK - Access granted
```

---

## Frontend Integration

### Axios Interceptor (Recommended)
```javascript
// api/axios.js
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Response interceptor to handle blocked access
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.blocked) {
      const { reason, message, contactEmail } = error.response.data;

      // Redirect to appropriate blocking page
      switch (reason) {
        case 'trial_expired':
          window.location.href = '/trial-expired';
          break;
        case 'pending_approval':
          window.location.href = '/pending-approval';
          break;
        case 'suspended':
          window.location.href = '/account-suspended';
          break;
        case 'subscription_expired':
          window.location.href = '/subscription-expired';
          break;
        default:
          window.location.href = '/access-denied';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

### Blocking Pages to Create:

1. **Trial Expired** (`/trial-expired`)
   - Show "Trial ended" message
   - Display subscription plans
   - Show contact email
   - Logout button only

2. **Pending Approval** (`/pending-approval`)
   - Show "Pending invoice approval" message
   - Display contact email
   - Logout button only

3. **Account Suspended** (`/account-suspended`)
   - Show suspension message and reason
   - Display contact email
   - Logout button only

4. **Subscription Expired** (`/subscription-expired`)
   - Show "Subscription expired" message
   - Display renewal options
   - Show contact email
   - Logout button only

---

## Security Features

### 1. Backend Enforcement
- ALL checks happen on the server
- Frontend cannot bypass restrictions
- Valid JWT alone is NOT sufficient

### 2. Database Verification
- Every protected request queries database
- Real-time status validation
- No caching of access permissions

### 3. Immediate Effect
- Suspension takes effect immediately
- Trial expiration checked on every request
- No grace period or delayed enforcement

### 4. Consistent Responses
- Standardized error format
- Clear blocking reasons
- Contact information provided

---

## Middleware Chain

```
Request → JWT Validation → Extract schoolId → Validate School (Access Control) → Route Handler
   ↓             ↓                  ↓                      ↓                         ↓
Auth Token   Decode Token    Get School Info    Check All Rules         Process Request
Required     Extract schoolId    From DB         Block if violated       Return Data

If ANY step fails → Return 401/403 with error message
```

---

## Performance Considerations

### Database Queries:
- One query per request to fetch school status
- Optimized with `.select()` to fetch only required fields
- Consider adding Redis cache for high-traffic scenarios

### Recommended Caching Strategy (Optional):
```javascript
// Cache school status for 5 minutes
const cacheKey = `school_status:${schoolId}`;
const cached = await redis.get(cacheKey);

if (cached) {
  school = JSON.parse(cached);
} else {
  school = await School.findById(schoolId).select(...);
  await redis.setex(cacheKey, 300, JSON.stringify(school));
}

// Invalidate cache on:
// - Approval/Rejection
// - Suspension/Reactivation
// - Plan changes
```

---

## Monitoring & Logging

### Recommended Logging:
```javascript
// Log blocked access attempts
if (school.accountStatus === 'suspended') {
  logger.warn('Blocked access attempt', {
    schoolId: school._id,
    schoolName: school.schoolName,
    reason: 'suspended',
    endpoint: req.path,
    timestamp: new Date()
  });
}
```

### Metrics to Track:
- Number of blocked requests per reason
- Most common blocking reasons
- Schools frequently hitting trial expiry
- Suspension rate and reasons

---

## Error Handling

### Middleware Error Response:
```javascript
catch (error) {
  console.error('Access Control Error:', error);
  return res.status(500).json({
    success: false,
    blocked: true,
    message: 'Error checking access permissions',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}
```

---

## Summary

### ✅ What's Protected:
- ALL admin API routes
- Students, Classes, Attendance, Reports, Notices, Diary, Dashboard
- Backend-enforced, cannot be bypassed

### ❌ What's NOT Protected:
- Public routes (registration, login)
- Logout endpoint
- Health check endpoint
- Super Admin routes

### 🔑 Key Points:
1. Valid JWT ≠ Access granted
2. Every request checks school status
3. Blocking is immediate
4. Frontend should handle blocked responses
5. Logout is always allowed (except for suspension)

### 📞 Support:
**Email**: apnaschool.edu@gmail.com

This email is shown to all blocked users for support.
