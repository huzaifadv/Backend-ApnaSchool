import PDFDocument from 'pdfkit';
import axios from 'axios';
import { getModel } from '../models/dynamicModels.js';
import School from '../models/School.js';

const MM = 2.83465;
const A4W = 595.28, A4H = 841.89;

// ── Utilities ─────────────────────────────────────────────────────────────────

const PORTRAIT_TEMPLATES = ['student-red-vertical', 'security-red-vertical', 'staff-purple-vertical'];
const LANDSCAPE_TEMPLATES = [];

function dims(cw, ch, tpl) {
  let w = (cw ? +cw : 85.6) * MM, h = (ch ? +ch : 54) * MM;
  if (PORTRAIT_TEMPLATES.includes(tpl) && w > h) [w, h] = [h, w];
  if (LANDSCAPE_TEMPLATES.includes(tpl) && h > w) [w, h] = [h, w];
  return { w, h };
}

function hexRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#c0392b');
  return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [192, 57, 43];
}

function darken(hex, p = 0.25) {
  return '#' + hexRgb(hex).map(c => Math.max(0, Math.round(c * (1 - p))).toString(16).padStart(2, '0')).join('');
}

function lighten(hex, p = 0.8) {
  return '#' + hexRgb(hex).map(c => Math.min(255, Math.round(c + (255 - c) * p)).toString(16).padStart(2, '0')).join('');
}

