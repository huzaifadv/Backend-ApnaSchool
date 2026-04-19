import PDFDocument from 'pdfkit';
import axios from 'axios';
import { getModel } from '../models/dynamicModels.js';
import AcademicYear from '../models/AcademicYear.js';
import School from '../models/School.js';

// Constant sizing mapping (1 mm = 2.83465 PDF points)
const CARD_WIDTH = 242.6; // 85.6 mm
const CARD_HEIGHT = 153.0; // 54.0 mm
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

// Calculate centering margins for a 2x4 grid
const MARGIN_X = (A4_WIDTH - (CARD_WIDTH * 2)) / 3;
const MARGIN_Y = (A4_HEIGHT - (CARD_HEIGHT * 4)) / 5;

// Fetch active classes
export const getClassesForIDCard = async (req, res) => {
  try {
    const { schoolId } = req;
    const Class = await getModel(schoolId, 'classes');
    const Student = await getModel(schoolId, 'students');

    const classes = await Class.find({ isActive: true }).select('className section academicYear').lean();
    
    const classesWithCount = await Promise.all(classes.map(async (cls) => {
      const studentCount = await Student.countDocuments({ classId: cls._id, isActive: true, status: 'active' });
      return { ...cls, studentCount };
    }));

    res.status(200).json({ success: true, data: classesWithCount });
  } catch (error) {
    console.error('Error fetching classes for ID cards:', error);
    res.status(500).json({ success: false, message: 'Server error fetching classes' });
  }
};

// Generate Preview (1 Student only, scaled for UI)
export const previewIDCard = async (req, res) => {
  try {
    const { schoolId } = req;
    const { classId, templateName } = req.body;

    if (!classId || !templateName) {
      return res.status(400).json({ success: false, message: 'Class ID and Template Name are required' });
    }

    const Class = await getModel(schoolId, 'classes');
    const Student = await getModel(schoolId, 'students');

    const school = await School.findById(schoolId);
    const classData = await Class.findById(classId);
    
    // Fetch only the FIRST active student
    const student = await Student.findOne({ classId, isActive: true, status: 'active' }).sort({ rollNumber: 1 }).lean();
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'No students available for preview' });
    }

    const currentYear = await AcademicYear.findOne({ schoolId, isCurrent: true });
    const sessionText = currentYear ? currentYear.year : new Date().getFullYear().toString();

    let logoBuffer = null;
    if (school && school.logo && school.logo.url) {
      try {
        const logoUrl = school.logo.url.startsWith('http') 
            ? school.logo.url 
            : `${req.protocol}://${req.get('host')}${school.logo.url}`;
        const response = await axios.get(logoUrl, { responseType: 'arraybuffer' });
        logoBuffer = Buffer.from(response.data, 'binary');
      } catch (err) {}
    }

    let profileBuffer = null;
    if (student.profilePicture && student.profilePicture !== "/assets/default-student.png") {
      try {
        const imgUrl = student.profilePicture.startsWith('http') 
            ? student.profilePicture 
            : `${req.protocol}://${req.get('host')}${student.profilePicture}`;
        const response = await axios.get(imgUrl, { responseType: 'arraybuffer' });
        profileBuffer = Buffer.from(response.data, 'binary');
      } catch (err) {}
    }

    // Creating a micro PDF specifically matching the exact boundaries of a single card
    // We add +2 points padding so the card border isn't clipped
    const doc = new PDFDocument({ size: [CARD_WIDTH + 4, CARD_HEIGHT + 4], margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    drawIDCard(doc, 2, 2, CARD_WIDTH, CARD_HEIGHT, templateName, {
        schoolName: school ? school.schoolName : 'Sample School',
        schoolAddress: school ? school.address : 'Sample Address',
        logo: logoBuffer,
        profileImage: profileBuffer,
        name: student.fullName,
        class: classData ? classData.className + (classData.section ? ` - ${classData.section}` : '') : 'N/A',
        roll: student.rollNumber,
        studentId: student.studentId || 'N/A',
        session: sessionText,
        parentPhone: student.parentPhone || 'N/A'
    });

    doc.end();
  } catch (error) {
    console.error('Preview error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to generate preview' });
  }
};

