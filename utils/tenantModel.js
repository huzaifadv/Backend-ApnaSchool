import { getTenantConnection } from '../config/tenantDB.js';

/**
 * Returns a Mongoose model compiled against the school's tenant DB connection.
 * Re-uses Mongoose's per-connection model cache so the schema is only compiled once.
 *
 * @param {string} schoolId
 * @param {import('mongoose').Model} StaticModel - Any static model imported from models/*.js
 */
export async function tenantModel(schoolId, StaticModel) {
  if (!schoolId) throw new Error('schoolId is required for tenantModel');
  const conn = await getTenantConnection(schoolId);
  const name = StaticModel.modelName;
  const coll = StaticModel.collection.name;
  try {
    return conn.model(name);
  } catch {
    return conn.model(name, StaticModel.schema, coll);
  }
}
