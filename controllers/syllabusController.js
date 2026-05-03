import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import axios from 'axios';
import School from '../models/School.js';
import GeneratedSyllabus from '../models/GeneratedSyllabus.js';
import { getModel } from '../models/dynamicModels.js';

export const generateSyllabus = async (req, res) => {
  try {
    const { topics, classId, subjectId, sessionYear } = req.body;
    const schoolId = req.schoolId;

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ success: false, message: 'Topics are required' });
    }

    const school = await School.findById(schoolId);
    
    // Fetch Class/Subject names for header
    const Class = await getModel(schoolId, 'classes');
    const classDoc = await Class.findById(classId);

    const doc = new PDFDocument({ margin: 50 });
    const filename = `syllabus-${Date.now()}.pdf`;
    const folderPath = path.join(process.cwd(), 'uploads', 'generated');
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    const pdfPath = path.join(folderPath, filename);
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Header
    if (school && school.logo && school.logo.url) {
      try {
        const logoUrl = school.logo.url.startsWith('http') ? school.logo.url : `${req.protocol}://${req.get('host')}${school.logo.url}`;
        const response = await axios.get(logoUrl, { responseType: 'arraybuffer' });
        doc.image(Buffer.from(response.data, 'binary'), { fit: [80, 80], align: 'center' }).moveDown(1);
      } catch (err) {}
    }

    doc.fontSize(20).font('Helvetica-Bold').text(school?.schoolName || 'School Name', { align: 'center' });
    doc.fontSize(16).text('Syllabus', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica').text(`Class: ${classDoc ? classDoc.className : classId} | Subject: ${subjectId} | Year: ${sessionYear}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Body—Topic Table
    topics.forEach((topic) => {
      let indent = 0;
      let font = 'Helvetica';
      let fontSize = 11;

      if (topic.type === 'Chapter Heading') {
        indent = 0;
        font = 'Helvetica-Bold';
        fontSize = 12;
        doc.moveDown(0.5);
      } else if (topic.type === 'Topic') {
        indent = 20;
      } else if (topic.type === 'Sub-topic') {
        indent = 40;
        fontSize = 10;
      }

      doc.fontSize(fontSize).font(font).text(topic.text, 50 + indent);
      doc.moveDown(0.2);
    });

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

export const getSyllabusHistory = async (req, res) => {
  try {
    const { schoolId } = req;
    const history = await GeneratedSyllabus.find({ schoolId }).sort({ createdAt: -1 });
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
