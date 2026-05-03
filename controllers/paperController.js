import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import axios from 'axios';
import QuestionBasket from '../models/QuestionBasket.js';
import Question from '../models/Question.js';
import GeneratedPaper from '../models/GeneratedPaper.js';
import School from '../models/School.js';
import AcademicYear from '../models/AcademicYear.js';
import { getModel } from '../models/dynamicModels.js';

export const generatePaper = async (req, res) => {
  try {
    const { basketId, classId, subjectId } = req.body;
    const schoolId = req.schoolId;
    const teacherDbId = req.staffDbId;

    if (!basketId || !classId || !subjectId) {
      return res.status(400).json({ success: false, message: 'basketId, classId, and subjectId are required' });
    }

    // Fetch Basket and Questions
    const basket = await QuestionBasket.findById(basketId);
    if (!basket) return res.status(404).json({ success: false, message: 'Basket not found' });
    
    const questions = await Question.find({ basketId });
    
    // Fetch School Info
    const school = await School.findById(schoolId);
    
    // Fetch Teacher Info
    const Staff = await getModel(schoolId, 'staffs');
    const teacher = await Staff.findById(teacherDbId);
    
    // Fetch Class Info
    const Class = await getModel(schoolId, 'classes');
    const classDoc = await Class.findById(classId);
    
    // Fetch Session Year
    const sessionDoc = await AcademicYear.findOne({ schoolId, isCurrent: true });
    const sessionYear = sessionDoc ? sessionDoc.year : new Date().getFullYear();

    // Fetch Subject Name - Use name directly if subjectId is the name, or find in assignedClasses
    let subjectName = subjectId;
    if (teacher && teacher.assignedClasses) {
      const assigned = teacher.assignedClasses.find(c => c.classId.toString() === classId.toString());
      if (assigned && assigned.subjects && assigned.subjects.includes(subjectId)) {
        subjectName = subjectId;
      }
    }

    // Build PDF
    const doc = new PDFDocument({ margin: 72 });
    const filename = `paper-${Date.now()}.pdf`;
    const folderPath = path.join(process.cwd(), 'uploads', 'generated');
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    const pdfPath = path.join(folderPath, filename);
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Header: School Logo
    if (school && school.logo && school.logo.url) {
      try {
        const logoUrl = school.logo.url.startsWith('http') ? school.logo.url : `${req.protocol}://${req.get('host')}${school.logo.url}`;
        const response = await axios.get(logoUrl, { responseType: 'arraybuffer' });
        const logoBuffer = Buffer.from(response.data, 'binary');
        doc.image(logoBuffer, { fit: [80, 80], align: 'center' }).moveDown(1);
      } catch (err) {
        console.error('Logo fetch failed', err.message);
      }
    }

    // School Name & Address
    doc.fontSize(20).font('Helvetica-Bold').text(school?.schoolName || 'School Name', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(school?.address || '', { align: 'center' });
    doc.moveDown(1);

    // Exam Info
    doc.fontSize(12).font('Helvetica-Bold').text(basket.examTitle, { align: 'center' });
    doc.moveDown(0.5);

    const subText = `Subject: ${subjectName} | Class: ${classDoc ? classDoc.className : 'N/A'} | Session: ${sessionYear}`;
    const dateText = `Date: ${new Date().toLocaleDateString()} | Time: ${basket.timeAllowed} | Total Marks: ${basket.totalMarks}`;
    
    doc.fontSize(10).font('Helvetica').text(subText, { align: 'center' });
    doc.text(dateText, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Sections
    const mcqs = questions.filter(q => q.type === 'MCQ');
    const shorts = questions.filter(q => q.type === 'Short');
    const longs = questions.filter(q => q.type === 'Long');

    // Section A: MCQs
    if (mcqs.length > 0) {
      doc.x = 72;
      doc.fontSize(14).font('Helvetica-Bold').text('Section A: Multiple Choice Questions', 72, doc.y, { width: 460, align: 'left' });
      doc.moveDown(1);
      mcqs.forEach((q, i) => {
        const startY = doc.y;
        doc.fontSize(11).font('Helvetica').text(`${i + 1}. ${q.questionText}`, 72, startY, { width: 380, align: 'left' });
        const endY = doc.y;
        doc.fontSize(10).text(`(${q.marks} Marks)`, 460, startY, { width: 80, align: 'right' });
        doc.y = Math.max(endY, doc.y);
        doc.moveDown(0.5);
        
        // Options on separate lines with indent
        const opts = q.options || [];
        const labels = ['(A)', '(B)', '(C)', '(D)'];
        opts.forEach((opt, idx) => {
          doc.text(`${labels[idx]} ${opt}`, 90, doc.y, { width: 400, align: 'left' }); // Indented x=90
        });
        doc.moveDown(1.5);
      });
      doc.moveDown(2);
    }

    // Section B: Short Questions
    if (shorts.length > 0) {
      doc.x = 72;
      doc.fontSize(14).font('Helvetica-Bold').text('Section B: Short Questions', 72, doc.y, { width: 460, align: 'left' });
      doc.moveDown(1);
      shorts.forEach((q, i) => {
        const startY = doc.y;
        doc.fontSize(11).font('Helvetica').text(`${i + 1}. ${q.questionText}`, 72, startY, { width: 380, align: 'left' });
        const endY = doc.y;
        doc.fontSize(10).text(`(${q.marks} Marks)`, 460, startY, { width: 80, align: 'right' });
        doc.y = Math.max(endY, doc.y);
        doc.moveDown(1);
      });
      doc.moveDown(2);
    }

    // Section C: Long Questions
    if (longs.length > 0) {
      doc.x = 72;
      doc.fontSize(14).font('Helvetica-Bold').text('Section C: Long Questions', 72, doc.y, { width: 460, align: 'left' });
      doc.moveDown(1);
      longs.forEach((q, i) => {
        const startY = doc.y;
        doc.fontSize(11).font('Helvetica').text(`${i + 1}. ${q.questionText}`, 72, startY, { width: 380, align: 'left' });
        const endY = doc.y;
        doc.fontSize(10).text(`(${q.marks} Marks)`, 460, startY, { width: 80, align: 'right' });
        doc.y = Math.max(endY, doc.y);
        doc.moveDown(1.5);
      });
      doc.moveDown(2);
    }

    doc.end();

    writeStream.on('finish', async () => {
      // Save Record
      const paperRecord = new GeneratedPaper({
        schoolId,
        teacherId: req.staffCode || teacher?.staffId,
        classId,
        subjectId,
        examTitle: basket.examTitle,
        pdfPath: `/uploads/generated/${filename}`
      });
      await paperRecord.save();

      // Return PDF as buffer
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${basket.examTitle.replace(/\s+/g, '_')}.pdf`);
      
      const readStream = fs.createReadStream(pdfPath);
      readStream.pipe(res);
    });

  } catch (error) {
    console.error('Generate Paper Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

export const getPapers = async (req, res) => {
  try {
    const { teacherId } = req.query; // This is the staffId/staffCode
    const papers = await GeneratedPaper.find({ teacherId }).sort({ createdAt: -1 });
    
    // Populate simple info manually if needed or from record
    res.json({ success: true, data: papers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const downloadPaper = async (req, res) => {
  try {
    const paper = await GeneratedPaper.findById(req.params.id);
    if (!paper) return res.status(404).json({ success: false, message: 'Paper not found' });

    const fullPath = path.join(process.cwd(), paper.pdfPath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ success: false, message: 'File missing from server' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=exam-paper.pdf`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
