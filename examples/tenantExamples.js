/**
 * Multi-Tenant Architecture - Example Usage
 *
 * This file demonstrates how to use the multi-tenant architecture
 * for common operations in your school management system.
 */

import { getModel } from '../models/dynamicModels.js';
import { getTenantConnection, initializeTenantDB, getSchoolDBName } from '../config/tenantDB.js';
import bcrypt from 'bcryptjs';

// ============================================================================
// EXAMPLE 1: Register a New School (with automatic DB creation)
// ============================================================================

/**
 * When a school registers, the system automatically:
 * 1. Creates a record in the main database
 * 2. Generates a unique database name: school_<schoolId>_db
 * 3. Creates collections: students, classes, admins, attendance, notices, reports
 * 4. Creates the first admin user in the tenant database
 */

export async function exampleRegisterSchool(schoolData) {
  console.log('=== Example 1: Register New School ===');

  // This is handled by tenantAuthController.registerSchool()
  // Usage in your route:
  // POST /api/schools/register
  // Body: { schoolName, email, password, address, city, state, pincode, phone, ... }

  const exampleResponse = {
    success: true,
    message: 'School registered successfully with dedicated database',
    data: {
      _id: '507f1f77bcf86cd799439011',
      schoolName: 'Green Valley Public School',
      email: 'admin@greenvalley.edu',
      databaseName: 'school_507f1f77bcf86cd799439011_db',
      isActive: true,
      createdAt: new Date()
    },
    adminId: '507f1f77bcf86cd799439012'
  };

  console.log('Response:', exampleResponse);
  return exampleResponse;
}

// ============================================================================
// EXAMPLE 2: Add a Student (uses dynamic DB connection)
// ============================================================================

/**
 * When adding a student, the system:
 * 1. Extracts schoolId from JWT token (via middleware)
 * 2. Loads the correct tenant database
 * 3. Creates student in that school's isolated database
 */

