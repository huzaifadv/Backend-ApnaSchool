# Super Admin Dashboard API Documentation

## Overview
Complete API reference for Super Admin subscription approval and school management system.

## Authentication
All protected endpoints require Super Admin authentication token in the header:
```
Authorization: Bearer {super_admin_token}
```

---

## Dashboard & Statistics

### Get Dashboard Statistics
Get comprehensive dashboard statistics with breakdowns.

**Endpoint**: `GET /api/super-admin/dashboard-stats`
**Auth**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalSchools": 50,
      "activeSchools": 35,
      "pendingSchools": 8,
      "suspendedSchools": 3,
      "rejectedSchools": 4,
      "recentSchools": 12
    },
    "planTypes": {
      "trial": 25,
      "paid": 25
    },
    "planBreakdown": {
      "monthly": 10,
      "yearly": 12,
      "fiveYear": 3
    },
    "revenue": {
      "total": 580800,
      "currency": "PKR"
    }
  }
}
```

### Get Platform Stats (Legacy)
**Endpoint**: `GET /api/super-admin/stats`
**Auth**: Required

---

## School Management

### Get All Schools with Filtering
View all registered schools with optional filtering.

**Endpoint**: `GET /api/super-admin/schools?filter={filter_type}`
**Auth**: Required

**Filter Options**:
- `trial` - Schools with trial plan
- `pending` - Schools pending approval
- `active` - Active schools (approved + active status)
- `suspended` - Suspended schools
- `rejected` - Rejected schools
- `paid` - Schools with paid plans
- No filter - All schools

**Example Requests**:
```bash
# Get all schools
GET /api/super-admin/schools

# Get trial schools only
GET /api/super-admin/schools?filter=trial

# Get pending approvals
GET /api/super-admin/schools?filter=pending

# Get suspended schools
GET /api/super-admin/schools?filter=suspended
```

**Response**:
```json
{
  "success": true,
  "count": 8,
  "filter": "pending",
  "data": [
    {
      "_id": "school_id_123",
      "schoolName": "ABC School",
      "email": "abc@school.com",
      "phone": "1234567890",
      "address": "123 Main St",
      "city": "Karachi",
      "state": "Sindh",
      "selectedPlan": "MONTHLY",
      "planType": "paid",
      "planPrice": 4000,
      "planDuration": "1 month",
      "approvalStatus": "pending",
      "accountStatus": "inactive",
      "isActive": false,
      "createdAt": "2025-12-14T10:30:00.000Z",
      "adminCount": 1
    }
  ]
}
```

### Get Pending Schools
Get schools awaiting approval (shortcut endpoint).

**Endpoint**: `GET /api/super-admin/schools/pending`
**Auth**: Required

**Response**:
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "school_id_123",
      "schoolName": "ABC School",
      "email": "abc@school.com",
      "phone": "1234567890",
      "address": "123 Main St",
      "selectedPlan": "MONTHLY",
      "planType": "paid",
      "planPrice": 4000,
      "accountStatus": "inactive",
      "createdAt": "2025-12-14T10:30:00.000Z"
    }
  ]
}
```

### Get School Details
Get detailed information about a specific school.

**Endpoint**: `GET /api/super-admin/schools/:id`
**Auth**: Required

**Response**:
```json
{
  "success": true,
  "data": {
    "school": {
      "_id": "school_id_123",
      "schoolName": "ABC School",
      "email": "abc@school.com",
      "phone": "1234567890",
      "address": "123 Main St",
      "city": "Karachi",
      "state": "Sindh",
      "selectedPlan": "MONTHLY",
      "planType": "paid",
      "planPrice": 4000,
      "approvalStatus": "pending",
      "accountStatus": "inactive",
      "isActive": false,
      "createdAt": "2025-12-14T10:30:00.000Z"
    },
    "admins": [
      {
        "_id": "admin_id_456",
        "name": "John Doe",
        "email": "john@abc.com",
        "phone": "9876543210",
        "isActive": true,
        "createdAt": "2025-12-14T10:30:00.000Z"
      }
    ]
  }
}
```

---

## School Actions

### 1. Approve School
Approve a school and activate their selected plan.

**Endpoint**: `PUT /api/super-admin/schools/:id/approve`
**Auth**: Required

**What Happens**:
1. Sets `approvalStatus = 'approved'`
2. Sets `accountStatus = 'active'`
3. Sets `isActive = true`
4. Initializes subscription/trial dates based on plan type

**Request**:
```bash
PUT /api/super-admin/schools/school_id_123/approve
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "message": "School approved successfully",
  "data": {
    "_id": "school_id_123",
    "schoolName": "ABC School",
    "approvalStatus": "approved",
    "accountStatus": "active",
    "isActive": true,
    "subscription": {
      "plan": "monthly",
      "status": "active",
      "startDate": "2025-12-14T10:00:00.000Z",
      "endDate": "2026-01-13T10:00:00.000Z"
    }
  }
}
```

### 2. Reject School
Reject a school registration with reason.

