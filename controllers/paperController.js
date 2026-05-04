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
    const doc = new PDFDocument({ 
      margins: { top: 57, bottom: 57, left: 71, right: 57 },
      bufferPages: true 
    });
    const filename = `paper-${Date.now()}.pdf`;
    const folderPath = path.join(process.cwd(), 'uploads', 'generated');
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    const pdfPath = path.join(folderPath, filename);
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Header: School Logo
    const headerStartY = doc.y;
    let hasLogo = false;
    let logoBuffer = null;

    if (school && school.logo && school.logo.url) {
      try {
        const logoUrl = school.logo.url;
        if (logoUrl.startsWith('http')) {
          const response = await axios.get(logoUrl, { responseType: 'arraybuffer' });
          logoBuffer = Buffer.from(response.data, 'binary');
        } else {
          const localPath = path.join(process.cwd(), logoUrl);
          if (fs.existsSync(localPath)) {
            logoBuffer = fs.readFileSync(localPath);
          }
        }
        
        if (logoBuffer) {
          // Max size 35x35mm (~99pt), top-left corner
          doc.image(logoBuffer, 71, headerStartY, { fit: [99, 99] });
          hasLogo = true;
        }
      } catch (err) {
        console.error('Logo fetch failed', err.message);
      }
    }

    // School Name & Address (Centered)
    const textStartX = hasLogo ? 180 : 71;
    const headerTextWidth = doc.page.width - textStartX - 57;
    
    doc.y = headerStartY + (hasLogo ? 15 : 0); // Vertically align with logo
    doc.fontSize(16).font('Helvetica-Bold').text(school?.schoolName || 'School Name', textStartX, doc.y, { align: 'center', width: headerTextWidth });
    doc.fontSize(10).font('Helvetica').text(school?.address || '', textStartX, doc.y, { align: 'center', width: headerTextWidth });
    doc.moveDown(1);

    // Ensure y is below logo for the metadata section
    const endHeaderY = Math.max(doc.y, headerStartY + 105);
    doc.y = endHeaderY;

    // Exam Info
    doc.fontSize(12).font('Helvetica-Bold').text(basket.examTitle, 71, doc.y, { align: 'center', width: doc.page.width - 71 - 57 });
    doc.moveDown(1);

    // Metadata Table
    const tableWidth = doc.page.width - 71 - 57;
    const col2X = 71 + (tableWidth / 2);
    
    doc.fontSize(10).font('Helvetica');
    const printRow = (leftText, rightText) => {
      const startY = doc.y;
      doc.text(leftText, 71, startY, { width: tableWidth / 2, align: 'left' });
      const midY = doc.y;
      doc.text(rightText, col2X, startY, { width: tableWidth / 2, align: 'left' });
      doc.y = Math.max(midY, doc.y);
    };

    printRow(`Subject: ${subjectName}`, `Date: ${new Date().toLocaleDateString()}`);
    printRow(`Class: ${classDoc ? classDoc.className : 'N/A'}`, `Time Allowed: ${basket.timeAllowed}`);
    printRow(`Session: ${sessionYear}`, `Total Marks: ${basket.totalMarks}`);
    
    doc.moveDown(0.5);
    doc.moveTo(71, doc.y).lineTo(doc.page.width - 57, doc.y).stroke();
    doc.moveDown(1);

    // Sections
    const mcqs = questions.filter(q => q.type === 'MCQ');
    const shorts = questions.filter(q => q.type === 'Short');
    const longs = questions.filter(q => q.type === 'Long');

    const drawSectionHeader = (title) => {
      // Check if we need a new page for the header to avoid orphans
      if (doc.y + 40 > doc.page.height - 57) doc.addPage();
      
      const startY = doc.y;
      doc.rect(71, startY, doc.page.width - 71 - 57, 22).fill('#f0f0f0');
      doc.fillColor('black').fontSize(12).font('Helvetica-Bold').text(title, 75, startY + 6);
      doc.y = startY + 22; // ensure we move below the rect
      doc.moveDown(0.5);
    };

    // Section A: MCQs
    if (mcqs.length > 0) {
      doc.x = 71;
      drawSectionHeader('Section A: Multiple Choice Questions');
      mcqs.forEach((q, i) => {
        // Prevent question from splitting awkwardly if possible
        if (doc.y + 60 > doc.page.height - 57) doc.addPage();
        
        const startY = doc.y;
        doc.fontSize(11).font('Helvetica').text(`${i + 1}. ${q.questionText}`, 71, startY, { width: doc.page.width - 71 - 57 - 80, align: 'left' });
        const endY = doc.y;
        doc.fontSize(10).text(`(${q.marks} Marks)`, doc.page.width - 57 - 80, startY, { width: 80, align: 'right' });
        doc.y = Math.max(endY, doc.y);
        doc.moveDown(0.5);
        
        // Options on separate lines with indent
        const opts = q.options || [];
        const labels = ['(A)', '(B)', '(C)', '(D)'];
        opts.forEach((opt, idx) => {
          // 30mm indent from the left edge of the page (~85pt)
          doc.text(`${labels[idx]} ${opt}`, 85, doc.y, { width: doc.page.width - 85 - 57, align: 'left' }); 
          doc.moveDown(0.2);
        });
        doc.moveDown(1.5);
      });
      doc.moveDown(1);
    }

    // Section B: Short Questions
    if (shorts.length > 0) {
      doc.x = 71;
      drawSectionHeader('Section B: Short Questions');
      shorts.forEach((q, i) => {
        if (doc.y + 30 > doc.page.height - 57) doc.addPage();
        
        const startY = doc.y;
        doc.fontSize(11).font('Helvetica').text(`${i + 1}. ${q.questionText}`, 71, startY, { width: doc.page.width - 71 - 57 - 80, align: 'left' });
        const endY = doc.y;
        doc.fontSize(10).text(`(${q.marks} Marks)`, doc.page.width - 57 - 80, startY, { width: 80, align: 'right' });
        doc.y = Math.max(endY, doc.y);
        doc.moveDown(1.5);
      });
      doc.moveDown(1);
    }

    // Section C: Long Questions
    if (longs.length > 0) {
      doc.x = 71;
      drawSectionHeader('Section C: Long Questions');
      longs.forEach((q, i) => {
        if (doc.y + 30 > doc.page.height - 57) doc.addPage();
        
        const startY = doc.y;
        doc.fontSize(11).font('Helvetica').text(`${i + 1}. ${q.questionText}`, 71, startY, { width: doc.page.width - 71 - 57 - 80, align: 'left' });
        const endY = doc.y;
        doc.fontSize(10).text(`(${q.marks} Marks)`, doc.page.width - 57 - 80, startY, { width: 80, align: 'right' });
        doc.y = Math.max(endY, doc.y);
        doc.moveDown(1.5);
      });
      doc.moveDown(1);
    }

    // Page Numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(10).font('Helvetica').text(
        `Page ${i + 1} of ${range.count}`,
        71,
        doc.page.height - 40,
        { align: 'center', width: doc.page.width - 71 - 57 }
      );
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