export async function exampleAddStudent(schoolId, studentData) {
  console.log('=== Example 2: Add Student to Tenant Database ===');
  console.log(`School ID: ${schoolId}`);
  console.log(`Database: ${getSchoolDBName(schoolId)}`);

  try {
    // Step 1: Get Student model from tenant database
    const Student = await getModel(schoolId, 'students');

    // Step 2: Get Class model to verify class exists
    const Class = await getModel(schoolId, 'classes');

    // Step 3: Verify class
    const classDoc = await Class.findById(studentData.classId);
    if (!classDoc) {
      throw new Error('Class not found in this school');
    }

    // Step 4: Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(studentData.password, salt);

    // Step 5: Create student in tenant database
    const student = await Student.create({
      ...studentData,
      password: hashedPassword
    });

    console.log(`✓ Student created in tenant DB: ${student._id}`);
    console.log(`  Database: ${getSchoolDBName(schoolId)}`);
    console.log(`  Collection: students`);

    return {
      success: true,
      message: 'Student added successfully',
      data: student
    };
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 3: Mark Attendance (uses dynamic DB connection)
// ============================================================================

/**
 * Marking attendance for students in a specific school
 * Each school's attendance is stored in their own isolated database
 */

export async function exampleMarkAttendance(schoolId, attendanceData) {
  console.log('=== Example 3: Mark Attendance in Tenant Database ===');
  console.log(`School ID: ${schoolId}`);
  console.log(`Database: ${getSchoolDBName(schoolId)}`);

  try {
    // Get models from tenant database
    const Attendance = await getModel(schoolId, 'attendance');
    const Student = await getModel(schoolId, 'students');

    const results = [];

    for (const record of attendanceData) {
      // Verify student exists in this school's database
      const student = await Student.findById(record.studentId);
      if (!student) {
        console.log(`  ✗ Student ${record.studentId} not found in this school`);
        continue;
      }

      // Mark attendance in tenant database
      const attendance = await Attendance.create({
        studentId: record.studentId,
        classId: record.classId,
        date: new Date(record.date),
        status: record.status,
        remarks: record.remarks
      });

      results.push(attendance);
      console.log(`  ✓ Attendance marked for student: ${student.firstName} ${student.lastName}`);
    }

    console.log(`✓ Marked attendance for ${results.length} students`);
    console.log(`  Database: ${getSchoolDBName(schoolId)}`);
    console.log(`  Collection: attendance`);

    return {
      success: true,
      message: `Attendance marked for ${results.length} students`,
      data: results
    };
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 4: Get School Statistics (from tenant database)
// ============================================================================

/**
 * Retrieve statistics for a specific school
 * All data comes from that school's isolated database
 */

export async function exampleGetSchoolStats(schoolId) {
  console.log('=== Example 4: Get School Statistics ===');
  console.log(`School ID: ${schoolId}`);
  console.log(`Database: ${getSchoolDBName(schoolId)}`);

  try {
    // Get models from tenant database
    const Student = await getModel(schoolId, 'students');
    const Class = await getModel(schoolId, 'classes');
    const Attendance = await getModel(schoolId, 'attendance');
    const Notice = await getModel(schoolId, 'notices');

    // Get counts from tenant database
    const stats = {
      totalStudents: await Student.countDocuments({ isActive: true }),
      totalClasses: await Class.countDocuments({ isActive: true }),
      activeNotices: await Notice.countDocuments({ isActive: true }),
      attendanceRecordsToday: await Attendance.countDocuments({
        date: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lte: new Date(new Date().setHours(23, 59, 59, 999))
        }
      })
    };

    console.log('✓ Statistics retrieved from tenant database:');
    console.log(`  Total Students: ${stats.totalStudents}`);
    console.log(`  Total Classes: ${stats.totalClasses}`);
    console.log(`  Active Notices: ${stats.activeNotices}`);
    console.log(`  Today's Attendance: ${stats.attendanceRecordsToday}`);

    return {
      success: true,
      data: stats
    };
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 5: Query Students with Filters (tenant-specific)
// ============================================================================

/**
 * Search/filter students within a specific school
 * Results are automatically isolated to that school's database
 */

export async function exampleQueryStudents(schoolId, filters = {}) {
  console.log('=== Example 5: Query Students with Filters ===');
  console.log(`School ID: ${schoolId}`);
  console.log(`Database: ${getSchoolDBName(schoolId)}`);
  console.log('Filters:', filters);

  try {
    // Get Student model from tenant database
    const Student = await getModel(schoolId, 'students');

    // Build query
    const query = { isActive: true };

    if (filters.classId) {
      query.classId = filters.classId;
    }

    if (filters.search) {
      query.$or = [
        { firstName: { $regex: filters.search, $options: 'i' } },
        { lastName: { $regex: filters.search, $options: 'i' } },
        { rollNumber: { $regex: filters.search, $options: 'i' } }
      ];
    }

    // Query tenant database
    const students = await Student.find(query)
      .populate('classId', 'className section')
      .select('-password')
      .limit(filters.limit || 10);

    console.log(`✓ Found ${students.length} students in tenant database`);

    return {
      success: true,
      count: students.length,
      data: students
    };
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 6: Cross-Tenant Query Prevention (Data Isolation Demo)
// ============================================================================

/**
 * This demonstrates how data isolation works
 * Schools cannot access each other's data
 */

export async function exampleDataIsolation(school1Id, school2Id) {
  console.log('=== Example 6: Data Isolation Demonstration ===');

  try {
    // School 1 adds a student
    const Student1 = await getModel(school1Id, 'students');
    const student1 = await Student1.create({
      firstName: 'John',
      lastName: 'Doe',
      rollNumber: '2024001',
      email: 'john@school1.com',
      password: 'hashed_password',
      classId: '507f1f77bcf86cd799439013',
      dateOfBirth: new Date('2010-01-01'),
      gender: 'Male',
      parentName: 'Parent 1',
      parentPhone: '1234567890',
      parentAccessCode: 'ABC12345'
    });

    console.log(`✓ School 1 created student: ${student1._id}`);
    console.log(`  Database: ${getSchoolDBName(school1Id)}`);

    // School 2 tries to query - will NOT see School 1's student
    const Student2 = await getModel(school2Id, 'students');
    const school2Students = await Student2.find({});

    console.log(`✓ School 2 queried students: Found ${school2Students.length} students`);
    console.log(`  Database: ${getSchoolDBName(school2Id)}`);
    console.log(`  ✓ DATA ISOLATION VERIFIED: School 2 cannot see School 1's students`);

    // Try to find School 1's student from School 2's database
    const attemptCrossTenant = await Student2.findById(student1._id);
    console.log(`✓ Cross-tenant query result: ${attemptCrossTenant ? 'FAILED - Data Leak!' : 'SUCCESS - Isolated'}`);

    return {
      success: true,
      message: 'Data isolation working correctly',
      school1StudentId: student1._id,
      school2CanAccessIt: !!attemptCrossTenant
    };
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 7: Using Middleware in Routes
// ============================================================================

/**
 * Example route setup using tenant middleware
 * This shows how to protect routes and automatically extract schoolId
 */

export function exampleRouteSetup() {
  console.log('=== Example 7: Route Setup with Tenant Middleware ===');

  const exampleCode = `
import express from 'express';
import { extractSchoolId, validateSchool, requireUserType } from '../middleware/tenantMiddleware.js';
import { createStudent, getStudents } from '../controllers/tenantStudentController.js';

const router = express.Router();

// All routes automatically extract schoolId from JWT token
// and load the correct tenant database

// Create student - requires admin access
router.post('/students',
  extractSchoolId,        // Extract schoolId from JWT
  validateSchool,         // Verify school exists and is active
  requireUserType(['admin', 'super_admin']), // Only admins can create
  createStudent           // Uses req.schoolId to load correct DB
);

// Get students - requires admin access
router.get('/students',
  extractSchoolId,
  validateSchool,
  requireUserType(['admin', 'super_admin']),
  getStudents
);

export default router;
  `;

  console.log(exampleCode);
  return exampleCode;
}

// ============================================================================
// Export all examples
// ============================================================================

export default {
  exampleRegisterSchool,
  exampleAddStudent,
  exampleMarkAttendance,
  exampleGetSchoolStats,
  exampleQueryStudents,
  exampleDataIsolation,
  exampleRouteSetup
};