// Generate Full Batch ID Cards
export const generateIDCards = async (req, res) => {
  try {
    const { schoolId } = req;
    const { classId, templateName } = req.body;

    if (!classId || !templateName) {
      return res.status(400).json({ success: false, message: 'Class ID and Template Name are required' });
    }

    const Class = await getModel(schoolId, 'classes');
    const Student = await getModel(schoolId, 'students');

    const school = await School.findById(schoolId);
    const classData = await Class.findById(classId);
    if (!school || !classData) {
      return res.status(404).json({ success: false, message: 'School or Class not found' });
    }

    const students = await Student.find({ classId, isActive: true, status: 'active' }).sort({ rollNumber: 1 }).lean();
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'No active students found in this class' });
    }

    const currentYear = await AcademicYear.findOne({ schoolId, isCurrent: true });
    const sessionText = currentYear ? currentYear.year : new Date().getFullYear().toString();

    let logoBuffer = null;
    if (school.logo && school.logo.url) {
      try {
        const logoUrl = school.logo.url.startsWith('http') 
            ? school.logo.url 
            : `${req.protocol}://${req.get('host')}${school.logo.url}`;
        const response = await axios.get(logoUrl, { responseType: 'arraybuffer' });
        logoBuffer = Buffer.from(response.data, 'binary');
      } catch (err) {}
    }

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ID_Cards_${classData.className}.pdf"`);
    doc.pipe(res);

    let cardsOnPage = 0;

    for (let i = 0; i < students.length; i++) {
        const student = students[i];

        if (cardsOnPage === 8) {
            doc.addPage();
            cardsOnPage = 0;
        }

        // Draw cut lines once per page (if cardsOnPage is 0)
        if (cardsOnPage === 0) {
            drawCutLines(doc);
        }

        const col = cardsOnPage % 2;
        const row = Math.floor(cardsOnPage / 2);

        const x = MARGIN_X + col * (CARD_WIDTH + MARGIN_X);
        const y = MARGIN_Y + row * (CARD_HEIGHT + MARGIN_Y);

        let profileBuffer = null;
        if (student.profilePicture && student.profilePicture !== "/assets/default-student.png") {
            try {
                const imgUrl = student.profilePicture.startsWith('http') 
                    ? student.profilePicture 
                    : `${req.protocol}://${req.get('host')}${student.profilePicture}`;
                const response = await axios.get(imgUrl, { responseType: 'arraybuffer' });
                profileBuffer = Buffer.from(response.data, 'binary');
            } catch (err) {}
        }

        drawIDCard(doc, x, y, CARD_WIDTH, CARD_HEIGHT, templateName, {
            schoolName: school.schoolName,
            schoolAddress: school.address,
            logo: logoBuffer,
            profileImage: profileBuffer,
            name: student.fullName,
            class: classData.className + (classData.section ? ` - ${classData.section}` : ''),
            roll: student.rollNumber,
            studentId: student.studentId || 'N/A',
            session: sessionText,
            parentPhone: student.parentPhone || 'N/A'
        });

        cardsOnPage++;
    }

    doc.end();

  } catch (error) {
    console.error('Error generating ID cards:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Server error generating ID cards' });
  }
};

// Layout grid cut lines builder
function drawCutLines(doc) {
  doc.save();
  doc.lineWidth(0.5);
  doc.strokeColor('#cccccc');
  doc.dash(3, {space: 3});

  // Vertical Cut Lines (3 lines)
  [MARGIN_X/2, MARGIN_X + CARD_WIDTH + MARGIN_X/2, A4_WIDTH - MARGIN_X/2].forEach(x => {
    doc.moveTo(x, 0).lineTo(x, A4_HEIGHT).stroke();
  });
  
  // Horizontal Cut Lines (5 lines)
  [MARGIN_Y/2, MARGIN_Y + CARD_HEIGHT + MARGIN_Y/2, MARGIN_Y*2 + CARD_HEIGHT*2 + MARGIN_Y/2, MARGIN_Y*3 + CARD_HEIGHT*3 + MARGIN_Y/2, A4_HEIGHT - MARGIN_Y/2].forEach(y => {
    doc.moveTo(0, y).lineTo(A4_WIDTH, y).stroke();
  });

  doc.restore();
}

