# Trial & Subscription System Documentation

## Overview
The ApnaSchool platform includes a comprehensive trial and subscription management system that allows schools to test the platform with a 7-day trial period before committing to a paid subscription.

## System Components

### 1. Trial System

#### Trial Period
- **Duration**: 7 days from registration
- **Auto-activation**: Trial starts automatically when a new school registers
- **Features**: Full access to all platform features during trial period

#### Trial Schema (School Model)
```javascript
trial: {
  isActive: { type: Boolean, default: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date }
}
```

#### Trial Initialization
When a school registers, the trial is automatically set up:
- `isActive`: true
- `startDate`: Current date
- `endDate`: Current date + 7 days

### 2. Trial Expiration Middleware

**Location**: `backend/middleware/checkTrialExpiry.js`

**Purpose**: Checks if a school's trial has expired and blocks access to admin routes if no active subscription exists.

**Logic**:
1. Checks if school has an active subscription
2. If no subscription, checks trial status
3. Blocks access if trial has expired
4. Returns appropriate error message with subscription redirect

**Usage**: Applied to all admin routes that require trial/subscription validation

**Routes Protected**:
- `/api/admin/students/*`
- `/api/admin/classes/*`
- `/api/admin/attendance/*`
- `/api/admin/reports/*`
- `/api/admin/notices/*`
- `/api/admin/diary/*`
- `/api/admin/dashboard/*`

### 3. Login Trial Check

**Location**: `backend/routes/authRoutes.js`

**Purpose**: Validates trial status during login and provides trial information to the user.

**Response Includes**:
- `trialExpired`: Boolean indicating if trial has expired
- `trialDaysRemaining`: Number of days left in trial
- `requiresSubscription`: Boolean indicating if subscription is needed
- `subscriptionStatus`: Current subscription details

**Example Response**:
```javascript
{
  success: true,
  token: "...",
  user: {...},
  trialExpired: false,
  trialDaysRemaining: 5,
  requiresSubscription: false,
  subscriptionStatus: {
    hasActiveSubscription: false,
    plan: null
  }
}
```

### 4. Subscription Plans

**Available Plans**:

#### Monthly Plan
- **Price**: ₹999/month
- **Duration**: 30 days
- **Features**:
  - Unlimited Students
  - Attendance Management
  - Report Card Generation
  - Parent Portal Access
  - Notice Board
  - Diary Management
  - Email Support

#### Quarterly Plan
- **Price**: ₹2,499/quarter
- **Duration**: 90 days
- **Savings**: 15% off
- **Features**:
  - All Monthly Features
  - Priority Support
  - Advanced Analytics

#### Yearly Plan (Most Popular)
- **Price**: ₹7,999/year
- **Duration**: 365 days
- **Savings**: 33% off
- **Features**:
  - All Quarterly Features
  - Dedicated Account Manager
  - Custom Integrations
  - Training Sessions
  - Premium Support

### 5. Subscription Routes

**Base URL**: `/api/subscription`

#### GET `/plans`
Get all available subscription plans.

**Response**:
```javascript
{
  success: true,
  plans: [...]
}
```

#### POST `/create-order`
Create a subscription order.

**Headers**: Requires authentication token

**Body**:
```javascript
{
  planId: "monthly" | "quarterly" | "yearly"
}
```

**Response**:
```javascript
{
  success: true,
  order: {
    orderId: "ORDER_1234567890",
    planId: "monthly",
    amount: 999,
    currency: "INR",
    schoolId: "..."
  }
}
```

#### POST `/verify-payment`
Verify payment and activate subscription.

**Headers**: Requires authentication token

**Body**:
```javascript
{
  orderId: "ORDER_1234567890",
  paymentId: "PAY_1234567890",
  planId: "monthly"
}
```

**Response**:
```javascript
{
  success: true,
  message: "Subscription activated successfully",
  subscription: {
    plan: "monthly",
    status: "active",
    startDate: "2025-12-14T00:00:00.000Z",
    endDate: "2026-01-13T00:00:00.000Z",
    paymentId: "PAY_1234567890",
    orderId: "ORDER_1234567890"
  }
}
```

#### GET `/status`
Get current subscription and trial status.

**Headers**: Requires authentication token