**Endpoint**: `PUT /api/super-admin/schools/:id/reject`
**Auth**: Required

**What Happens**:
1. Sets `approvalStatus = 'rejected'`
2. Sets `accountStatus = 'inactive'`
3. Sets `isActive = false`
4. Stores rejection reason

**Request**:
```bash
PUT /api/super-admin/schools/school_id_123/reject
Content-Type: application/json
Authorization: Bearer {token}

{
  "reason": "Incomplete documentation provided"
}
```

**Response**:
```json
{
  "success": true,
  "message": "School rejected",
  "data": {
    "_id": "school_id_123",
    "approvalStatus": "rejected",
    "accountStatus": "inactive",
    "isActive": false,
    "rejectionReason": "Incomplete documentation provided"
  }
}
```

### 3. Suspend School
Suspend an active school (immediate access block).

**Endpoint**: `PUT /api/super-admin/schools/:id/suspend`
**Auth**: Required

**What Happens**:
1. Sets `accountStatus = 'suspended'`
2. Sets `isActive = false`
3. Stores suspension reason and timestamp
4. **Immediate access block** - school cannot login

**Request**:
```bash
PUT /api/super-admin/schools/school_id_123/suspend
Content-Type: application/json
Authorization: Bearer {token}

{
  "reason": "Payment overdue for 30 days"
}
```

**Response**:
```json
{
  "success": true,
  "message": "School suspended successfully",
  "data": {
    "_id": "school_id_123",
    "accountStatus": "suspended",
    "isActive": false,
    "suspensionReason": "Payment overdue for 30 days",
    "suspendedAt": "2025-12-14T10:00:00.000Z"
  }
}
```

**Login Behavior After Suspension**:
```json
{
  "success": false,
  "accountSuspended": true,
  "message": "Your account has been suspended. Please contact support.",
  "contactEmail": "apnaschool.edu@gmail.com",
  "suspensionReason": "Payment overdue for 30 days",
  "suspendedAt": "2025-12-14T10:00:00.000Z"
}
```

### 4. Reactivate School
Reactivate a suspended school.

**Endpoint**: `PUT /api/super-admin/schools/:id/reactivate`
**Auth**: Required

**What Happens**:
1. Sets `accountStatus = 'active'`
2. Sets `isActive = true`
3. Clears suspension reason and timestamp
4. Records reactivation timestamp

**Requirements**:
- School must have been previously approved
- Cannot reactivate rejected or pending schools

**Request**:
```bash
PUT /api/super-admin/schools/school_id_123/reactivate
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "message": "School reactivated successfully",
  "data": {
    "_id": "school_id_123",
    "accountStatus": "active",
    "isActive": true,
    "reactivatedAt": "2025-12-14T11:00:00.000Z"
  }
}
```

**Error Response** (if not approved):
```json
{
  "success": false,
  "message": "Cannot reactivate school that was not previously approved. Please approve first."
}
```

### 5. Toggle School Status
Toggle overall active/inactive status.

**Endpoint**: `PUT /api/super-admin/schools/:id/toggle-status`
**Auth**: Required

**Response**:
```json
{
  "success": true,
  "message": "School activated successfully",
  "data": { /* school object */ }
}
```

---

## Complete Action Workflow

### Workflow 1: Approve New Paid Plan School
```
1. School registers with MONTHLY plan
   → planType: 'paid'
   → approvalStatus: 'pending'
   → accountStatus: 'inactive'

2. School tries to login
   → BLOCKED with "Pending invoice approval"

3. Super Admin views pending schools
   GET /api/super-admin/schools?filter=pending

4. Super Admin approves school
   PUT /api/super-admin/schools/{id}/approve

5. School can now login
   → Full access granted for 30 days
```

### Workflow 2: Suspend Active School
```
1. Active school has overdue payment

2. Super Admin suspends school
   PUT /api/super-admin/schools/{id}/suspend
   Body: { "reason": "Payment overdue" }

3. School's current sessions are invalidated

4. School tries to login
   → BLOCKED with suspension message

5. After payment, Super Admin reactivates
   PUT /api/super-admin/schools/{id}/reactivate

6. School can login again
```

### Workflow 3: Reject School
```
1. School registers with incomplete details

2. Super Admin reviews and rejects
   PUT /api/super-admin/schools/{id}/reject
   Body: { "reason": "Incomplete documents" }

3. School tries to login
   → BLOCKED with rejection message

4. School must contact support to reapply
```

---

## Filter Usage Examples

### Filter by Plan Type
```bash
# Get all trial schools
GET /api/super-admin/schools?filter=trial

# Get all paid plan schools
GET /api/super-admin/schools?filter=paid
```

### Filter by Status
```bash
# Get schools awaiting approval
GET /api/super-admin/schools?filter=pending

# Get active schools
GET /api/super-admin/schools?filter=active

# Get suspended schools
GET /api/super-admin/schools?filter=suspended

# Get rejected schools
GET /api/super-admin/schools?filter=rejected
```

### No Filter (All Schools)
```bash
GET /api/super-admin/schools
```

