import mongoose from 'mongoose';
import Branch from '../models/Branch.js';

/**
 * Multi-tenant Database Connection Manager
 * Manages separate MongoDB databases for each school with connection pooling
 */

// Cache for tenant database connections
const tenantConnections = new Map();

// Main database connection (for School model only)
let mainConnection = null;

/**
 * Initialize main database connection
 * Used only for School model and cross-tenant operations
 */
export const initMainDB = async () => {
  try {
    if (mainConnection) {
      return mainConnection;
    }

    mainConnection = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 30000, // Increased to 30 seconds for MongoDB Atlas
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000, // Connection timeout for Atlas
      retryWrites: true,
      retryReads: true,
    });

    console.log(`✓ Main DB Connected: ${mainConnection.connection.host}`);
    console.log(`✓ Database: ${mainConnection.connection.name}`);
    return mainConnection;
  } catch (error) {
    console.error(`✗ Main DB Connection Error: ${error.message}`);
    console.error(`✗ Connection String: ${process.env.MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    console.error(`\n💡 Troubleshooting Tips:`);
    console.error(`   1. Check if your IP is whitelisted in MongoDB Atlas`);
    console.error(`   2. Verify your database credentials`);
    console.error(`   3. Ensure your internet connection is stable`);
    console.error(`   4. Check MongoDB Atlas cluster status\n`);
    throw error;
  }
};

/**
 * Get main database connection
 */
export const getMainConnection = () => {
  if (!mainConnection) {
    throw new Error('Main database not initialized. Call initMainDB() first.');
  }
  return mainConnection.connection;
};

const cleanDbPart = (value, maxLength = 45) => {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .substring(0, maxLength);
};

/**
 * Generate database name for a branch
 * @param {String} branchName - Branch name
 * @param {String} schoolName - Optional school name prefix
 * @param {String} suffix - Optional suffix for uniqueness
 * @returns {String}
 */
export const getBranchDBName = (branchName, schoolName = null, suffix = '') => {
  if (!branchName) {
    throw new Error('Branch name is required to generate database name');
  }

  const cleanBranch = cleanDbPart(branchName);
  const cleanSchool = schoolName ? cleanDbPart(schoolName, 30) : '';
  const base = cleanSchool ? `${cleanSchool}_${cleanBranch}` : cleanBranch;
  const safeSuffix = suffix ? `_${suffix}` : '';
  return `${base}${safeSuffix}_db`;
};

/**
 * Generate unique database name for a school from school name
 * If a database with the same name exists, adds an incremental suffix (_01, _02, etc.)
 * @param {String} schoolName - School's name
 * @param {String} schoolId - School's MongoDB ObjectId (optional, for checking existing schools)
 * @returns {String} Database name in format: schoolname_db or schoolname_01_db (lowercase, no spaces)
 */
export const getSchoolDBName = async (schoolName, schoolId = null) => {
  if (!schoolName) {
    throw new Error('School name is required to generate database name');
  }

  // Convert to lowercase, replace spaces with underscores, remove special characters
  const cleanName = schoolName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .substring(0, 45); // Limit to 45 to leave room for suffix

  // Base database name
  let dbName = `${cleanName}_db`;

  // Check if we need to make it unique
  // Import School model to check for existing schools with same base name
  try {
    const { default: School } = await import('../models/School.js');

    // Find all schools with similar names
    const existingSchools = await School.find({
      schoolName: { $regex: new RegExp(`^${schoolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') }
    }).select('_id schoolName');

    // If this is a new school (no schoolId) or if there are other schools with the same name
    if (existingSchools.length > 0) {
      // Filter out the current school if schoolId is provided
      const otherSchools = schoolId
        ? existingSchools.filter(s => s._id.toString() !== schoolId.toString())
        : existingSchools;

      if (otherSchools.length > 0) {
        // Add incremental suffix
        let suffix = 1;
        let uniqueName = `${cleanName}_${String(suffix).padStart(2, '0')}_db`;

        // Keep incrementing until we find a unique name
        // Check against existing databases
        while (suffix < 100) {
          const hasConflict = tenantConnections.has(uniqueName);
          if (!hasConflict) {
            dbName = uniqueName;
            break;
          }
          suffix++;
          uniqueName = `${cleanName}_${String(suffix).padStart(2, '0')}_db`;
        }
      }
    }
  } catch (error) {
    console.error('Error checking for duplicate database names:', error);
    // If there's an error, use the base name and let MongoDB handle it
  }

  return dbName;
};