**Response**:
```javascript
{
  success: true,
  subscription: {...},
  trial: {...},
  isTrialActive: true,
  isSubscriptionActive: false
}
```

## Implementation Flow

### New School Registration
1. School registers through registration form
2. Trial is automatically activated with 7-day duration
3. School gets full access to all features
4. Trial countdown begins

### During Trial Period
1. User logs in - receives trial status in response
2. Frontend displays trial remaining days
3. All admin features are accessible
4. Reminder notifications can be shown (3 days left, 1 day left)

### Trial Expiration
1. Trial end date is reached
2. User attempts to access admin features
3. `checkTrialExpiry` middleware blocks access
4. User is redirected to subscription page
5. User can view plans and subscribe

### Subscription Activation
1. User selects a plan
2. Order is created via `/create-order`
3. Payment is processed (integrate with payment gateway)
4. Payment is verified via `/verify-payment`
5. Subscription is activated
6. Trial is deactivated
7. Full access is restored

### Active Subscription
1. User has full access to all features
2. No trial checks are performed
3. Subscription expiry can be monitored similarly to trial

## School Model Schema

```javascript
{
  trial: {
    isActive: Boolean,
    startDate: Date,
    endDate: Date
  },
  subscription: {
    plan: String,        // 'monthly', 'quarterly', 'yearly'
    status: String,      // 'active', 'expired', 'cancelled'
    startDate: Date,
    endDate: Date,
    paymentId: String,
    orderId: String
  }
}
```

## Frontend Integration

### Login Response Handling
```javascript
const response = await loginAPI(credentials);
if (response.trialExpired && response.requiresSubscription) {
  // Redirect to subscription page
  navigate('/subscription-plans');
} else if (response.trialDaysRemaining <= 3) {
  // Show trial expiry warning
  showTrialWarning(response.trialDaysRemaining);
}
```

### Protected Routes
```javascript
// Check trial/subscription status before rendering admin components
if (trialExpired && !hasActiveSubscription) {
  return <SubscriptionRequired />;
}
```

### Subscription Page
Display available plans with:
- Plan features
- Pricing
- Savings (for quarterly/yearly)
- Call-to-action buttons
- Payment integration

## Payment Gateway Integration

**Note**: Current implementation includes placeholder functions. Integrate with:
- **Razorpay** (Recommended for India)
- **Stripe** (International)
- **PayU**
- **Instamojo**

### Integration Steps:
1. Set up payment gateway account
2. Add API keys to `.env`
3. Implement order creation with payment gateway
4. Add payment verification webhook
5. Handle payment success/failure callbacks
6. Update subscription status accordingly

## Testing

### Test Trial Expiry
```javascript
// Manually set trial end date to past
await School.findByIdAndUpdate(schoolId, {
  'trial.endDate': new Date(Date.now() - 86400000) // 1 day ago
});
```

### Test Subscription Activation
```javascript
// Use test payment credentials from payment gateway
// Verify subscription dates are set correctly
// Confirm trial.isActive is set to false
```

## Monitoring & Alerts

### Recommended Monitoring:
1. Trial expiration notifications (email/SMS)
2. Subscription renewal reminders
3. Payment failure alerts
4. Subscription cancellation tracking
5. Revenue analytics

## Security Considerations

1. **Authentication**: All subscription routes require valid JWT token
2. **Payment Verification**: Always verify payments server-side
3. **Amount Validation**: Validate payment amount matches plan price
4. **Signature Verification**: Use payment gateway signature verification
5. **School Validation**: Ensure user belongs to school being updated

## Future Enhancements

1. **Auto-renewal**: Implement automatic subscription renewal
2. **Grace Period**: Add 3-day grace period for expired subscriptions
3. **Prorated Upgrades**: Allow mid-cycle plan upgrades with prorated pricing
4. **Usage Analytics**: Track feature usage during trial
5. **Custom Plans**: Allow super-admin to create custom plans
6. **Discount Codes**: Implement promotional discount codes
7. **Invoicing**: Generate and email invoices automatically
8. **Refunds**: Handle refund requests and processing

## Support

For subscription-related queries:
- Email: support@apnaschool.com
- Phone: +91-XXXXXXXXXX
- Documentation: https://docs.apnaschool.com/subscription