---

## School Status Matrix

| approvalStatus | accountStatus | isActive | Can Login? | Action Required |
|---------------|---------------|----------|------------|-----------------|
| pending       | inactive      | false    | ❌ No      | Approve/Reject  |
| approved      | active        | true     | ✅ Yes     | None            |
| approved      | suspended     | false    | ❌ No      | Reactivate      |
| rejected      | inactive      | false    | ❌ No      | Contact Support |
| approved      | inactive      | false    | ❌ No      | Investigate     |

---

## Error Responses

### 404 Not Found
```json
{
  "success": false,
  "message": "School not found"
}
```

### 400 Bad Request
```json
{
  "success": false,
  "message": "Cannot reactivate school that was not previously approved. Please approve first."
}
```

### 500 Server Error
```json
{
  "success": false,
  "message": "Server error suspending school"
}
```

---

## Frontend Implementation Guide

### Super Admin Dashboard Component Structure

```jsx
// SuperAdminDashboard.jsx
function SuperAdminDashboard() {
  const [filter, setFilter] = useState('all');
  const [schools, setSchools] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchDashboardStats();
    fetchSchools(filter);
  }, [filter]);

  return (
    <div>
      <DashboardStats stats={stats} />
      <FilterTabs filter={filter} setFilter={setFilter} />
      <SchoolsTable schools={schools} onAction={handleAction} />
    </div>
  );
}
```

### Filter Tabs Component
```jsx
function FilterTabs({ filter, setFilter }) {
  const filters = [
    { id: 'all', label: 'All Schools' },
    { id: 'pending', label: 'Pending Approval', badge: true },
    { id: 'active', label: 'Active' },
    { id: 'trial', label: 'Trial' },
    { id: 'paid', label: 'Paid Plans' },
    { id: 'suspended', label: 'Suspended' },
    { id: 'rejected', label: 'Rejected' }
  ];

  return (
    <div className="filter-tabs">
      {filters.map(f => (
        <button
          key={f.id}
          className={filter === f.id ? 'active' : ''}
          onClick={() => setFilter(f.id)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
```

### Action Handlers
```jsx
const handleApprove = async (schoolId) => {
  try {
    const response = await fetch(`/api/super-admin/schools/${schoolId}/approve`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (data.success) {
      toast.success('School approved successfully');
      fetchSchools(filter); // Refresh list
    }
  } catch (error) {
    toast.error('Failed to approve school');
  }
};

const handleSuspend = async (schoolId, reason) => {
  try {
    const response = await fetch(`/api/super-admin/schools/${schoolId}/suspend`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });
    const data = await response.json();

    if (data.success) {
      toast.success('School suspended successfully');
      fetchSchools(filter);
    }
  } catch (error) {
    toast.error('Failed to suspend school');
  }
};
```

---

## Testing Scenarios

### Test 1: Filter Schools
```bash
# Test all filters
curl -X GET "http://localhost:5000/api/super-admin/schools?filter=pending" \
  -H "Authorization: Bearer {token}"
```

### Test 2: Approve School
```bash
curl -X PUT "http://localhost:5000/api/super-admin/schools/{school_id}/approve" \
  -H "Authorization: Bearer {token}"
```

### Test 3: Suspend School
```bash
curl -X PUT "http://localhost:5000/api/super-admin/schools/{school_id}/suspend" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Payment overdue"}'
```

### Test 4: Reactivate School
```bash
curl -X PUT "http://localhost:5000/api/super-admin/schools/{school_id}/reactivate" \
  -H "Authorization: Bearer {token}"
```

### Test 5: Dashboard Stats
```bash
curl -X GET "http://localhost:5000/api/super-admin/dashboard-stats" \
  -H "Authorization: Bearer {token}"
```

---

## Summary

### Available Actions:
✅ **Approve** - Activate school and start their plan
❌ **Reject** - Deny registration with reason
⏸️ **Suspend** - Temporarily block access (can reactivate)
▶️ **Reactivate** - Restore suspended school
🔄 **Toggle Status** - Quick enable/disable

### Available Filters:
📊 **All** - Complete list
⏳ **Pending** - Awaiting approval
✅ **Active** - Currently active
🆓 **Trial** - Trial plan schools
💰 **Paid** - Paid plan schools
⏸️ **Suspended** - Suspended schools
❌ **Rejected** - Rejected schools

### Complete API Endpoint List:
```
GET    /api/super-admin/dashboard-stats           # Dashboard statistics
GET    /api/super-admin/schools?filter={type}     # List schools with filter
GET    /api/super-admin/schools/pending           # Pending approvals
GET    /api/super-admin/schools/:id               # School details
PUT    /api/super-admin/schools/:id/approve       # Approve school
PUT    /api/super-admin/schools/:id/reject        # Reject school
PUT    /api/super-admin/schools/:id/suspend       # Suspend school
PUT    /api/super-admin/schools/:id/reactivate    # Reactivate school
PUT    /api/super-admin/schools/:id/toggle-status # Toggle status
```