function formatDate(val) {
  if (!val) return 'N/A';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function resolveColor(primaryColor, def) {
  if (!primaryColor || primaryColor === '#2b6cb0') return def;
  return primaryColor;
}

function titleCase(str) {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

async function fetchBuf(url, req) {
  if (!url) return null;
  try {
    console.log('[IDCard] Fetching buffer for:', url.substring(0, 100));
    let finalUrl = url;
    if (!url.startsWith('http')) {
      const protocol = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http';
      const host = req?.headers?.host || 'localhost:5000';
      finalUrl = `${protocol}://${host}/${url.replace(/^\/+/, '')}`;
    }
    const response = await axios.get(finalUrl, { responseType: 'arraybuffer', timeout: 6000 });
    return Buffer.from(response.data);
  } catch (err) {
    console.error('fetchBuf error for:', url, err.message);
    return null;
  }
}

function wm(doc, x, y, w, h, logo) {
  if (!logo) return;
  doc.save(); doc.opacity(0.06);
  const s = Math.min(w, h) * 0.65;
  try { doc.image(logo, x + (w - s) / 2, y + (h - s) / 2, { width: s, height: s }); } catch { }
  doc.restore();
}

function drawCircularPhoto(doc, buf, cx, cy, r, borderColor, borderWidth) {
  const bw = borderWidth || 2;
  doc.save();
  // Border ring
  doc.circle(cx, cy, r + bw).lineWidth(bw).strokeColor(borderColor || '#ffffff').stroke();
  // Clip to exact circle — rect clip first so Chrome PDF viewer shows no oversized bounding box
  doc.rect(cx - r, cy - r, r * 2, r * 2).clip();
  doc.circle(cx, cy, r).clip();
  doc.circle(cx, cy, r).fill('#e0e0e0');
  if (!buf) {
    doc.circle(cx, cy - r * 0.15, r * 0.32).fill('#b5b5b5');
    doc.ellipse(cx, cy + r * 0.55, r * 0.45, r * 0.32).fill('#b5b5b5');
  } else {
    try { doc.image(buf, cx - r, cy - r, { width: r * 2, height: r * 2 }); } catch { }
  }
  doc.restore();
}

function drawSquarePhoto(doc, buf, px, py, pw, ph, radius = 4) {
  doc.save();
  // Rounded rect clip
  doc.roundedRect(px, py, pw, ph, radius).clip();
  doc.rect(px, py, pw, ph).fill('#e0e0e0');
  if (!buf) {
    const cx = px + pw / 2, cy = py + ph / 2;
    doc.circle(cx, cy - ph * 0.12, pw * 0.22).fill('#b5b5b5');
    doc.ellipse(cx, cy + ph * 0.22, pw * 0.32, ph * 0.22).fill('#b5b5b5');
  } else {
    try { doc.image(buf, px, py, { width: pw, height: ph, cover: [pw, ph], align: 'center', valign: 'center' }); } catch { }
  }
  doc.restore();
}

function drawLogo(doc, x, y, size, logoBuf) {
  if (logoBuf) {
    try {
      doc.image(logoBuf, x, y, { fit: [size, size], align: 'center', valign: 'center' });
    } catch (e) {
      console.error('Logo draw error:', e.message);
      // Fallback: draw a colored placeholder if image fails
      doc.rect(x, y, size, size).fill('#f0f0f0');
      doc.fontSize(4).fillColor('#999').text('LOGO ERR', x, y + size / 2, { width: size, align: 'center' });
    }
  } else {
    // If no logo buffer, draw a subtle placeholder to show it's missing
    doc.rect(x, y, size, size).lineWidth(0.2).dash(2, { space: 2 }).strokeColor('#dddddd').stroke();
    doc.fontSize(4).fillColor('#cccccc').text('NO LOGO', x, y + size / 2, { width: size, align: 'center' });
  }
}

// Draw cursive-style principal signature
function drawSignature(doc, principalName, x, y, w, color) {
  doc.save();
  const c = color || '#111111';
  const name = principalName || 'Principal';
  // Name ABOVE the line - use fitText to prevent wrapping/overlap
  const sigFs = fitText(doc, name, w, 'Times-BoldItalic', 8, 5);
  doc.fillColor(c).font('Times-BoldItalic').fontSize(sigFs)
    .text(name, x, y - sigFs - 1, { width: w, align: 'center', lineBreak: false });
  // The line
  doc.strokeColor(c).lineWidth(0.5).moveTo(x, y - 1).lineTo(x + w, y - 1).stroke();
  // Label below the line
  doc.fillColor(c).font('Helvetica-Bold').fontSize(5).text('Principal Signature', x, y + 1.5, { width: w, align: 'center', lineBreak: false });
  doc.restore();
}


// Draw a fake QR code placeholder
function drawQR(doc, x, y, size, color) {
  doc.save();
  const c = color || '#333333';
  const cell = size / 7;
  doc.rect(x, y, size, size).lineWidth(0.5).strokeColor(c).stroke();
  doc.rect(x + cell * 0.5, y + cell * 0.5, cell * 2, cell * 2).lineWidth(0.5).strokeColor(c).stroke();
  doc.rect(x + cell * 0.8, y + cell * 0.8, cell * 1.4, cell * 1.4).fill(c);
  doc.rect(x + cell * 4.5, y + cell * 0.5, cell * 2, cell * 2).lineWidth(0.5).strokeColor(c).stroke();
  doc.rect(x + cell * 4.8, y + cell * 0.8, cell * 1.4, cell * 1.4).fill(c);
  doc.rect(x + cell * 0.5, y + cell * 4.5, cell * 2, cell * 2).lineWidth(0.5).strokeColor(c).stroke();
  doc.rect(x + cell * 0.8, y + cell * 4.8, cell * 1.4, cell * 1.4).fill(c);
  const dots = [
    [3, 1], [5, 1], [6, 2], [3, 3], [4, 3], [6, 3], [1, 4], [2, 4], [4, 4], [6, 4], [1, 5], [3, 5], [5, 5], [2, 6], [4, 6], [5, 6]
  ];
  dots.forEach(([col, row]) => {
    doc.rect(x + col * cell + cell * 0.1, y + row * cell + cell * 0.1, cell * 0.8, cell * 0.8).fill(c);
  });
  doc.restore();
}

// Helper: draw a hexagon
// Helper: fit text in width, reducing font size if needed
function fitText(doc, text, maxW, font, maxFs, minFs = 6) {
  let fs = maxFs;
  doc.font(font).fontSize(fs);
  while (fs > minFs && doc.widthOfString(String(text || '')) > maxW) {
    fs -= 0.5;
    doc.fontSize(fs);
  }
  return fs;
}

function drawHexagon(doc, cx, cy, r, color, fill = true) {

  const angle = Math.PI / 3;
  doc.save();
  doc.translate(cx, cy);
  doc.rotate(Math.PI / 2); // Pointy top
  doc.moveTo(r, 0);
  for (let i = 1; i < 6; i++) {
    doc.lineTo(r * Math.cos(angle * i), r * Math.sin(angle * i));
  }
  doc.closePath();
  if (fill) doc.fill(color);
  else doc.lineWidth(2.5).strokeColor(color).stroke();
  doc.restore();
}

function drawHexagonPhoto(doc, img, cx, cy, r) {
  const angle = Math.PI / 3;
  doc.save();
  doc.translate(cx, cy);
  doc.rotate(Math.PI / 2);
  doc.moveTo(r, 0);
  for (let i = 1; i < 6; i++) {
    doc.lineTo(r * Math.cos(angle * i), r * Math.sin(angle * i));
  }
  doc.closePath().clip();
  doc.rotate(-Math.PI / 2); // Rotate back for image
  if (img) {
    doc.image(img, -r, -r, { width: r * 2, height: r * 2, fit: [r * 2, r * 2], align: 'center', valign: 'center' });
  } else {
    doc.rect(-r, -r, r * 2, r * 2).fill('#d5d5d5');
  }
  doc.restore();
}


// Helper: draw a label:value row with auto font scaling
function drawFieldRow(doc, label, value, lx, vx, y, maxFs, lColor, vColor, availW) {
  const valStr = String(value || 'N/A');
  const labelStr = String(label || '');

  const lFs = fitText(doc, labelStr, vx - lx - 6, 'Helvetica', maxFs);
  doc.font('Helvetica').fontSize(lFs).fillColor(lColor || '#555555')
    .text(labelStr, lx, y, { lineBreak: false });
  doc.font('Helvetica').fontSize(lFs).fillColor(lColor || '#555555')
    .text(' :', lx + doc.widthOfString(labelStr), y, { lineBreak: false });

  const vFs = fitText(doc, valStr, availW || (200), 'Helvetica-Bold', maxFs);
  doc.font('Helvetica-Bold').fontSize(vFs).fillColor(vColor || '#111111')
    .text(valStr, vx, y, { lineBreak: false });
}

// ── TEMPLATE 1: Student Teal Horizontal (Original Style — Polished) ───────────
// Same design language as original: white bg, teal corner shapes, circular photo,
// pill badge — but tighter, smaller, properly aligned for a professional real card
function tStudentTeal(doc, x, y, w, h, d) {
  const teal      = resolveColor(d.primaryColor, '#1a9e8f');
  const tealDark  = darken(teal, 0.26);

  // ── White background ──
  doc.rect(x, y, w, h).fill('#ffffff');

  // ── Decorative shapes (clipped to card) ──
  doc.save();
  doc.rect(x, y, w, h).clip();

  // Top-right teal arc — SVG: M90 0 L170 0 L170 55 Q146 36 118 14 Q104 3 90 0 Z
  doc.moveTo(x + w * 0.529, y)
     .lineTo(x + w,          y)
     .lineTo(x + w,          y + h * 0.514)
     .quadraticCurveTo(x + w * 0.859, y + h * 0.336, x + w * 0.694, y + h * 0.131)
     .quadraticCurveTo(x + w * 0.612, y + h * 0.028, x + w * 0.529, y)
     .fill(teal);

  // Top-right dark teal accent — SVG: M122 0 L170 0 L170 25 Q150 10 122 0 Z
  doc.moveTo(x + w * 0.718, y)
     .lineTo(x + w,          y)
     .lineTo(x + w,          y + h * 0.234)
     .quadraticCurveTo(x + w * 0.882, y + h * 0.093, x + w * 0.718, y)
     .fill(tealDark);

  // Bottom-left teal triangle — SVG: M0 78 L54 107 L0 107 Z
  doc.moveTo(x,             y + h * 0.729)
     .lineTo(x + w * 0.318, y + h)
     .lineTo(x,             y + h)
     .fill(teal);

  // Dark teal accent bottom-left corner — SVG: M0 93 L30 107 L0 107 Z
  doc.moveTo(x,             y + h * 0.869)
     .lineTo(x + w * 0.176, y + h)
     .lineTo(x,             y + h)
     .fill(tealDark);

  doc.restore();

  // ── Watermark ──
  wm(doc, x, y, w, h, d.logo);

  // ── School logo (top-left) with white box — SVG: rect(4,4,22,22) + logo ──
  const logoSz = h * 0.145;
  const logoX  = x + w * 0.024;
  const logoY  = y + h * 0.037;
  doc.rect(logoX - 1, logoY - 1, logoSz + 2, logoSz + 2).fill('#ffffff');
  if (d.logo) drawLogo(doc, logoX, logoY, logoSz, d.logo);

  // School name + address — vertically centered with logo box
  const snX   = logoX + logoSz + 3;
  const snW   = w * 0.25;
  const sName = titleCase(d.schoolName || 'School Name');
  const snFs  = fitText(doc, sName, snW, 'Helvetica-Bold', 7, 5);
  const snCenterY = logoY + logoSz * 0.38;
  doc.font('Helvetica-Bold').fontSize(snFs).fillColor('#111111')
     .text(sName, snX, snCenterY, { width: snW, align: 'left', lineBreak: false });
  if (d.schoolAddress) {
    doc.font('Helvetica').fontSize(4.5).fillColor('#666666')
       .text(d.schoolAddress, snX, snCenterY + snFs + 1.5, { width: snW, align: 'left', lineBreak: false });
  }

  // ── "Date Of Issue" on teal shape (top-right) — SVG: x=132, y=13/20 ──
  const doiX = x + w * 0.750;
  const doiW = w * 0.220;
  doc.font('Helvetica-Bold').fontSize(5).fillColor('#ffffff')
     .text('Date Of Issue', doiX, y + h * 0.100, { width: doiW, align: 'center', lineBreak: false });
  const now = new Date();
  const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dateStr = `${String(now.getDate()).padStart(2,'0')} ${MON[now.getMonth()]} ${now.getFullYear()}`;
  doc.font('Helvetica').fontSize(4.5).fillColor('#ffffff')
     .text(dateStr, doiX, y + h * 0.175, { width: doiW, align: 'center', lineBreak: false });

  // ── "ID CARD" pill badge (card body) — SVG: rect(64,27,64,13) fill=teal ──
  const badgeW = w * 0.376;
  const badgeH = h * 0.121;
  const badgeX = x + w * 0.376;
  const badgeY = y + h * 0.242;
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2).fill(teal);
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff')
     .text('ID CARD', badgeX, badgeY + badgeH * 0.28, { width: badgeW, align: 'center', lineBreak: false });

  // ── Passport-style square photo ──
  const photoW = w * 0.188;   // 32/170
  const photoH = h * 0.327;   // 35/107
  const photoX = x + w * 0.106; // 18/170
  const photoY = y + h * 0.374; // 40/107
  doc.roundedRect(photoX - 1.8, photoY - 1.8, photoW + 3.6, photoH + 3.6, 3).lineWidth(1.8).strokeColor(teal).stroke();
  drawSquarePhoto(doc, d.profileImage, photoX, photoY, photoW, photoH, 2);

  // ── Student name — SVG: x=64, y=50, color=teal ──
  const nameX   = x + w * 0.376;
  const nameW   = w * 0.475;
  const nameStr = titleCase(d.name || 'Student Name');
  const nameFs  = fitText(doc, nameStr, nameW, 'Helvetica-Bold', 9.5, 6.5);
  doc.font('Helvetica-Bold').fontSize(nameFs).fillColor(teal)
     .text(nameStr, nameX, y + h * 0.430, { width: nameW, align: 'left', lineBreak: false });

  // ── Info fields (3 fields) — SVG: Student Id / Roll No / Class, y=61, lh=9 ──
  const fX     = nameX;
  const colonX = nameX + w * 0.178;
  const valX   = colonX + 5;
  const valW   = x + w * 0.915 - valX;
  const fFs    = 6.8;
  const lineH  = h * 0.068;
  let   fy     = y + h * 0.524;

  [
    ['Student Id', d.studentId || 'N/A'],
    ['Roll No',    d.roll      || 'N/A'],
    ['Class',      d.class     || 'N/A'],
  ].forEach(([lbl, val]) => {
    doc.font('Helvetica').fontSize(fFs).fillColor('#555555')
       .text(lbl, fX, fy, { lineBreak: false });
    doc.font('Helvetica').fontSize(fFs).fillColor('#999999')
       .text(':', colonX, fy, { lineBreak: false });
    const vFs = fitText(doc, String(val), valW, 'Helvetica-Bold', fFs, 5);
    doc.font('Helvetica-Bold').fontSize(vFs).fillColor('#111111')
       .text(String(val), valX, fy, { lineBreak: false });
    fy += lineH;
  });

  // ── "ACADEMIC YEAR" + session — SVG: x=64, y=93/100, color=teal ──
  doc.font('Helvetica-Bold').fontSize(5).fillColor('#111111')
     .text('ACADEMIC YEAR', nameX, y + h * 0.869, { width: w * 0.30, align: 'left', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(teal)
     .text(d.session || '2025-2026', nameX, y + h * 0.920, { width: w * 0.30, align: 'left', lineBreak: false });

  // ── Principal signature (bottom-right) — SVG: x=116/170, y=94/107, w=46/170 ──
  drawSignature(doc, d.principalName, x + w * 0.682, y + h * 0.892, w * 0.271, tealDark);
}

// ── TEMPLATE 1: Student Vertical — PROFESSIONAL ───────────────────────────────
function tStudentVBlue(doc, x, y, w, h, d) {
  const p = resolveColor(d.primaryColor, '#6b21a8');
  const dk = darken(p, 0.24);
  const lt = lighten(p, 0.92);

  doc.rect(x, y, w, h).fill('#ffffff');

  // ── Top-right teal decorative area ──
  // Large rounded shape top right
  doc.save();
  doc.rect(x, y, w, h).clip();

  // Top-right big arc/block
  doc.moveTo(x + w * 0.52, y)
    .lineTo(x + w, y)
    .lineTo(x + w, y + h * 0.48)
    .quadraticCurveTo(x + w * 0.88, y + h * 0.35, x + w * 0.72, y + h * 0.12)
    .quadraticCurveTo(x + w * 0.62, y + h * 0.03, x + w * 0.52, y)
    .fill(teal);


  // Smaller accent stripe top-right
  doc.moveTo(x + w * 0.68, y)
    .lineTo(x + w, y)
    .lineTo(x + w, y + h * 0.22)
    .quadraticCurveTo(x + w * 0.9, y + h * 0.1, x + w * 0.68, y)
    .fill(tealDark);


  // Bottom-left teal shape
  doc.moveTo(x, y + h * 0.72)
    .lineTo(x + w * 0.3, y + h)
    .lineTo(x, y + h)
    .closePath()
    .fill(teal);

  // Bottom-left extra accent
  doc.moveTo(x, y + h * 0.85)
    .lineTo(x + w * 0.18, y + h)
    .lineTo(x, y + h)
    .closePath()
    .fill(tealDark);

  doc.restore();

  // Watermark logo center
  wm(doc, x, y, w, h, d.logo);

  // ── Academic Year (top right, on teal) ──
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000000')
    .text('ACADEMIC YEAR', x + w * 0.63, y + h * 0.04, { width: w * 0.34, align: 'center', lineBreak: false });
  const sessionFs = fitText(doc, d.session || '2025-2026', w * 0.34, 'Helvetica-Bold', 7, 6);
  doc.font('Helvetica-Bold').fontSize(sessionFs).fillColor('#000000')
    .text(d.session || '2025-2026', x + w * 0.63, y + h * 0.04 + 10, { width: w * 0.34, align: 'center', lineBreak: false });





  // ── School Logo and Name top-left ──
  const logoSize = h * 0.22;
  const logoX = x + w * 0.025, logoY = y + h * 0.02;
  if (d.logo) {
    drawLogo(doc, logoX, logoY, logoSize, d.logo);
  } else {
    doc.rect(logoX, logoY, logoSize, logoSize).fill('#e0e0e0');
  }
  const sName = titleCase(d.schoolName || 'School Name');
  const snW = w * 0.45;
  const snFs = fitText(doc, sName, snW, 'Helvetica-Bold', 7.5, 5.5);
  const snY = logoY + (logoSize - (snFs + 8)) / 2;
  doc.font('Helvetica-Bold').fontSize(snFs).fillColor('#111111')
    .text(sName, logoX + logoSize + 4, snY, { width: snW, align: 'left', lineBreak: false });
  doc.font('Helvetica').fontSize(5.5).fillColor('#666666')
    .text(d.schoolAddress || 'School Address, City', logoX + logoSize + 4, snY + snFs + 1, { width: snW, align: 'left', lineBreak: false });


  // ── Circular photo left-center ──
  const photoR = h * 0.27;
  const photoCX = x + w * 0.22, photoCY = y + h * 0.5;
  drawCircularPhoto(doc, d.profileImage, photoCX, photoCY, photoR, teal, 2.5);

  // ── STUDENT ID CARD pill badge ──
  const badgeW = w * 0.42, badgeH = h * 0.1;
  const badgeX = x + w * 0.45, badgeY = y + h * 0.22;
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2).fill(teal);
  doc.font('Helvetica-Bold').fillColor('#ffffff');
  const badgeFs = fitText(doc, 'STUDENT ID CARD', badgeW - 10, 'Helvetica-Bold', 8);
  doc.fontSize(badgeFs).text('STUDENT ID CARD', badgeX, badgeY + badgeH * 0.25, { width: badgeW, align: 'center', lineBreak: false });


  // ── Student Name ──
  const nameX = x + w * 0.45, nameY = badgeY + badgeH + h * 0.04;
  const nameW = w * 0.51;
  const nameFs = fitText(doc, (d.name || '').toUpperCase(), nameW, 'Helvetica-Bold', 11, 7);
  doc.font('Helvetica-Bold').fontSize(nameFs).fillColor(teal)
    .text((d.name || 'STUDENT NAME').toUpperCase(), nameX, nameY, { width: nameW, align: 'left', lineBreak: false });

  // ── Fields: Name, Roll No, ID, Class ──
  const fieldsX = x + w * 0.45;
  const valX = x + w * 0.62;
  const fieldW = w * 0.51;
  const valW = x + w * 0.97 - valX;
  const fieldFs = 7;
  const lineH = h * 0.1;
  let fy = nameY + nameFs + 6;

  const fields = [
    ['Student Id', d.studentId || d.roll || 'N/A'],
    ['Roll No', d.roll || 'N/A'],
    ['Class', d.class || 'N/A'],
  ];
  fields.forEach(([lbl, val]) => {
    drawFieldRow(doc, lbl, val, fieldsX, valX, fy, fieldFs, '#444444', '#111111', valW);
    fy += lineH;
  });

  // ── QR Code bottom-center ──
  const qrSize2 = h * 0.18;
  const qrX = x + w * 0.38, qrY = y + h * 0.78;
  drawQR(doc, qrX, qrY, qrSize2, teal);



  // ── Card Expires bottom-left (on teal) ──
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#000000')
    .text('Card Expires', x + 4, y + h * 0.83, { lineBreak: false });
  const expYear = new Date().getFullYear() + 3;
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#000000')
    .text(`DEC ${expYear}`, x + 4, y + h * 0.83 + 9, { lineBreak: false });


  // ── Principal Signature bottom-right ──
  const sigW = w * 0.28;
  const sigX = x + w * 0.68, sigY = y + h * 0.84; // Lowered
  drawSignature(doc, d.principalName, sigX, sigY, sigW, '#333333');

}

// ── TEMPLATE 2: Student Navy-Gold Horizontal (Image 2) ───────────────────────
// Dark navy bg, gold right accent stripe, circular photo left, logo+fields right,
// name at bottom-left, "Authorized by Registrar" badge bottom-right
function tStudentNavy(doc, x, y, w, h, d) {
  const navy = resolveColor(d.primaryColor, '#1a2e4a'); 
  const teal = navy;
  const navyDark = darken(navy, 0.25);
  const navyLight = lighten(navy, 0.6);

  const gold = '#c9a227';
  const goldLight = '#e8c84a';

  // Navy background
  doc.rect(x, y, w, h).fill(navy);

  // ── Right gold accent stripes ──
  const stripeW = w * 0.06;
  doc.rect(x + w - stripeW * 2.4, y, stripeW, h).fill(gold);
  doc.rect(x + w - stripeW * 1.1, y, stripeW * 1.1, h).fill(goldLight);

  // Watermark
  wm(doc, x, y, w, h, d.logo);


  // ── Date of Issue top-right (on navy, before gold stripe) ──
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#cccccc')
    .text('Date Of Issue', x + w * 0.55, y + h * 0.06, { width: w * 0.36, align: 'right', lineBreak: false });
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const now = new Date();
  const dStr = `${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#aaaaaa')
    .text(dStr, x + w * 0.55, y + h * 0.06 + 9, { width: w * 0.36, align: 'right', lineBreak: false });



  // ── School Logo and Name top-left ──
  const logoSize2 = h * 0.16;
  const logoX2 = x + w * 0.025, logoY2 = y + h * 0.04;
  if (d.logo) {
    drawLogo(doc, logoX2, logoY2, logoSize2, d.logo);
  }
  const sName2 = titleCase(d.schoolName || 'School Name');
  const snW2 = w * 0.4;
  const snFs2 = fitText(doc, sName2, snW2, 'Helvetica-Bold', 7.5, 5.5);
  doc.font('Helvetica-Bold').fontSize(snFs2).fillColor('#ffffff')
    .text(sName2, logoX2 + logoSize2 + 4, logoY2, { width: snW2, align: 'left', lineBreak: false });
  doc.font('Helvetica').fontSize(5).fillColor('#aaaaaa')
    .text(d.schoolAddress || 'School Address, City', logoX2 + logoSize2 + 4, logoY2 + snFs2 + 1, { width: snW2, align: 'left', lineBreak: false });

  // ── Circular photo left ──
  const photoR = h * 0.22;
  const photoCX = x + w * 0.2, photoCY = y + h * 0.48;
  drawCircularPhoto(doc, d.profileImage, photoCX, photoCY, photoR, gold, 2.5);

  // ── Student Name center-right (was logo) ──
  const nameW2 = w * 0.4;
  const nameFs2 = fitText(doc, (d.name || '').toUpperCase(), nameW2, 'Helvetica-Bold', 11, 7);
  doc.font('Helvetica-Bold').fontSize(nameFs2).fillColor(gold)
    .text((d.name || 'STUDENT NAME').toUpperCase(), x + w * 0.43, y + h * 0.1, { width: nameW2, align: 'left', lineBreak: false });

  // ── Fields right of photo ──
  const fieldsX = x + w * 0.43;
  const colonX = x + w * 0.58;
  const valX = x + w * 0.60;
  const valW = x + w * 0.86 - valX;
  const fieldFs = 7.5;
  const lineH = h * 0.11;
  let fy = y + h * 0.34;

  const fields = [
    ['ID', d.studentId || d.roll || 'N/A'],
    ['Roll No', d.roll || 'N/A'],
    ['Class', d.class || 'N/A'],
    ['Session', d.session || 'N/A'],
  ];

  fields.forEach(([lbl, val]) => {
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#c0c8d8')
      .text(lbl, fieldsX, fy, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(fieldFs).fillColor('#c0c8d8')
      .text(':', colonX, fy, { lineBreak: false });
    const vFs = fitText(doc, String(val), valW, 'Helvetica-Bold', fieldFs);
    doc.font('Helvetica-Bold').fontSize(vFs).fillColor('#ffffff')
      .text(String(val), valX, fy, { lineBreak: false });
    fy += lineH;
  });

  // (Removed decorative circle and play icon)


  // ── QR Code bottom-left (was name) ──
  const qrSize3 = h * 0.18;
  drawQR(doc, x + w * 0.025, y + h * 0.82, qrSize3, '#ffffff');

  // ── Principal Signature bottom-right ──
  const sigW = w * 0.25;
  const sigX = x + w * 0.58, sigY = y + h * 0.85; // Lowered
  drawSignature(doc, d.principalName, sigX, sigY, sigW, '#cccccc');


  // (Removed registrar badge)

}

// ── TEMPLATE 3: Teacher Cream/Navy Horizontal (Image 3 Middle) ───────────────
// Cream/beige background, dark navy header with school name, square photo left,
// student info right, QR bottom-left, principal signature bottom-right
function tTeacherCream(doc, x, y, w, h, d) {
  console.log(`[DEBUG] drawTemplate: Mapping data for tTeacherCream:`, d);
  const navy = resolveColor(d.primaryColor, '#1a2744');
  const cream = '#f5f0e8';
  const red = '#c0392b';

  // Cream background
  doc.rect(x, y, w, h).fill(cream);

  // ── Navy header band ──
  const headerH = h * 0.28;
  doc.rect(x, y, w, headerH).fill(navy);

  // School logo in header left
  const logoSize = headerH * 0.72;
  const logoX = x + w * 0.025, logoY = y + (headerH - logoSize) / 2;
  if (d.logo) {
    drawLogo(doc, logoX, logoY, logoSize, d.logo);
  } else {
    doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2).fill('#2a3f6f');
  }

  // School name in header
  const schoolNameW = w * 0.62;
  const schoolNameX = logoX + logoSize + 6;
  const snFs = fitText(doc, (d.schoolName || '').toUpperCase(), schoolNameW, 'Helvetica-Bold', 9.5, 6);
  doc.font('Helvetica-Bold').fontSize(snFs).fillColor('#ffffff')
    .text((d.schoolName || 'SCHOOL NAME').toUpperCase(), schoolNameX, y + headerH * 0.18, { width: schoolNameW, lineBreak: false });
  const addrFs = fitText(doc, d.schoolAddress || '', schoolNameW, 'Helvetica', 6, 4);
  doc.font('Helvetica').fontSize(addrFs).fillColor('#aabbcc')
    .text(d.schoolAddress || '', schoolNameX, y + headerH * 0.18 + snFs + 3, { width: schoolNameW, lineBreak: false });

  // ── Square photo below header left ──
  const photoW = w * 0.18, photoH = h * 0.36; // Slightly shorter to avoid QR
  const photoX = x + w * 0.06, photoY = y + headerH + h * 0.03;
  doc.rect(photoX - 1.5, photoY - 1.5, photoW + 3, photoH + 3).fill(navy);
  drawSquarePhoto(doc, d.profileImage, photoX, photoY, photoW, photoH, 0);




  // ── Teacher name ──
  const infoX = x + w * 0.31;
  const infoW = w * 0.65;
  const tnameY = y + headerH + h * 0.06;
  const tnameFs = fitText(doc, d.name || 'TEACHER NAME', infoW, 'Helvetica-Bold', 10.5, 7);
  doc.font('Helvetica-Bold').fontSize(tnameFs).fillColor(navy)
    .text(d.name || 'TEACHER NAME', infoX, tnameY, { width: infoW, lineBreak: false });


  // Divider
  doc.moveTo(infoX, tnameY + tnameFs + 4).lineTo(x + w * 0.95, tnameY + tnameFs + 4)
    .lineWidth(0.5).strokeColor('#cccccc').stroke();

  // ── Fields ──
  const labelX = infoX;
  const valX2 = infoX + w * 0.22;
  const valW2 = x + w * 0.93 - valX2;
  const fieldFs = 7;
  const lineH = h * 0.1;
  let fy2 = tnameY + tnameFs + 8;

  const fields = [
    ['Designation', d.designation || 'Teacher'],
    ['Employee Id', d.staffId || 'N/A'],
    ['Class', d.class || 'N/A'],
    ['Joining Date', formatDate(d.joinDate)],
  ];

  fields.forEach(([lbl, val]) => {
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#333333')
      .text(lbl, labelX, fy2, { lineBreak: false });
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#333333')
      .text(':', labelX + doc.widthOfString(lbl) + 2, fy2, { lineBreak: false });
    const vfs = fitText(doc, String(val), valW2, 'Helvetica-Bold', fieldFs);
    doc.font('Helvetica-Bold').fontSize(vfs).fillColor('#cc0000')
      .text(String(val), valX2, fy2, { lineBreak: false });
    fy2 += lineH;
  });


  // ── QR bottom-left ──
  const qrSize = h * 0.22;
  const qrX = x + w * 0.04, qrY = y + h - qrSize - h * 0.05;
  drawQR(doc, qrX, qrY, qrSize, navy);

  // ── Principal Signature bottom-right ──
  const sigW = w * 0.28;
  const sigX = x + w * 0.65, sigY = y + h * 0.88;
  drawSignature(doc, d.principalName, sigX, sigY, sigW, '#333333');
}

// ── TEMPLATE 2: Student Horizontal Wave — GREEN ───────────────────────────────
function tStudentHWave(doc, x, y, w, h, d) {
  const p = resolveColor(d.primaryColor, '#1a6b3c');
  const dk = darken(p, 0.25);
  const lt = lighten(p, 0.9);
  doc.rect(x, y, w, h).fill('#ffffff');
  wm(doc, x, y, w, h, d.logo);

  const hH = h * 0.23;
  doc.rect(x, y, w, hH).fill(p);
  const logoSz = hH * 0.65;
  drawLogo(doc, x + 12, y + (hH - logoSz) / 2, logoSz, d.logo, false, null);
  const snX = x + 12 + logoSz + 10;
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.3, 11))
    .text((d.schoolName || 'APNA SCHOOL').toUpperCase(), snX, y + hH * 0.16, { lineBreak: false, width: w * 0.45 });
  doc.fillColor('rgba(255,255,255,0.82)').font('Helvetica').fontSize(Math.min(hH * 0.18, 7.5))
    .text(d.schoolAddress || 'School Address', snX, y + hH * 0.55, { lineBreak: false, width: w * 0.45 });

  const bw = w * 0.22;
  doc.rect(x + w - bw, y, bw, hH).fill(dk);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.22, 9))
    .text('STUDENT\nID CARD', x + w - bw, y + hH * 0.2, { width: bw, align: 'center' });

  const panelW = w * 0.33;
  doc.rect(x, y + hH, panelW, h - hH).fill(p);
  const ps = panelW * 0.72;
  const px2 = x + (panelW - ps) / 2;
  const pY = y + hH + (h - hH) * 0.1;
  doc.save(); doc.rect(px2 - 2, pY - 2, ps + 4, ps + 4).fill('#fff'); doc.restore();
  drawPhoto(doc, d.profileImage, px2, pY, ps, ps);

  // ID strip
  doc.rect(x, y + h - h * 0.12, panelW, h * 0.12).fill(dk);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(h * 0.04, 8))
    .text('ID: ' + (d.studentId || 'N/A'), x, y + h - h * 0.085, { width: panelW, align: 'center', lineBreak: false });

  const rx = x + panelW + 16;
  const rw = w - panelW - 22;
  const nY = y + hH + (h - hH) * 0.08;
  doc.fillColor(p).font('Helvetica-Bold').fontSize(Math.min(h * 0.1, 18))
    .text((d.name || 'Name').toUpperCase(), rx, nY, { width: rw, lineBreak: false });

  doc.save(); doc.rect(rx, nY + h * 0.115, rw * 0.7, 1.5).fill(p); doc.restore();

  const fs = Math.min(h * 0.053, 9);
  const gap = h * 0.09;
  let fy = nY + h * 0.16;
  const lvx = rx + rw * 0.45;
  fRow(doc, 'Class', d.class || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Section', d.section || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Roll No.', d.roll || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Session', d.session || '2025-2026', rx, lvx, fy, fs);

  // Bottom info band
  doc.rect(x, y + h - h * 0.1, w, h * 0.1).fill(lt);
  doc.fillColor('#555').font('Helvetica').fontSize(Math.min(h * 0.035, 7.5))
    .text('Emergency: ' + (d.parentPhone || d.contact || 'N/A'), x + panelW + 14, y + h - h * 0.075, { lineBreak: false, width: w - panelW - 24 });

  sigRightH(doc, rx, rw, y + h * 0.82, p);
  footer(doc, x, y, w, h, p);
}

// ── TEMPLATE 4: Security Red Vertical (Image 3 First — Red header vertical) ──
// Portrait orientation, bold red header, white body, small square photo,
// fields in clean rows, QR bottom, signature
function tSecurityRed(doc, x, y, w, h, d) {
  const red = resolveColor(d.primaryColor, '#c0392b');
  const redDark = darken(red, 0.2);

  // White background
  doc.rect(x, y, w, h).fill('#ffffff');

  // ── Red header ──
  const headerH = h * 0.22;
  doc.rect(x, y, w, headerH).fill(red);

  // School Name and Address in red header (LEFT)
  const logoSize = headerH * 0.65; // Slightly smaller to avoid any overlap
  const snX = x + w * 0.04, snY = y + headerH * 0.22;
  const snW = w * 0.62; // Consistently limited width
  const sName = titleCase(d.schoolName || 'School Name');
  const snFs = fitText(doc, sName, snW, 'Helvetica-Bold', 10, 7);
  doc.font('Helvetica-Bold').fontSize(snFs).fillColor('#ffffff')
    .text(sName, snX, snY, { width: snW, align: 'left', lineBreak: false });

  const addrFs = 5.2;
  doc.font('Helvetica').fontSize(addrFs).fillColor('#eeeeee')
    .text(d.schoolAddress || '', snX, snY + snFs + 2, { width: snW, align: 'left', lineBreak: false });

  // School logo in red header (RIGHT)
  const logoX = x + w - logoSize - w * 0.04, logoY = y + (headerH - logoSize) / 2;
  if (d.logo) {
    drawLogo(doc, logoX, logoY, logoSize, d.logo);
  }



  // ── "SECURITY GUARD" role label ──
  const roleY = y + headerH + h * 0.02;
  const roleFs = fitText(doc, 'SECURITY GUARD', w - 8, 'Helvetica-Bold', 7.5, 5);
  doc.font('Helvetica-Bold').fontSize(roleFs).fillColor(red)
    .text('SECURITY GUARD', x + 4, roleY, { width: w - 8, align: 'center', lineBreak: false });

  // ── Square photo centered ──
  const photoW = w * 0.35, photoH = w * 0.35;
  const photoX = x + (w - photoW) / 2;
  const photoY = roleY + roleFs + 4;
  doc.rect(photoX - 1.5, photoY - 1.5, photoW + 3, photoH + 3).fill(red);
  drawSquarePhoto(doc, d.profileImage, photoX, photoY, photoW, photoH, 0);


  // ── Name ──
  const nameY = photoY + photoH + h * 0.025;
  const nameFs = fitText(doc, (d.name || '').toUpperCase(), w - 8, 'Helvetica-Bold', 8.5, 5.5);
  doc.font('Helvetica-Bold').fontSize(nameFs).fillColor('#111111')
    .text((d.name || 'GUARD NAME').toUpperCase(), x + 4, nameY, { width: w - 8, align: 'center', lineBreak: false });

  // ── Fields ──
  const fieldPad = w * 0.06;
  const labelX = x + fieldPad;
  const colonX = x + w * 0.48;
  const valX = x + w * 0.51;
  const valW = x + w - fieldPad - valX;
  const fieldFs = 6;
  const lineH = h * 0.065;
  let fy = nameY + nameFs + h * 0.025;

  // Divider
  doc.moveTo(x + 6, fy - 3).lineTo(x + w - 6, fy - 3).lineWidth(0.5).strokeColor('#eeeeee').stroke();

  const fields = [
    ['ID', d.staffId || 'N/A'],
    ['Contact', d.contact || 'N/A'],
    ['Blood', d.bloodGroup || 'N/A'],
  ];


  fields.forEach(([lbl, val]) => {
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#555555')
      .text(lbl, labelX, fy, { lineBreak: false });
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#555555')
      .text(':', colonX, fy, { lineBreak: false });
    const vfs = fitText(doc, String(val), valW, 'Helvetica-Bold', fieldFs);
    doc.font('Helvetica-Bold').fontSize(vfs).fillColor('#111111')
      .text(String(val), valX, fy, { lineBreak: false });
    fy += lineH;
  });

  // ── Bottom section: QR Left, Signature Right ──
  const bottomY = h * 0.88;

  // QR code bottom left
  const qrSize = w * 0.18;
  const qrX = x + w * 0.08, qrY = y + bottomY - qrSize / 2;
  drawQR(doc, qrX, qrY, qrSize, red);

  // Signature bottom right
  const sigW = w * 0.55;
  const sigX = x + w * 0.38, sigY = y + bottomY + qrSize / 4;
  drawSignature(doc, d.principalName, sigX, sigY, sigW, '#333333');

}

// ── TEMPLATE 5: Staff Navy Wave Horizontal (Image 4 Middle) ──────────────────
// Navy bg with wave/swoosh, circular photo with gold ring, right side fields,
// school name header, QR bottom-left, signature bottom-right
function tStaffNavyWave(doc, x, y, w, h, d) {
  const navy = resolveColor(d.primaryColor, '#1a2744');
  const gold = '#c9a227';
  const cream = '#f5f0e8';

  // Cream background
  doc.rect(x, y, w, h).fill(cream);

  // ── Navy header with wave shape ──
  const headerH = h * 0.3;
  doc.rect(x, y, w, headerH).fill(navy);

  // Wave bottom of header
  doc.save();
  doc.rect(x, y, w, h).clip();
  doc.moveTo(x, y + headerH)
    .quadraticCurveTo(x + w * 0.25, y + headerH + h * 0.12, x + w * 0.5, y + headerH)
    .quadraticCurveTo(x + w * 0.75, y + headerH - h * 0.12, x + w, y + headerH)
    .lineTo(x + w, y)
    .lineTo(x, y)
    .closePath()
    .fill(navy);

  // School QR code (LEFT)
  const headerQrSize = headerH * 0.55;
  const qrX = x + w * 0.04, qrY = y + (headerH - headerQrSize) / 2;
  drawQR(doc, qrX, qrY, headerQrSize, '#ffffff');

  // School Name and Address (RIGHT)
  const logoSize = headerH * 0.65;
  const snW = w * 0.52; // Slightly smaller to guarantee gap
  const snX = x + w - logoSize - snW - w * 0.08;
  const sName = titleCase(d.schoolName || 'School Name');

  const snFs = fitText(doc, sName, snW, 'Helvetica-Bold', 8.5, 6);
  doc.font('Helvetica-Bold').fontSize(snFs).fillColor('#ffffff')
    .text(sName, snX, y + headerH * 0.22, { width: snW, align: 'right', lineBreak: false });

  const addrFs = 5.2;
  doc.font('Helvetica').fontSize(addrFs).fillColor('#99aabb')
    .text(d.schoolAddress || '', snX, y + headerH * 0.22 + snFs + 2, { width: snW, align: 'right', lineBreak: false });

  // School logo (RIGHT)
  const logoX = x + w - logoSize - w * 0.04, logoY = y + (headerH - logoSize) / 2;
  drawLogo(doc, logoX, logoY, logoSize, d.logo);




  // ── Circular photo left center ──
  const photoR = h * 0.22; // Reduced size to avoid overlap
  const photoCX = x + w * 0.18;
  const photoCY = y + headerH + (h - headerH) * 0.45;
  drawCircularPhoto(doc, d.profileImage, photoCX, photoCY, photoR, gold, 2);


  // ── Fields right ──
  const fieldsX = x + w * 0.42;
  const valX = x + w * 0.64;
  const valW = x + w * 0.95 - valX;
  const fieldFs = 7;
  const lineH = h * 0.105;
  let fy = y + headerH + h * 0.15; // Adjusted start

  // Staff Name above fields
  const nameW = w * 0.55;
  const nameX = fieldsX;
  const nameY = fy - 16;
  const nameFs = fitText(doc, d.name || 'STAFF NAME', nameW, 'Helvetica-Bold', 10, 7);
  doc.font('Helvetica-Bold').fontSize(nameFs).fillColor(navy)
    .text(d.name || 'STAFF NAME', nameX, nameY, { width: nameW, align: 'left', lineBreak: false });

  const staffFields = [
    ['ID No', d.staffId || 'N/A'],
    ['Designation', d.designation || 'Staff'],
    ['Contact', d.contact || 'N/A'],
  ];

  staffFields.forEach(([lbl, val]) => {
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#444444')
      .text(lbl, fieldsX, fy, { lineBreak: false });
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#444444')
      .text(':', fieldsX + doc.widthOfString(lbl) + 2, fy, { lineBreak: false });
    const vfs = fitText(doc, String(val), valW, 'Helvetica-Bold', fieldFs);
    doc.font('Helvetica-Bold').fontSize(vfs).fillColor('#111111')
      .text(String(val), valX, fy, { lineBreak: false });
    fy += lineH;
  });


  // QR removed from bottom to avoid photo overlap



  // ── Signature bottom-right ──
  const sigW = w * 0.28;
  const sigX = x + w * 0.65, sigY = y + h * 0.85; // Lowered signature
  drawSignature(doc, d.principalName, sigX, sigY, sigW, '#333333');

}

// ── TEMPLATE 6: Staff Blue-Teal Vertical (Image 4 Last) ──────────────────────
// Portrait card, blue/teal header, circular photo top, colored field rows,
// QR, signature, colored accent sidebar/footer
function tStaffBlueTeal(doc, x, y, w, h, d) {
  const blue = resolveColor(d.primaryColor, '#2b6cb0');
  const teal = '#1a9e8f';
  const orange = '#e07020';

  // White background
  doc.rect(x, y, w, h).fill('#ffffff');

  // ── Blue header ──
  const headerH = h * 0.22; // Reduced header
  doc.rect(x, y, w, headerH).fill(blue);

  // Logo in header left (REVERTED)
  const logoSize = headerH * 0.6;
  drawLogo(doc, x + 4, y + (headerH - logoSize) / 2, logoSize, d.logo);

  // School name + address in header (CENTER)
  const snW = w - logoSize - 12;
  const snX = x + logoSize + 6;
  const snY = y + headerH * 0.2;
  const sName = titleCase(d.schoolName || 'School Name');
  const snFs = fitText(doc, sName, snW, 'Helvetica-Bold', 7.5, 5.5);
  doc.font('Helvetica-Bold').fontSize(snFs).fillColor('#ffffff')
    .text(sName, snX, snY, { width: snW, align: 'center', lineBreak: false });
  const addrFs = 5;
  doc.font('Helvetica').fontSize(addrFs).fillColor('#c5d8f0')
    .text(d.schoolAddress || '', snX, snY + snFs + 2, { width: snW, align: 'center', lineBreak: false });





  // ── Circular photo below header ──
  const photoR = w * 0.16; // Reduced to fit vertical height better
  const photoCX = x + w / 2;
  const photoCY = y + headerH + photoR + h * 0.02;
  drawCircularPhoto(doc, d.profileImage, photoCX, photoCY, photoR, blue, 1.5);


  // ── Name under photo ──
  const nameY = photoCY + photoR + 4;
  const nameFs = fitText(doc, d.name || 'STAFF NAME', w - 8, 'Helvetica-Bold', 8.5, 5.5);
  doc.font('Helvetica-Bold').fontSize(nameFs).fillColor('#111111')
    .text(d.name || 'STAFF NAME', x + 4, nameY, { width: w - 8, align: 'center', lineBreak: false });

  // Removed ID under name as requested
  const idFs = 0; // Placeholder for fy calculation


  // ── Colored field rows ──
  const fieldPad = w * 0.05;
  const labelX = x + fieldPad;
  const valX = x + w * 0.52;
  const valW = x + w - fieldPad - valX;
  const fieldFs = 5.2; // Slightly smaller to fit 4 rows
  const lineH = h * 0.055; // Reduced line height
  let fy = nameY + nameFs + 6;



  const staffFields = [
    ['Role', d.role],
    ['Designation', d.designation || d.role],
    ['ID', d.staffId || 'N/A'],
    ['Contact', d.contact || 'N/A'],
  ];




  staffFields.forEach(([lbl, val, highlight], i) => {
    const rowBg = i % 2 === 0 ? '#f0f4f8' : '#ffffff';
    doc.rect(x, fy - 1, w, lineH).fill(rowBg);
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#444444')
      .text(lbl, labelX, fy, { lineBreak: false });
    const vfs = fitText(doc, String(val), valW, 'Helvetica-Bold', fieldFs);
    doc.font('Helvetica-Bold').fontSize(vfs).fillColor(highlight ? '#cc0000' : '#111111')
      .text(String(val), valX, fy, { lineBreak: false });
    fy += lineH;
  });

  // ── Orange bottom accent stripe ──
  const bottomH = h * 0.08;
  doc.rect(x, y + h - bottomH, w, bottomH).fill(orange);

  // ── QR bottom (REVERTED) ──
  const qrSize = w * 0.22;
  const qrX = x + w * 0.08, qrY = y + h - bottomH - qrSize - 4;
  drawQR(doc, qrX, qrY, qrSize, blue);



  // ── Signature bottom right ──
  const sigW = w * 0.45;
  const sigX = x + w * 0.48;
  const sigY = y + h - bottomH - h * 0.05;
  drawSignature(doc, d.principalName, sigX, sigY, sigW, '#333333');
}

// ── TEMPLATE 7: Position Holder Green Vertical (New Design) ─────────────────

function tPositionHolderGreen(doc, x, y, w, h, d) {
  const green = resolveColor(d.primaryColor, '#1b8a4a');
  const greenDark = darken(green, 0.25);
  const greenLight = lighten(green, 0.8);

  // White background
  doc.rect(x, y, w, h).fill('#ffffff');

  // ── Green Shield Header ──
  const headerH = h * 0.22;
  doc.rect(x, y, w, headerH).fill(green);

  // V-Shape/Shield bottom
  doc.save();
  doc.moveTo(x, y + headerH)
    .lineTo(x + w * 0.5, y + headerH + h * 0.15)
    .lineTo(x + w, y + headerH)
    .lineTo(x + w, y)
    .lineTo(x, y)
    .closePath()
    .fill(green);
  doc.restore();

  // School Logo (TOP LEFT)
  const logoSize = headerH * 0.45;
  drawLogo(doc, x + w * 0.04, y + 4, logoSize, d.logo);

  // School name and info in header (RIGHT ALIGNED)
  const snW = w * 0.65;
  const snX = x + w - snW - w * 0.04;
  const snY = y + 8;
  const sName = titleCase(d.schoolName || 'School Name');
  const snFs = fitText(doc, sName, snW, 'Helvetica-Bold', 8, 6);
  doc.font('Helvetica-Bold').fontSize(snFs).fillColor('#ffffff')
    .text(sName, snX, snY, { width: snW, align: 'right', lineBreak: false });

  const addrFs = 5;
  doc.font('Helvetica').fontSize(addrFs).fillColor('#e0e0e0')
    .text(d.schoolAddress || '', snX, snY + snFs + 2, { width: snW, align: 'right', lineBreak: false });

  // "POSITION HOLDER" text (CENTERED)
  doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#ffffff')
    .text('POSITION HOLDER', x, snY + snFs + addrFs + 6, { width: w, align: 'center', lineBreak: false });




  // ── Hexagon Profile Frame ──
  const hexR = w * 0.22;
  const hexCX = x + w / 2;
  const hexCY = y + headerH + h * 0.08;

  // Outer frame
  drawHexagon(doc, hexCX, hexCY, hexR + 3, greenDark);
  drawHexagon(doc, hexCX, hexCY, hexR, '#ffffff');
  drawHexagonPhoto(doc, d.profileImage, hexCX, hexCY, hexR - 2);

  // ── Name and Selection below ──
  const nameY = hexCY + hexR + h * 0.06;
  const nameFs = fitText(doc, (d.name || 'NAME HERE').toUpperCase(), w - 10, 'Helvetica-Bold', 10, 7);
  doc.font('Helvetica-Bold').fontSize(nameFs).fillColor(green)
    .text((d.name || 'NAME HERE').toUpperCase(), x + 5, nameY, { width: w - 10, align: 'center', lineBreak: false });

  // HEAD BOY / HEAD GIRL based on selection
  const posText = (d.position || 'Head Boy').toUpperCase();
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#444444')
    .text(posText, x + 5, nameY + nameFs + 4, { width: w - 10, align: 'center', lineBreak: false });

  // ── Fields (Student style) ──
  const fieldPad = w * 0.1;
  const labelX = x + fieldPad;
  const valX = x + w * 0.52;
  const valW = x + w - fieldPad - valX;
  const fieldFs = 6.5;
  const lineH = h * 0.075;
  let fy = nameY + nameFs + 22;

  const fields = [
    ['Student ID', d.studentId || 'N/A'],
    ['Roll No', d.roll || 'N/A'],
    ['Class', d.class || 'N/A'],
  ];

  fields.forEach(([lbl, val]) => {
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#555555')
      .text(lbl, labelX, fy, { lineBreak: false });
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#555555')
      .text(' :', labelX + doc.widthOfString(lbl) + 1, fy, { lineBreak: false });
    const vfs = fitText(doc, String(val), valW, 'Helvetica-Bold', fieldFs);
    doc.font('Helvetica-Bold').fontSize(vfs).fillColor('#111111')
      .text(String(val), valX, fy, { lineBreak: false });
    fy += lineH;
  });

  // ── QR bottom left ──
  const qrSize = w * 0.2;
  drawQR(doc, x + w * 0.08, y + h - qrSize - 6, qrSize, green);

  // ── Signature bottom right ──
  const sigW = w * 0.42;
  drawSignature(doc, d.principalName, x + w * 0.52, y + h - h * 0.08, sigW, '#333333');
}


// ── TEMPLATE 8: Class Monitor Blue Horizontal (New Design) ────────────────
function tClassMonitorBlue(doc, x, y, w, h, d) {
  const blue = resolveColor(d.primaryColor, '#1a2744');
  const blueDark = darken(blue, 0.25);
  const blueLight = lighten(blue, 0.8);

  // White background
  doc.rect(x, y, w, h).fill('#ffffff');

  // ── Top Diagonal Blue Split (Header) ──
  doc.save();
  doc.moveTo(x + w * 0.42, y)
    .lineTo(x + w, y)
    .lineTo(x + w, y + h * 0.28)
    .lineTo(x + w * 0.32, y + h * 0.28)
    .closePath()
    .fill(blue);
  doc.restore();

  // ── Bottom Diagonal Blue Split (Footer - SMALLER) ──
  doc.save();
  doc.moveTo(x, y + h * 0.84)
    .lineTo(x + w * 0.48, y + h * 0.84)
    .lineTo(x + w * 0.40, y + h)
    .lineTo(x, y + h)
    .closePath()
    .fill(blue);
  doc.restore();

  // QR in Top-Left (where logo was)
  const qrSize = h * 0.18;
  drawQR(doc, x + w * 0.06, y + h * 0.06, qrSize, blue);

  // Logo in Top-Right (Blue area, next to school name)
  const logoSize = h * 0.16;
  const logoX = x + w * 0.44;
  drawLogo(doc, logoX, y + h * 0.06, logoSize, d.logo);

  // School name in Top-Right (shifted for logo)
  const sName = titleCase(d.schoolName || 'School Name');
  const snW = w * 0.38;
  const snX = logoX + logoSize + 6;
  const snFs = fitText(doc, sName, snW, 'Helvetica-Bold', 9, 6);
  doc.font('Helvetica-Bold').fontSize(snFs).fillColor('#ffffff')
    .text(sName, snX, y + h * 0.07, { width: snW, align: 'left', lineBreak: false });

  // "CLASS MONITOR" below school name
  doc.font('Helvetica').fontSize(6).fillColor('#ffffff')
    .text('CLASS MONITOR', snX, y + h * 0.07 + snFs + 1, { width: snW, align: 'left', lineBreak: false });


  // ── Square photo on the left ──
  const photoW = w * 0.22, photoH = h * 0.38;
  const photoX = x + w * 0.08, photoY = y + h * 0.3;
  doc.rect(photoX - 1.5, photoY - 1.5, photoW + 3, photoH + 3).fill(blueDark);
  drawSquarePhoto(doc, d.profileImage, photoX, photoY, photoW, photoH, 0);

  // ── Student info on the right ──
  const fieldsX = x + w * 0.42;
  const valX = x + w * 0.65;
  const valW = x + w * 0.95 - valX;
  const fieldFs = 7.5;
  const lineH = h * 0.12;
  let fy = y + h * 0.32;

  const fields = [
    ['Student Name', d.name || 'N/A'],
    ['Student ID', d.studentId || 'N/A'],
    ['Roll No', d.roll || 'N/A'],
    ['Class', d.class || 'N/A'],
  ];

  fields.forEach(([lbl, val]) => {
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#444444')
      .text(lbl, fieldsX, fy, { lineBreak: false });
    doc.font('Helvetica').fontSize(fieldFs).fillColor('#444444')
      .text(' :', fieldsX + doc.widthOfString('Student Name') + 4, fy, { lineBreak: false });
    const vfs = fitText(doc, String(val), valW, 'Helvetica-Bold', fieldFs);
    doc.font('Helvetica-Bold').fontSize(vfs).fillColor('#111111')
      .text(String(val), valX, fy, { lineBreak: false });
    fy += lineH;
  });

  // ── Address and Contact in Bottom-Left (Blue area - Adjusted) ──
  const footerX = x + w * 0.04;
  const footerW = w * 0.38;
  const footerY = y + h * 0.87;
  doc.font('Helvetica').fontSize(4.5).fillColor('#ffffff')
    .text(d.schoolAddress || '', footerX, footerY, { width: footerW, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(4.5).fillColor('#ffffff')
    .text(d.contact || 'Phone: N/A', footerX, footerY + 7, { width: footerW, lineBreak: false });

  // ── Principal Signature bottom right ──
  const sigW = w * 0.28;
  drawSignature(doc, d.principalName, x + w * 0.68, y + h * 0.86, sigW, '#333333');
}

// ── TEMPLATE 9: Student Wave Navy Horizontal ──────────────────────────────────
// White bg, teal wave bands top + bottom, logo+name centered in top wave,
// gray circle top-right, "STUDENT CARD" heading left, 4 bold-label fields,
// large rounded photo right (navy border), white barcode in bottom teal band
function tStudentWaveNavy(doc, x, y, w, h, d) {
  const teal = resolveColor(d.primaryColor, '#3a95b0');
  const navy = '#1a2744';
  const bScale = w / 170; // SVG viewBox → card coords

  // White background
  doc.rect(x, y, w, h).fill('#ffffff');

  // ── Top teal wave: M0 0 L170 0 L170 28 Q127.5 16 85 28 Q42.5 40 0 28 Z ──
  doc.save();
  doc.rect(x, y, w, h).clip();
  doc.moveTo(x, y)
    .lineTo(x + w, y)
    .lineTo(x + w, y + h * 0.262)
    .quadraticCurveTo(x + w * 0.75, y + h * 0.150, x + w * 0.5, y + h * 0.262)
    .quadraticCurveTo(x + w * 0.25, y + h * 0.374, x, y + h * 0.262)
    .closePath()
    .fill(teal);
  doc.restore();

  // ── Bottom teal wave: M0 107 L170 107 L170 81 Q127.5 93 85 81 Q42.5 69 0 81 Z ──
  doc.save();
  doc.rect(x, y, w, h).clip();
  doc.moveTo(x, y + h)
    .lineTo(x + w, y + h)
    .lineTo(x + w, y + h * 0.757)
    .quadraticCurveTo(x + w * 0.75, y + h * 0.869, x + w * 0.5, y + h * 0.757)
    .quadraticCurveTo(x + w * 0.25, y + h * 0.645, x, y + h * 0.757)
    .closePath()
    .fill(teal);
  doc.restore();

  // Gray decorative circle top-right
  doc.save();
  doc.opacity(0.28);
  doc.circle(x + w * 0.953, y + h * 0.075, w * 0.053).fill('#999999');
  doc.restore();

  // Watermark
  wm(doc, x, y, w, h, d.logo);

  // ── Logo + school name centered in top wave ──
  const waveH = h * 0.262;
  const lSz = waveH * 0.50;
  const sName = titleCase(d.schoolName || 'School Name');
  doc.font('Helvetica-Bold').fontSize(7.5);
  const snW = Math.min(w * 0.36, 100);
  const snFs = fitText(doc, sName, snW, 'Helvetica-Bold', 7.5, 5.5);
  const approxTextW = Math.min(snW, 100);
  const groupW = lSz + 6 + approxTextW;
  const gStartX = x + (w - groupW) / 2;
  const gLogoY = y + (waveH - lSz) / 2;
  if (d.logo) drawLogo(doc, gStartX, gLogoY, lSz, d.logo);
  const gTxtX = gStartX + lSz + 6;
  const gTxtY = gLogoY + (lSz - snFs) / 2 - 1;
  doc.font('Helvetica-Bold').fontSize(snFs).fillColor(navy)
    .text(sName, gTxtX, gTxtY, { width: snW, align: 'left', lineBreak: false });
  if (d.schoolAddress) {
    doc.font('Helvetica').fontSize(4.5).fillColor(navy)
      .text(d.schoolAddress, gTxtX, gTxtY + snFs + 1.5, { width: snW, align: 'left', lineBreak: false });
  }

  // ── "STUDENT CARD" heading ──
  const headingY = y + h * 0.402; // 43/107
  doc.font('Helvetica-Bold').fontSize(14).fillColor(navy)
    .text('STUDENT CARD', x + w * 0.047, headingY, { lineBreak: false });

  // ── Bold-label field rows ──
  const lblX = x + w * 0.047; // 8/170
  const valX = x + w * 0.276; // 47/170
  // field values stay left of photo (photo starts at ~x+w*0.612)
  const valW = x + w * 0.600 - valX;
  const fFs = 6.5;
  const fLH = h * 0.084; // 9/107
  let fy = y + h * 0.486; // 52/107

  [
    ['STUDENT NAME', titleCase(d.name || 'N/A')],
    ['STUDENT ID',   d.studentId || d.roll || 'N/A'],
    ['D.O.B',        formatDate(d.dob)],
    ['HOME ADDRESS', d.address || ''],
  ].forEach(([lbl, val]) => {
    doc.font('Helvetica-Bold').fontSize(fFs).fillColor(navy)
      .text(lbl, lblX, fy, { lineBreak: false });
    const vFs = fitText(doc, ': ' + String(val), valW, 'Helvetica', fFs, 5);
    doc.font('Helvetica').fontSize(vFs).fillColor(navy)
      .text(': ' + String(val), valX, fy, { lineBreak: false, width: valW });
    fy += fLH;
  });

  // ── Photo right — large rounded corners, thick navy border ──
  const pBorderW = 2;
  const photoW = w * 0.353; // 60/170
  const photoH = h * 0.505; // 54/107
  const photoX = x + w * 0.612; // 104/170
  const photoY = y + h * 0.262; // 28/107  — sits at wave edge
  doc.roundedRect(photoX - pBorderW, photoY - pBorderW, photoW + pBorderW * 2, photoH + pBorderW * 2, 6)
    .lineWidth(pBorderW).strokeColor(navy).stroke();
  drawSquarePhoto(doc, d.profileImage, photoX, photoY, photoW, photoH, 6);

  // ── Barcode — white bars inside the bottom teal band ──
  const barcodeY = y + h * 0.794; // 85/107
  const barcodeH = h * 0.084;     // 9/107
  // [barWidth, gapAfter] in SVG 170-unit scale
  const barData = [
    [1.5,1],[2,1],[1,0.5],[2.5,1],[1,0.5],[2,1],
    [1.5,0.5],[1,0.5],[2.5,1],[1,0.5],[2,1],
    [1.5,0.5],[1,0.5],[2.5,1],[1,0.5],[2,1],[1.5,0.5],[2.5,0],
  ];
  let bx = x + 8 * bScale; // starts at SVG x=8
  barData.forEach(([barW, gapW]) => {
    doc.rect(bx, barcodeY, barW * bScale, barcodeH).fill('#ffffff');
    bx += (barW + gapW) * bScale;
  });
}

// ── Placeholder fallback template ─────────────────────────────────────────────

function tPlaceholder(doc, x, y, w, h, d) {
  doc.rect(x, y, w, h).fill('#f5f5f5');
  doc.rect(x, y, w, h).lineWidth(1).strokeColor('#ccc').stroke();
  doc.fillColor('#999').font('Helvetica-Bold').fontSize(12)
    .text('Template Coming Soon', x, y + h / 2 - 6, { width: w, align: 'center', lineBreak: false });
}

// ── Router ────────────────────────────────────────────────────────────────────

function drawTemplate(doc, x, y, w, h, tpl, d) {
  console.log('✏️ DRAWING TEMPLATE:', { tpl, role: d.role });
  const map = {
    'student-teal-horizontal': tStudentTeal,
    'student-navy-horizontal': tStudentNavy,
    'student-wave-navy': tStudentWaveNavy,
    'teacher-cream-horizontal': tTeacherCream,
    'security-red-vertical': tSecurityRed,
    'staff-navy-wave': tStaffNavyWave,
    'staff-blue-teal-vertical': tStaffBlueTeal,
    'position-holder-green': tPositionHolderGreen,
    'class-monitor-blue': tClassMonitorBlue,
  };


  const f = map[tpl] || tPlaceholder;
  f(doc, x, y, w, h, d);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

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
    res.status(500).json({ success: false, message: 'Server error fetching classes' });
  }
};

export const getStaffForIDCard = async (req, res) => {
  try {
    const { schoolId } = req;
    const Staff = await getModel(schoolId, 'staffs');
    const staff = await Staff.find({ status: 'active' }).select('name staffId role designation profilePicture contact').lean();
    res.status(200).json({ success: true, data: staff });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching staff' });
  }
};

async function getPersonData(req, schoolId, role, classId, personId, rollNumber, staffType) {
  const Student = await getModel(schoolId, 'students');
  const Staff = await getModel(schoolId, 'staffs');
  const Class = await getModel(schoolId, 'classes');
  let p, c = null;
  const isStudentRole = ['student', 'position_holder', 'class_monitor'].includes(role);
  if (isStudentRole) {
    if (personId) { p = await Student.findById(personId).lean(); }
    else if (['position_holder', 'class_monitor'].includes(role) && rollNumber) {
      const q = { rollNumber: String(rollNumber).trim(), isActive: true, status: 'active' };
      if (classId) q.classId = classId;
      p = await Student.findOne(q).lean();
    } else {
      const q = { isActive: true, status: 'active' };
      if (classId) q.classId = classId;
      p = await Student.findOne(q).sort({ rollNumber: 1 }).lean();
    }
    if (p && p.classId) c = await Class.findById(p.classId).lean();
  } else {
    if (personId) {
      p = await Staff.findById(personId).lean();
    } else {
      const q = { status: 'active' };
      if (role === 'security') q.designation = 'Security Guard';
      else if (role === 'teacher') q.role = 'teacher';
      else if (role === 'staff' && staffType) q.designation = staffType;
      p = await Staff.findOne(q).lean();
      if (!p && role === 'security') p = { name: '', staffId: '', designation: 'Security Guard', contact: '', profilePicture: null };
    }
    // Fetch class if staff is a teacher
    if (p && role === 'teacher') {
      // 1. Check if they are a primary Class Teacher
      c = await Class.findOne({ classTeacher: p._id.toString(), isActive: true }).lean();

      // 2. Fallback: Check their assignedClasses array
      if (!c && p.assignedClasses && p.assignedClasses.length > 0) {
        const firstAssigned = p.assignedClasses[0];
        const classId = firstAssigned.classId || (typeof firstAssigned === 'object' ? firstAssigned._id : firstAssigned);
        if (classId) {
          c = await Class.findById(classId).lean();
        }
      }
    }
  }


  return { p, c };
}


function buildData(p, c, school, profileBuffer, logoBuffer, primaryColor, role, staffType, position, principalNameOverride) {
  return {
    schoolName: school?.schoolName || 'Sample School',
    schoolAddress: school?.address || 'Sample Address',
    logo: logoBuffer,
    profileImage: profileBuffer,
    primaryColor,
    role: (role || p?.role || 'Staff').charAt(0).toUpperCase() + (role || p?.role || 'Staff').slice(1),
    name: p.name || p.fullName || 'Name',
    class: c ? `${c.className} ${c.section || ''}`.trim() : (p.class || ''),
    section: c?.section || '',
    roll: p.rollNumber || '',
    studentId: p.studentId || '',
    staffId: p.staffId || '',
    designation: (role === 'staff' && staffType) ? staffType : (p.designation || ''),
    subject: p.subject || '',
    department: p.department || '',
    contact: p.contact || p.phone || '',
    joinDate: p.joinDate || p.joiningDate || '',
    bloodGroup: p.bloodGroup || '',
    gender: p.gender || '',
    dob: p.dateOfBirth || p.dob || '',
    fatherName: p.fatherName || p.guardianName || '',
    address: p.address || '',
    session: c?.academicYear || '2025-2026',
    position: position || '',
    principalName: principalNameOverride || school?.principalName || school?.principal || 'Principal',
  };
}

export const previewIDCard = async (req, res) => {
  let doc;
  try {
    const { schoolId } = req;
    const { role = 'student', classId, templateName, personId, rollNumber, staffType, cardWidth, cardHeight, primaryColor, position, principalName } = req.body;

    const school = await School.findById(schoolId).lean();
    let { p, c } = await getPersonData(req, schoolId, role, classId, personId, rollNumber, staffType);

    if (!p) {
      p = {
        name: 'Name', fullName: 'Name', rollNumber: '0000', studentId: 'ST-0000',
        staffId: 'EMP-0000', designation: staffType || (role === 'teacher' ? 'Teacher' : role === 'security' ? 'Security Guard' : 'Staff'),
        contact: '000-0000000', phone: '000-0000000', profilePicture: null,
        bloodGroup: 'B+', gender: 'Male', fatherName: 'Father Name', address: 'School Address'
      };
      c = { className: 'Class X', section: 'A' };
    }

    const [logoBuffer, profileBuffer] = await Promise.all([
      fetchBuf(school?.logo?.url || school?.logo, req),
      fetchBuf(p.profilePicture, req)
    ]);

    const { w, h } = dims(cardWidth, cardHeight, templateName);
    doc = new PDFDocument({ autoFirstPage: false, margin: 0 });

    doc.on('error', (err) => {
      console.error('🔥 PDFKit Error:', err);
    });

    res.on('close', () => {
      if (doc) doc.unpipe(res);
    });

    doc.addPage({ size: [w, h], margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    drawTemplate(doc, 0, 0, w, h, templateName, buildData(p, c, school, profileBuffer, logoBuffer, primaryColor, role, staffType, position, principalName));
    doc.end();

  } catch (error) {
    console.error('🔥 PREVIEW ERROR:', error);
    if (doc) {
      try { doc.unpipe(res); doc.end(); } catch (e) { }
    }
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate preview', error: error.message });
    }
  }
};



export const generateIDCards = async (req, res) => {
  let doc;
  try {
    const { schoolId } = req;
    const { role = 'student', classId, templateName, personId, rollNumber, staffType, cardWidth, cardHeight, primaryColor, position, principalName } = req.body;

    const Student = await getModel(schoolId, 'students');
    const Staff = await getModel(schoolId, 'staffs');
    const Class = await getModel(schoolId, 'classes');
    const school = await School.findById(schoolId).lean();

    let people = [], c = null;
    const isStudentRole = ['student', 'position_holder', 'class_monitor'].includes(role);

    if (isStudentRole) {
      if (personId) {
        const s = await Student.findById(personId).lean();
        if (s) people = [s];
      } else if (role === 'position_holder' && rollNumber) {
        const s = await Student.findOne({ rollNumber: String(rollNumber).trim(), isActive: true, status: 'active' }).lean();
        if (s) people = [s];
      } else {
        const q = { isActive: true, status: 'active' };
        if (classId) q.classId = classId;
        people = await Student.find(q).sort({ rollNumber: 1 }).lean();
      }
      if (people.length > 0 && people[0].classId) c = await Class.findById(people[0].classId).lean();
    } else {
      if (personId) {
        const s = await Staff.findById(personId).lean();
        if (s) people = [s];
      } else {
        const q = { status: 'active' };
        if (role === 'security') q.designation = 'Security Guard';
        else if (role === 'teacher') q.role = 'teacher';
        else if (role === 'staff' && staffType) q.designation = staffType;
        people = await Staff.find(q).lean();
      }
    }

    if (people.length === 0) {
      if (role === 'security' && !personId) {
        people = [{ name: 'Guard Name', staffId: 'G-001', designation: 'Security Guard', contact: '000-0000', profilePicture: null }];
      } else {
        return res.status(404).json({ success: false, message: 'No active records found' });
      }
    }

    const logoBuffer = fetchBuf(school?.logo?.url || school?.logo, req);
    const { w, h } = dims(cardWidth, cardHeight, templateName);
    const spacing = 15;
    const cols = Math.floor((A4W - spacing) / (w + spacing)) || 1;
    const rows = Math.floor((A4H - spacing) / (h + spacing)) || 1;
    const cardsPerPage = cols * rows;

    const marginX = (A4W - (cols * w + (cols - 1) * spacing)) / 2;
    const marginY = (A4H - (rows * h + (rows - 1) * spacing)) / 2;

    doc = new PDFDocument({ size: 'A4', margin: 0 });

    doc.on('error', (err) => {
      console.error('🔥 PDF Generation Error:', err);
    });

    res.on('close', () => {
      if (doc) doc.unpipe(res);
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ID_Cards_${role}.pdf"`);
    doc.pipe(res);

    let cardsOnPage = 0;
    for (let i = 0; i < people.length; i++) {
      if (cardsOnPage === cardsPerPage) {
        doc.addPage();
        cardsOnPage = 0;
      }

      if (cardsOnPage === 0) {
        doc.save().lineWidth(0.5).strokeColor('#ccc').dash(3, { space: 3 });
        for (let j = 0; j <= cols; j++) {
          const lX = marginX + j * (w + spacing) - spacing / 2;
          if (lX > 0 && lX < A4W) doc.moveTo(lX, 0).lineTo(lX, A4H).stroke();
        }
        for (let j = 0; j <= rows; j++) {
          const lY = marginY + j * (h + spacing) - spacing / 2;
          if (lY > 0 && lY < A4H) doc.moveTo(0, lY).lineTo(A4W, lY).stroke();
        }
        doc.restore();
      }

      const col = cardsOnPage % cols;
      const row = Math.floor(cardsOnPage / cols);
      const px = marginX + col * (w + spacing);
      const py = marginY + row * (h + spacing);

      const person = people[i];
      let personCls = c;
      if (role === 'teacher') personCls = await Class.findOne({ classTeacher: person._id.toString(), isActive: true }).lean();

      const [lBuf, pBuf] = await Promise.all([logoBuffer, fetchBuf(person.profilePicture, req)]);
      drawTemplate(doc, px, py, w, h, templateName, buildData(person, personCls, school, pBuf, lBuf, primaryColor, role, staffType, position, principalName));
      cardsOnPage++;
    }

    doc.end();

  } catch (error) {
    console.error('🔥 GENERATION ERROR:', error);
    if (doc) {
      try { doc.unpipe(res); doc.end(); } catch (e) { }
    }
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Server error generating ID cards', error: error.message });
    }
  }
};