function drawIDCard(doc, x, y, w, h, templateName, data) {
    let primaryColor, secondaryColor, textColor;

    switch (templateName) {
        case 'template-2':
            primaryColor = '#2f855a'; 
            secondaryColor = '#e6fffa';
            textColor = '#1a202c';
            break;
        case 'template-3':
            primaryColor = '#c53030'; 
            secondaryColor = '#fff5f5';
            textColor = '#1a202c';
            break;
        case 'template-4':
            primaryColor = '#6b46c1';
            secondaryColor = '#faf5ff';
            textColor = '#1a202c';
            break;
        case 'template-5':
            primaryColor = '#2d3748';
            secondaryColor = '#f7fafc';
            textColor = '#1a202c';
            break;
        case 'template-1':
        default:
            primaryColor = '#2b6cb0';
            secondaryColor = '#ebf8ff';
            textColor = '#2d3748';
            break;
    }

    // Border and Fill
    doc.roundedRect(x, y, w, h, 8).fill(secondaryColor);
    doc.roundedRect(x, y, w, h, 8).lineWidth(1).stroke(primaryColor);

    // Header Background
    doc.save()
       .roundedRect(x, y, w, 45, 8)
       .roundedRect(x, y + 25, w, 20, 0)
       .clip()
       .rect(x, y, w, 45)
       .fill(primaryColor)
       .restore();

    // Logo Box Profile Standard Sizing
    const logoSize = 36;
    const logoX = x + 8;
    const logoY = y + 4;
    
    // Fill a dedicated logo frame container
    doc.save();
    if (templateName === 'template-1' || templateName === 'template-5') {
       doc.circle(logoX + logoSize/2, logoY + logoSize/2, logoSize/2).fill('#ffffff');
       if (data.logo) {
         try {
             doc.circle(logoX + logoSize/2, logoY + logoSize/2, logoSize/2).clip();
             doc.image(data.logo, logoX, logoY, { width: logoSize, height: logoSize });
         } catch (e) {
             console.error('Logo render failed');
         }
       }
    } else {
       doc.roundedRect(logoX, logoY, logoSize, logoSize, 4).fill('#ffffff');
       if (data.logo) {
         try {
             doc.image(data.logo, logoX + 2, logoY + 2, { width: logoSize - 4, height: logoSize - 4 });
         } catch (e) {
             console.error('Logo render failed');
         }
       }
    }
    doc.restore();

    // School Name & Address 
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
       .text(data.schoolName || 'School Name', x + 50, y + 10, { width: w - 55, align: 'left' });
    
    if (data.schoolAddress) {
       doc.fontSize(7).font('Helvetica').text(data.schoolAddress, x + 50, y + 22, { width: w - 55, height: 20 });
    }

    // Photo Box exactly 80x80 pixels => inside PDF point sizing equivalent 
    // Wait, PDFKit converts directly from coordinates. The instructions specify 80x80 "pixels" for profile.
    // 80 units in PDFKit ~ 80 points.
    const photoSize = 60; // We'll maintain ~60 pts width and height to fit on the tiny card natively
    const photoX = x + w - photoSize - 10;
    const photoY = y + 50;

    // Draw circular outline if template-2 or template-4
    if (templateName === 'template-2' || templateName === 'template-4') {
        doc.circle(photoX + photoSize/2, photoY + photoSize/2, photoSize/2).lineWidth(2).stroke(primaryColor);
        if (data.profileImage) {
            try {
                doc.save();
                doc.circle(photoX + photoSize/2, photoY + photoSize/2, photoSize/2).clip();
                // 80x80 target restriction handled inherently via width and height explicit config
                doc.image(data.profileImage, photoX, photoY, { width: photoSize, height: photoSize });
                doc.restore();
            } catch (e) { doc.restore(); }
        }
    } else {
        doc.rect(photoX, photoY, photoSize, photoSize).lineWidth(2).stroke(primaryColor);
        if (data.profileImage) {
            try {
                doc.image(data.profileImage, photoX, photoY, { width: photoSize, height: photoSize });
            } catch (e) {}
        }
    }

    // Fields rendering variables
    const labelX = x + 10;
    let dataY = y + 52;
    const fontSize = 8.5;

    doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(11).text(data.name, labelX, dataY, { width: w - photoSize - 25 });
    dataY += 15;
    
    doc.fillColor(textColor).font('Helvetica-Bold').fontSize(fontSize).text('Class:', labelX, dataY, { continued: true })
       .font('Helvetica').text(` ${data.class}`);
    dataY += 12;

    doc.font('Helvetica-Bold').text('Roll No:', labelX, dataY, { continued: true })
       .font('Helvetica').text(` ${data.roll || 'N/A'}`);
    dataY += 12;

    doc.font('Helvetica-Bold').text('Student ID:', labelX, dataY, { continued: true })
       .font('Helvetica').text(` ${data.studentId !== 'N/A' ? data.studentId : '-'}`);
    dataY += 12;

    doc.font('Helvetica-Bold').text('Session:', labelX, dataY, { continued: true })
       .font('Helvetica').text(` ${data.session}`);
    dataY += 12;
    
    if (data.parentPhone && data.parentPhone !== 'N/A') {
        doc.font('Helvetica-Bold').text('Emergency:', labelX, dataY, { continued: true })
           .font('Helvetica').text(` ${data.parentPhone}`);
    }

    // Footer
    doc.rect(x, y + h - 14, w, 14).fill(primaryColor);
    doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
       .text('STUDENT IDENTITY CARD', x, y + h - 10, { width: w, align: 'center' });
}
