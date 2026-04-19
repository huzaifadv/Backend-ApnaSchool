import { getModel } from '../models/dynamicModels.js';

export const resolveAcademicYear = async (schoolId, { academicYearId, academicYear } = {}) => {
  const AcademicYear = await getModel(schoolId, 'academicyears');

  let yearDoc = null;

  if (academicYearId) {
    yearDoc = await AcademicYear.findById(academicYearId);
  } else if (academicYear) {
    yearDoc = await AcademicYear.findOne({ year: academicYear });
  } else {
    yearDoc = await AcademicYear.findOne({ isCurrent: true });
  }

  return yearDoc;
};