/**
 * Create or get cached connection to a tenant's database
 * @param {String} schoolId - School's MongoDB ObjectId
 * @param {String} schoolName - School's name for database naming
 * @returns {Connection} Mongoose connection to tenant database
 */
export const getTenantConnection = async (tenantId, tenantName) => {
  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  let tenantIdStr = tenantId.toString();

  // Return cached connection if exists
  if (tenantConnections.has(tenantIdStr)) {
    const connection = tenantConnections.get(tenantIdStr);

    // Check if connection is still alive
    if (connection.readyState === 1) {
      return connection;
    } else {
      // Connection is dead, remove from cache
      tenantConnections.delete(tenantIdStr);
    }
  }

  // Determine if tenantId is a branch
  let isBranch = false;
  let branchDoc = null;
  let branchName = null;
  let schoolName = null;
  try {
    branchDoc = await Branch.findById(tenantId).select('branchName schoolId');
    if (branchDoc) {
      const { default: School } = await import('../models/School.js');
      const school = await School.findById(branchDoc.schoolId).select('schoolName branchStructure');

      if (school?.branchStructure === 'multiple') {
        isBranch = true;
        branchName = branchDoc.branchName;
        schoolName = school?.schoolName || null;
      } else {
        // Single-branch schools stay on the school tenant DB
        isBranch = false;
        tenantId = school?._id || tenantId;
        tenantName = school?.schoolName || tenantName;
      }
    }
  } catch (_err) {
    // If branch lookup fails, fall back to school flow
  }

  const resolvedTenantIdStr = tenantId.toString();
  if (resolvedTenantIdStr !== tenantIdStr && tenantConnections.has(resolvedTenantIdStr)) {
    const connection = tenantConnections.get(resolvedTenantIdStr);
    if (connection.readyState === 1) {
      return connection;
    }
    tenantConnections.delete(resolvedTenantIdStr);
  }

  tenantIdStr = resolvedTenantIdStr;

  // If schoolName not provided, get from database (school tenant only)
  if (!isBranch && !tenantName) {
    const { default: School } = await import('../models/School.js');
    const school = await School.findById(tenantId).select('schoolName');
    if (!school) {
      throw new Error(`School not found with ID: ${tenantId}`);
    }
    tenantName = school.schoolName;
  }

  // Create new connection
  try {
    const dbName = isBranch
      ? getBranchDBName(branchName, schoolName)
      : await getSchoolDBName(tenantName, tenantId);
    const mongoUri = process.env.MONGO_URI.replace(/\/[^/]*(\?|$)/, `/${dbName}$1`);

    const connection = mongoose.createConnection(mongoUri, {
      maxPoolSize: 5,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 30000, // Increased to 30 seconds for MongoDB Atlas
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000, // Connection timeout for Atlas
      retryWrites: true,
      retryReads: true,
    });

    // Wait for connection to be ready
    await new Promise((resolve, reject) => {
      connection.once('connected', resolve);
      connection.once('error', reject);
    });

    // Cache the connection
    tenantConnections.set(tenantIdStr, connection);
    console.log(`✓ Tenant DB Connected: ${dbName}`);

    // Handle connection errors
    connection.on('error', (err) => {
      console.error(`✗ Tenant DB Error [${dbName}]:`, err.message);
      tenantConnections.delete(tenantIdStr);
    });

    connection.on('disconnected', () => {
      console.log(`⚠ Tenant DB Disconnected: ${dbName}`);
      tenantConnections.delete(tenantIdStr);
    });

    return connection;
  } catch (error) {
    console.error(`✗ Failed to connect to tenant DB for tenant ${tenantIdStr}:`, error.message);
    throw new Error(`Failed to connect to school database: ${error.message}`);
  }
};

