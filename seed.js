import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import School from './models/School.js';
import Admin from './models/Admin.js';
import Class from './models/Class.js';
import Student from './models/Student.js';
import Attendance from './models/Attendance.js';
import Notice from './models/Notice.js';
import Report from './models/Report.js';
import { generateParentAccessCode } from './utils/generateAccessCode.js';

dotenv.config();

// Seed data arrays
const schools = [
  {
    schoolName: 'Delhi Public School',
    address: '123 Education Lane, Sector 15',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110001',
    phone: '+91-11-12345678',
    email: 'admin@dpsdelhi.edu',
    password: 'admin123',
    establishedYear: 1995,
    website: 'https://www.dpsdelhi.edu',
  },
  {
    schoolName: 'Modern International School',
    address: '456 Knowledge Street, MG Road',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560001',
    phone: '+91-80-87654321',
    email: 'admin@misbangalore.edu',
    password: 'admin123',
    establishedYear: 2005,
    website: 'https://www.misbangalore.edu',
  },
];

const adminsData = [
  { name: 'Admin', email: 'admin@gmail.com', password: 'admin123', phone: '+91-9876543210', role: 'super_admin' },
  { name: 'Priya Sharma', email: 'priya.sharma@misbangalore.edu', password: 'admin123', phone: '+91-9876543211', role: 'super_admin' },
];

const classesData = [
  { className: 'Class 10', section: 'A', grade: '10th', academicYear: '2024-2025', classTeacher: 'Mrs. Anjali Verma', room: 'Room 201', capacity: 40 },
  { className: 'Class 10', section: 'B', grade: '10th', academicYear: '2024-2025', classTeacher: 'Mr. Vikram Singh', room: 'Room 202', capacity: 40 },
  { className: 'Class 9', section: 'A', grade: '9th', academicYear: '2024-2025', classTeacher: 'Mrs. Meera Patel', room: 'Room 101', capacity: 40 },
];

const studentsData = [
  // Class 10-A students
  { firstName: 'Aarav', lastName: 'Gupta', rollNumber: 'DPS2024001', email: 'aarav.gupta@student.dps.edu', password: 'student123', dateOfBirth: '2009-05-15', gender: 'Male', bloodGroup: 'B+', parentName: 'Mr. Ramesh Gupta', parentPhone: '+91-9800000001', parentEmail: 'ramesh.gupta@gmail.com' },
  { firstName: 'Ananya', lastName: 'Reddy', rollNumber: 'DPS2024002', email: 'ananya.reddy@student.dps.edu', password: 'student123', dateOfBirth: '2009-08-22', gender: 'Female', bloodGroup: 'A+', parentName: 'Mrs. Lakshmi Reddy', parentPhone: '+91-9800000002', parentEmail: 'lakshmi.reddy@gmail.com' },
  { firstName: 'Arjun', lastName: 'Singh', rollNumber: 'DPS2024003', email: 'arjun.singh@student.dps.edu', password: 'student123', dateOfBirth: '2009-03-10', gender: 'Male', bloodGroup: 'O+', parentName: 'Mr. Vikram Singh', parentPhone: '+91-9800000003', parentEmail: 'vikram.singh@gmail.com' },

  // Class 10-B students
  { firstName: 'Diya', lastName: 'Sharma', rollNumber: 'DPS2024004', email: 'diya.sharma@student.dps.edu', password: 'student123', dateOfBirth: '2009-07-18', gender: 'Female', bloodGroup: 'AB+', parentName: 'Mrs. Priya Sharma', parentPhone: '+91-9800000004', parentEmail: 'priya.sharma.parent@gmail.com' },
  { firstName: 'Kabir', lastName: 'Joshi', rollNumber: 'DPS2024005', email: 'kabir.joshi@student.dps.edu', password: 'student123', dateOfBirth: '2009-11-05', gender: 'Male', bloodGroup: 'B-', parentName: 'Mr. Suresh Joshi', parentPhone: '+91-9800000005', parentEmail: 'suresh.joshi@gmail.com' },
  { firstName: 'Myra', lastName: 'Kapoor', rollNumber: 'DPS2024006', email: 'myra.kapoor@student.dps.edu', password: 'student123', dateOfBirth: '2009-09-12', gender: 'Female', bloodGroup: 'A-', parentName: 'Mrs. Neha Kapoor', parentPhone: '+91-9800000006', parentEmail: 'neha.kapoor@gmail.com' },

  // Class 9-A students
  { firstName: 'Rohan', lastName: 'Malhotra', rollNumber: 'DPS2024007', email: 'rohan.malhotra@student.dps.edu', password: 'student123', dateOfBirth: '2010-01-20', gender: 'Male', bloodGroup: 'O-', parentName: 'Mr. Anil Malhotra', parentPhone: '+91-9800000007', parentEmail: 'anil.malhotra@gmail.com' },
  { firstName: 'Sara', lastName: 'Iyer', rollNumber: 'DPS2024008', email: 'sara.iyer@student.dps.edu', password: 'student123', dateOfBirth: '2010-04-08', gender: 'Female', bloodGroup: 'B+', parentName: 'Mrs. Divya Iyer', parentPhone: '+91-9800000008', parentEmail: 'divya.iyer@gmail.com' },
  { firstName: 'Vihaan', lastName: 'Nair', rollNumber: 'DPS2024009', email: 'vihaan.nair@student.dps.edu', password: 'student123', dateOfBirth: '2010-06-25', gender: 'Male', bloodGroup: 'A+', parentName: 'Mr. Rajesh Nair', parentPhone: '+91-9800000009', parentEmail: 'rajesh.nair@gmail.com' },
];

