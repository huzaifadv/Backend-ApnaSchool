import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import axios from 'axios';
import School from '../models/School.js';
import GeneratedSyllabus from '../models/GeneratedSyllabus.js';
import { getModel } from '../models/dynamicModels.js';

export const generateSyllabus = async (req, res) => {
  try {
    const { syllabus, classId, subjectId, sessionYear } = req.body;
    const schoolId = req.schoolId;

    if (!syllabus || !Array.isArray(syllabus) || syllabus.length === 0) {
      return res.status(400).json({ success: false, message: 'Syllabus content is required' });
    }

    const school = await School.findById(schoolId);
    
    // Fetch Class/Subject names for header
    const Class = await getModel(schoolId, 'classes');
    const classDoc = await Class.findById(classId);

    const doc = new PDFDocument({ 
      margins: { top: 57, bottom: 57, left: 71, right: 57 },
      bufferPages: true 
    });
    
    const filename = `syllabus-${Date.now()}.pdf`;
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

    // Horizontal divider line after header
    doc.moveTo(71, doc.y).lineTo(doc.page.width - 57, doc.y).stroke();
    doc.moveDown(1);

    // Syllabus Title
    doc.fontSize(16).font('Helvetica-Bold').text('Syllabus', 71, doc.y, { align: 'center', width: doc.page.width - 71 - 57 });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica').text(`Class: ${classDoc ? classDoc.className : classId} | Subject: ${subjectId} | Year: ${sessionYear}`, 71, doc.y, { align: 'center', width: doc.page.width - 71 - 57 });
    doc.moveDown(0.5);
    
    doc.moveTo(71, doc.y).lineTo(doc.page.width - 57, doc.y).stroke();
    doc.moveDown(1);

    // Body—Syllabus Outline
    syllabus.forEach((term) => {
      // Term: Bold 14pt with full-width colored header bar #2C3E50
      if (doc.y + 40 > doc.page.height - 57) doc.addPage();

      const startY = doc.y;
      doc.rect(71, startY, doc.page.width - 71 - 57, 24).fill('#2C3E50');
      doc.fillColor('white').fontSize(14).font('Helvetica-Bold').text(term.title, 75, startY + 6);
      doc.fillColor('black'); // Reset to black
      doc.y = startY + 24; // Move past the rect
      doc.moveDown(0.5);

      term.chapters.forEach((chapter) => {
        if (doc.y + 20 > doc.page.height - 57) doc.addPage();
        
        // Chapter: Bold 11pt, indented 15mm (42.5pt) from left margin
        const chapterIndentX = 71 + 42.5;
        doc.fontSize(11).font('Helvetica-Bold').text(chapter.title, chapterIndentX, doc.y);
        doc.y += 8; // Spacing 8pt

        chapter.topics.forEach((topic) => {
          if (doc.y + 15 > doc.page.height - 57) doc.addPage();
          
          // Topic: Regular 10pt, indented 25mm (71pt) from left margin
          const topicIndentX = 71 + 71;
          doc.fontSize(10).font('Helvetica').text(topic.title, topicIndentX, doc.y);
          doc.y += 8; // Spacing 8pt
        });
        
        doc.y += 8; // Extra spacing after chapter
      });
      doc.moveDown(1);
    });

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
      const syllabusRecord = new GeneratedSyllabus({
        schoolId,
        classId,
        subjectId,
        sessionYear,
        pdfPath: `/uploads/generated/${filename}`
      });
      await syllabusRecord.save();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Syllabus_${subjectId}.pdf`);
      fs.createReadStream(pdfPath).pipe(res);
    });

  } catch (error) {
    console.error('Generate Syllabus Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
};

export default { generateSyllabus };

export const getSyllabusHistory = async (req, res) => {
  try {
    const { schoolId } = req;
    const history = await GeneratedSyllabus.find({ schoolId }).sort({ createdAt: -1 });
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