/**
 * Initialize a new tenant database with required collections
 * Called automatically when a new school is registered
 * @param {String} schoolId - School's MongoDB ObjectId
 * @param {String} schoolName - School's name
 */
export const initializeTenantDB = async (schoolId, schoolName) => {
  try {
    const connection = await getTenantConnection(schoolId, schoolName);
    const dbName = await getSchoolDBName(schoolName, schoolId);

    // Create collections with indexes
    const collections = ['students', 'classes', 'admins', 'attendance', 'notices', 'reports'];

    for (const collectionName of collections) {
      // Check if collection exists
      const collectionExists = (await connection.db.listCollections({ name: collectionName }).toArray()).length > 0;

      if (!collectionExists) {
        await connection.db.createCollection(collectionName);
        console.log(`  ✓ Created collection: ${dbName}.${collectionName}`);
      }
    }

    console.log(`✓ Initialized tenant database: ${dbName}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to initialize tenant DB for school ${schoolId}:`, error.message);
    throw error;
  }
};

/**
 * Initialize a new branch tenant database with required collections
 * @param {String} branchId - Branch ObjectId
 */
export const initializeBranchDB = async (branchId) => {
  try {
    const connection = await getTenantConnection(branchId);
    const branch = await Branch.findById(branchId).select('branchName schoolId');
    const { default: School } = await import('../models/School.js');
    const school = branch?.schoolId
      ? await School.findById(branch.schoolId).select('schoolName')
      : null;
    const dbName = getBranchDBName(branch?.branchName, school?.schoolName || null);

    const collections = ['students', 'classes', 'admins', 'attendance', 'notices', 'reports'];

    for (const collectionName of collections) {
      const collectionExists = (await connection.db.listCollections({ name: collectionName }).toArray()).length > 0;
      if (!collectionExists) {
        await connection.db.createCollection(collectionName);
        console.log(`  ✓ Created collection: ${dbName}.${collectionName}`);
      }
    }

    console.log(`✓ Initialized branch tenant database: ${dbName}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to initialize branch DB for branch ${branchId}:`, error.message);
    throw error;
  }
};

/**
 * Close a specific tenant connection
 * @param {String} schoolId - School's MongoDB ObjectId
 */
export const closeTenantConnection = async (schoolId) => {
  const schoolIdStr = schoolId.toString();

  if (tenantConnections.has(schoolIdStr)) {
    const connection = tenantConnections.get(schoolIdStr);
    await connection.close();
    tenantConnections.delete(schoolIdStr);
    console.log(`✓ Closed tenant connection for school: ${schoolIdStr}`);
  }
};

/**
 * Close all tenant connections
 * Used for graceful shutdown
 */
export const closeAllTenantConnections = async () => {
  console.log('Closing all tenant connections...');

  const closePromises = Array.from(tenantConnections.entries()).map(async ([schoolId, connection]) => {
    try {
      await connection.close();
      console.log(`  ✓ Closed connection for school: ${schoolId}`);
    } catch (error) {
      console.error(`  ✗ Error closing connection for school ${schoolId}:`, error.message);
    }
  });

  await Promise.all(closePromises);
  tenantConnections.clear();
  console.log('✓ All tenant connections closed');
};

/**
 * Get statistics about tenant connections
 * Useful for monitoring and debugging
 */
export const getTenantConnectionStats = () => {
  const stats = {
    totalConnections: tenantConnections.size,
    connections: []
  };

  tenantConnections.forEach((connection, schoolId) => {
    stats.connections.push({
      schoolId,
      dbName: connection.name,
      readyState: connection.readyState,
      readyStateLabel: ['disconnected', 'connected', 'connecting', 'disconnecting'][connection.readyState]
    });
  });

  return stats;
};

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, closing database connections...');
  await closeAllTenantConnections();
  if (mainConnection) {
    await mainConnection.connection.close();
    console.log('✓ Main DB connection closed');
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, closing database connections...');
  await closeAllTenantConnections();
  if (mainConnection) {
    await mainConnection.connection.close();
    console.log('✓ Main DB connection closed');
  }
  process.exit(0);
});