const studentsData2 = [
  // Class 10-A students for school 2
  { firstName: 'Aisha', lastName: 'Khan', rollNumber: 'MIS2024001', email: 'aisha.khan@student.mis.edu', password: 'student123', dateOfBirth: '2009-02-14', gender: 'Female', bloodGroup: 'O+', parentName: 'Mr. Fahad Khan', parentPhone: '+91-9800000010', parentEmail: 'fahad.khan@gmail.com' },
  { firstName: 'Dev', lastName: 'Patel', rollNumber: 'MIS2024002', email: 'dev.patel@student.mis.edu', password: 'student123', dateOfBirth: '2009-10-30', gender: 'Male', bloodGroup: 'B+', parentName: 'Mrs. Anjali Patel', parentPhone: '+91-9800000011', parentEmail: 'anjali.patel@gmail.com' },
  { firstName: 'Isha', lastName: 'Desai', rollNumber: 'MIS2024003', email: 'isha.desai@student.mis.edu', password: 'student123', dateOfBirth: '2009-12-05', gender: 'Female', bloodGroup: 'A+', parentName: 'Mr. Kiran Desai', parentPhone: '+91-9800000012', parentEmail: 'kiran.desai@gmail.com' },

  // Class 10-B students for school 2
  { firstName: 'Krishna', lastName: 'Menon', rollNumber: 'MIS2024004', email: 'krishna.menon@student.mis.edu', password: 'student123', dateOfBirth: '2009-04-19', gender: 'Male', bloodGroup: 'AB-', parentName: 'Mrs. Radha Menon', parentPhone: '+91-9800000013', parentEmail: 'radha.menon@gmail.com' },
  { firstName: 'Navya', lastName: 'Rao', rollNumber: 'MIS2024005', email: 'navya.rao@student.mis.edu', password: 'student123', dateOfBirth: '2009-08-07', gender: 'Female', bloodGroup: 'O-', parentName: 'Mr. Mohan Rao', parentPhone: '+91-9800000014', parentEmail: 'mohan.rao@gmail.com' },
  { firstName: 'Siddharth', lastName: 'Chopra', rollNumber: 'MIS2024006', email: 'siddharth.chopra@student.mis.edu', password: 'student123', dateOfBirth: '2009-05-28', gender: 'Male', bloodGroup: 'B-', parentName: 'Mrs. Kavita Chopra', parentPhone: '+91-9800000015', parentEmail: 'kavita.chopra@gmail.com' },

  // Class 9-A students for school 2
  { firstName: 'Tara', lastName: 'Bhatt', rollNumber: 'MIS2024007', email: 'tara.bhatt@student.mis.edu', password: 'student123', dateOfBirth: '2010-03-15', gender: 'Female', bloodGroup: 'A-', parentName: 'Mr. Arun Bhatt', parentPhone: '+91-9800000016', parentEmail: 'arun.bhatt@gmail.com' },
  { firstName: 'Yash', lastName: 'Shetty', rollNumber: 'MIS2024008', email: 'yash.shetty@student.mis.edu', password: 'student123', dateOfBirth: '2010-07-22', gender: 'Male', bloodGroup: 'AB+', parentName: 'Mrs. Pooja Shetty', parentPhone: '+91-9800000017', parentEmail: 'pooja.shetty@gmail.com' },
  { firstName: 'Zara', lastName: 'Ahmed', rollNumber: 'MIS2024009', email: 'zara.ahmed@student.mis.edu', password: 'student123', dateOfBirth: '2010-09-11', gender: 'Female', bloodGroup: 'O+', parentName: 'Mr. Imran Ahmed', parentPhone: '+91-9800000018', parentEmail: 'imran.ahmed@gmail.com' },
];

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seeding...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected for seeding\n');

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await School.deleteMany({});
    await Admin.deleteMany({});
    await Class.deleteMany({});
    await Student.deleteMany({});
    await Attendance.deleteMany({});
    await Notice.deleteMany({});
    await Report.deleteMany({});
    console.log('✅ Existing data cleared\n');

    // Create Schools
    console.log('🏫 Creating schools...');
    const createdSchools = [];
    for (const schoolData of schools) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(schoolData.password, salt);
      const school = await School.create({
        ...schoolData,
        password: hashedPassword,
      });
      createdSchools.push(school);
      console.log(`   ✓ Created school: ${school.schoolName}`);
    }
    console.log('✅ Schools created\n');

    // Create Admins
    console.log('👤 Creating admins...');
    const createdAdmins = [];
    for (let i = 0; i < adminsData.length; i++) {
      const adminData = adminsData[i];
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(adminData.password, salt);
      const admin = await Admin.create({
        ...adminData,
        schoolId: createdSchools[i]._id,
        password: hashedPassword,
      });
      createdAdmins.push(admin);
      console.log(`   ✓ Created admin: ${admin.name} (${admin.email}) for ${createdSchools[i].schoolName}`);
    }
    console.log('✅ Admins created\n');

    // Create Classes for each school
    console.log('📚 Creating classes...');
    const createdClasses = [];
    for (const school of createdSchools) {
      for (const classData of classesData) {
        const classDoc = await Class.create({
          ...classData,
          schoolId: school._id,
        });
        createdClasses.push(classDoc);
        console.log(`   ✓ Created class: ${classDoc.className}-${classDoc.section} for ${school.schoolName}`);
      }
    }
    console.log('✅ Classes created\n');

    // Create Students for school 1
    console.log('👨‍🎓 Creating students for School 1...');
    const createdStudents = [];
    const school1Classes = createdClasses.filter(c => c.schoolId.equals(createdSchools[0]._id));

    for (let i = 0; i < studentsData.length; i++) {
      const studentData = studentsData[i];
      const classIndex = Math.floor(i / 3); // 3 students per class
      const classDoc = school1Classes[classIndex];

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(studentData.password, salt);
      const parentAccessCode = await generateParentAccessCode(createdSchools[0]._id);

      const student = await Student.create({
        ...studentData,
        schoolId: createdSchools[0]._id,
        classId: classDoc._id,
        password: hashedPassword,
        parentAccessCode,
        address: `${studentData.firstName}'s Home, Delhi`,
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001',
      });
      createdStudents.push(student);
      console.log(`   ✓ Created student: ${student.firstName} ${student.lastName} (Roll: ${student.rollNumber}) - Parent Code: ${parentAccessCode}`);
    }
    console.log('✅ Students created for School 1\n');

    // Create Students for school 2
    console.log('👨‍🎓 Creating students for School 2...');
    const school2Classes = createdClasses.filter(c => c.schoolId.equals(createdSchools[1]._id));

    for (let i = 0; i < studentsData2.length; i++) {
      const studentData = studentsData2[i];
      const classIndex = Math.floor(i / 3); // 3 students per class
      const classDoc = school2Classes[classIndex];

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(studentData.password, salt);
      const parentAccessCode = await generateParentAccessCode(createdSchools[1]._id);

      const student = await Student.create({
        ...studentData,
        schoolId: createdSchools[1]._id,
        classId: classDoc._id,
        password: hashedPassword,
        parentAccessCode,
        address: `${studentData.firstName}'s Home, Bangalore`,
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
      });
      createdStudents.push(student);
      console.log(`   ✓ Created student: ${student.firstName} ${student.lastName} (Roll: ${student.rollNumber}) - Parent Code: ${parentAccessCode}`);
    }
    console.log('✅ Students created for School 2\n');

    // Create Attendance records for last 10 days
    console.log('📋 Creating attendance records...');
    let attendanceCount = 0;
    const today = new Date();
    for (let day = 9; day >= 0; day--) {
      const date = new Date(today);
      date.setDate(date.getDate() - day);
      date.setHours(0, 0, 0, 0);

      for (const student of createdStudents) {
        // 90% present, 10% absent
        const isPresent = Math.random() > 0.1;
        await Attendance.create({
          schoolId: student.schoolId,
          classId: student.classId,
          studentId: student._id,
          date,
          status: isPresent ? 'Present' : 'Absent',
          markedBy: createdAdmins.find(a => a.schoolId.equals(student.schoolId))?._id,
          period: 'Full Day',
        });
        attendanceCount++;
      }
    }
    console.log(`   ✓ Created ${attendanceCount} attendance records for last 10 days`);
    console.log('✅ Attendance records created\n');

    // Create Notices
    console.log('📢 Creating notices...');
    const noticesData = [
      { title: 'Parent-Teacher Meeting', description: 'Parent-Teacher meeting scheduled for next Saturday at 10 AM. All parents are requested to attend.', category: 'General', priority: 'High', targetAudience: 'Parents' },
      { title: 'Annual Day Celebration', description: 'Annual day will be celebrated on 25th December. Participate in various cultural activities.', category: 'Event', priority: 'Medium', targetAudience: 'All' },
      { title: 'Mid-Term Exam Schedule', description: 'Mid-term exams will be conducted from 1st to 10th of next month. Study well!', category: 'Exam', priority: 'Urgent', targetAudience: 'Students' },
      { title: 'Sports Day Event', description: 'Annual sports day event on 15th January. All students must participate.', category: 'Sports', priority: 'Medium', targetAudience: 'Students' },
      { title: 'Winter Holiday Notice', description: 'School will remain closed for winter holidays from 20th Dec to 5th Jan.', category: 'Holiday', priority: 'High', targetAudience: 'All' },
    ];

    for (const school of createdSchools) {
      const admin = createdAdmins.find(a => a.schoolId.equals(school._id));
      for (const noticeData of noticesData) {
        await Notice.create({
          ...noticeData,
          schoolId: school._id,
          postedBy: admin._id,
        });
      }
    }
    console.log(`   ✓ Created ${noticesData.length * 2} notices`);
    console.log('✅ Notices created\n');

    // Create Reports
    console.log('📊 Creating reports...');
    let reportCount = 0;
    for (const student of createdStudents) {
      // Create 2 reports per student
      const examTypes = ['Mid Term', 'Final'];
      for (const examType of examTypes) {
        const subjects = [
          { subjectName: 'Mathematics', marksObtained: Math.floor(Math.random() * 30) + 70, totalMarks: 100 },
          { subjectName: 'Science', marksObtained: Math.floor(Math.random() * 30) + 70, totalMarks: 100 },
          { subjectName: 'English', marksObtained: Math.floor(Math.random() * 30) + 70, totalMarks: 100 },
          { subjectName: 'Social Studies', marksObtained: Math.floor(Math.random() * 30) + 70, totalMarks: 100 },
          { subjectName: 'Hindi', marksObtained: Math.floor(Math.random() * 30) + 70, totalMarks: 100 },
        ];

        const totalMarksObtained = subjects.reduce((sum, s) => sum + s.marksObtained, 0);
        const totalMarks = subjects.reduce((sum, s) => sum + s.totalMarks, 0);
        const percentage = (totalMarksObtained / totalMarks) * 100;

        await Report.create({
          schoolId: student.schoolId,
          studentId: student._id,
          classId: student.classId,
          examType,
          academicYear: '2024-2025',
          subjects,
          totalMarksObtained,
          totalMarks,
          percentage: parseFloat(percentage.toFixed(2)),
          overallGrade: percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : 'C',
          isPublished: true,
        });
        reportCount++;
      }
    }
    console.log(`   ✓ Created ${reportCount} reports`);
    console.log('✅ Reports created\n');

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 Summary:');
    console.log(`   Schools: ${createdSchools.length}`);
    console.log(`   Admins: ${createdAdmins.length}`);
    console.log(`   Classes: ${createdClasses.length}`);
    console.log(`   Students: ${createdStudents.length}`);
    console.log(`   Attendance Records: ${attendanceCount}`);
    console.log(`   Notices: ${noticesData.length * 2}`);
    console.log(`   Reports: ${reportCount}\n`);

    console.log('🔑 Login Credentials:\n');
    console.log('SCHOOL 1: Delhi Public School');
    console.log('   Admin Email: admin@gmail.com');
    console.log('   Admin Password: admin123\n');
    console.log('SCHOOL 2: Modern International School');
    console.log('   Admin Email: priya.sharma@misbangalore.edu');
    console.log('   Admin Password: admin123\n');

    console.log('👨‍👩‍👧‍👦 Parent Access Codes (sample):');
    const sampleStudents = createdStudents.slice(0, 3);
    for (const student of sampleStudents) {
      console.log(`   ${student.firstName} ${student.lastName}: ${student.parentAccessCode}`);
    }
    console.log('\n💡 Use these parent access codes to login from parent portal!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
