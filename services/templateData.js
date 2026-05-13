import axios from 'axios';
import fs from 'fs';
import path from 'path';

export async function toBase64DataUri(source) {
  if (!source) return null;

  try {
    if (typeof source === 'string' && source.startsWith('data:')) return source;

    if (typeof source === 'string' && fs.existsSync(source)) {
      const buffer = fs.readFileSync(source);
      const ext = path.extname(source).slice(1).toLowerCase();
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return `data:${mime};base64,${buffer.toString('base64')}`;
    }

    if (typeof source === 'string' && (source.startsWith('http://') || source.startsWith('https://'))) {
      const response = await axios.get(source, { responseType: 'arraybuffer', timeout: 8000 });
      const contentType = response.headers['content-type'] || 'image/jpeg';
      const base64 = Buffer.from(response.data).toString('base64');
      return `data:${contentType};base64,${base64}`;
    }
  } catch {
    // silently fail — template will handle missing image
  }

  return null;
}

export function formatDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d)) return String(val);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export async function buildStudentData(student, school, options = {}) {
  const primaryColor = options.primaryColor || school?.primaryColor || '#3a95b0';

  const [photoUri, logoUri] = await Promise.all([
    toBase64DataUri(student.photo || student.photoUrl),
    toBase64DataUri(school?.logo || school?.logoUrl),
  ]);

  return {
    primaryColor,
    name: student.name || '',
    studentId: student.studentId || student.roll || student.rollNumber || '',
    roll: student.roll || student.rollNumber || '',
    class: student.class || student.className || '',
    section: student.section || '',
    dob: formatDate(student.dob || student.dateOfBirth),
    address: student.address || student.homeAddress || '',
    phone: student.phone || student.contactNumber || '',
    bloodGroup: student.bloodGroup || '',
    fatherName: student.fatherName || student.guardianName || '',
    photo: photoUri,
    schoolName: school?.name || school?.schoolName || '',
    logo: logoUri,
    session: student.session || school?.session || '',
    validUntil: formatDate(student.validUntil || school?.sessionEnd),
  };
}

export async function buildTeacherData(teacher, school, options = {}) {
  const primaryColor = options.primaryColor || school?.primaryColor || '#1a2744';

  const [photoUri, logoUri] = await Promise.all([
    toBase64DataUri(teacher.photo || teacher.photoUrl),
    toBase64DataUri(school?.logo || school?.logoUrl),
  ]);

  return {
    primaryColor,
    name: teacher.name || '',
    employeeId: teacher.employeeId || teacher.staffId || '',
    designation: teacher.designation || teacher.role || 'Teacher',
    department: teacher.department || '',
    dob: formatDate(teacher.dob),
    phone: teacher.phone || teacher.contactNumber || '',
    address: teacher.address || '',
    bloodGroup: teacher.bloodGroup || '',
    photo: photoUri,
    schoolName: school?.name || school?.schoolName || '',
    logo: logoUri,
    validUntil: formatDate(teacher.validUntil || school?.sessionEnd),
  };
}
