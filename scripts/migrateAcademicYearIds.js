import dotenv from 'dotenv';
import School from '../models/School.js';
import { initMainDB } from '../config/tenantDB.js';
import { getModel } from '../models/dynamicModels.js';

dotenv.config();

const buildYearMap = (years) => {
  const map = new Map();
  years.forEach((y) => {
    if (y.year) {
      map.set(y.year, y._id);
    }
  });
  return map;
};

const bulkUpdate = async (Model, ops, label) => {
  if (ops.length === 0) {
    console.log(`- ${label}: no updates needed`);
    return;
  }
  const result = await Model.bulkWrite(ops);
  console.log(`- ${label}: matched ${result.matchedCount}, modified ${result.modifiedCount}`);
};

const migrateSchool = async (school) => {
  console.log(`\nSchool: ${school.schoolName} (${school._id})`);

  const AcademicYear = await getModel(school._id, 'academicyears');
  const Class = await getModel(school._id, 'classes');
  const Student = await getModel(school._id, 'students');
  const Staff = await getModel(school._id, 'staffs');

  const years = await AcademicYear.find({}).select('_id year');
  const yearMap = buildYearMap(years);

  if (yearMap.size === 0) {
    console.log('- No academic years found, skipping school');
    return;
  }

  const classes = await Class.find({}).select('_id academicYear academicYearId');
  const classYearMap = new Map();
  classes.forEach((c) => {
    if (c.academicYearId) {
      classYearMap.set(c._id.toString(), { id: c.academicYearId, year: c.academicYear || '' });
    }
  });

  // Classes
  const classOps = [];
  classes.forEach((c) => {
    if (!c.academicYearId && c.academicYear && yearMap.has(c.academicYear)) {
      classOps.push({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { academicYearId: yearMap.get(c.academicYear) } }
        }
      });
    }
  });
  await bulkUpdate(Class, classOps, 'Classes');

  // Students
  const students = await Student.find({
    $or: [
      { academicYearId: { $exists: false } },
      { academicYearId: null }
    ]
  }).select('_id currentAcademicYear classId academicYearId');

  const studentOps = [];
  students.forEach((s) => {
    let resolved = null;
    if (s.classId && classYearMap.has(s.classId.toString())) {
      resolved = classYearMap.get(s.classId.toString());
    } else if (s.currentAcademicYear && yearMap.has(s.currentAcademicYear)) {
      resolved = { id: yearMap.get(s.currentAcademicYear), year: s.currentAcademicYear };
    }

    if (resolved?.id) {
      const update = { academicYearId: resolved.id };
      if (!s.currentAcademicYear && resolved.year) {
        update.currentAcademicYear = resolved.year;
      }
      studentOps.push({
        updateOne: {
          filter: { _id: s._id },
          update: { $set: update }
        }
      });
    }
  });
  await bulkUpdate(Student, studentOps, 'Students');

  // Staff
  const staffDocs = await Staff.find({
    $or: [
      { academicYearId: { $exists: false } },
      { academicYearId: null }
    ]
  }).select('_id academicYear academicYearId');

  const staffOps = [];
  staffDocs.forEach((s) => {
    if (!s.academicYearId && s.academicYear && yearMap.has(s.academicYear)) {
      staffOps.push({
        updateOne: {
          filter: { _id: s._id },
          update: { $set: { academicYearId: yearMap.get(s.academicYear) } }
        }
      });
    }
  });
  await bulkUpdate(Staff, staffOps, 'Staff');
};

const run = async () => {
  try {
    await initMainDB();
    const schools = await School.find({}).select('_id schoolName');

    if (!schools.length) {
      console.log('No schools found.');
      process.exit(0);
    }

    for (const school of schools) {
      await migrateSchool(school);
    }

    console.log('\nMigration complete.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

run();
