import PDFDocument from 'pdfkit';
import axios from 'axios';
import { getModel } from '../models/dynamicModels.js';
import School from '../models/School.js';

const MM = 2.83465;
const A4W = 595.28, A4H = 841.89;

// ── Helpers ───────────────────────────────────────────────────────────────────

function dims(cw, ch, tpl) {
  // class-monitor-horizontal is NOW landscape
  const portrait = ['student-vertical-blue', 'staff-vertical-orange', 'position-holder-black-gold'];
  const landscape = [
    'student-horizontal-wave', 'teacher-horizontal-green',
    'security-horizontal-red', 'support-staff-horizontal-purple',
    'class-monitor-horizontal'   // CHANGED: was class-monitor-vertical
  ];
  let w = (cw ? +cw : 85.6) * MM, h = (ch ? +ch : 54) * MM;
  const forceV = portrait.includes(tpl), forceH = landscape.includes(tpl);
  if (forceV && w > h) [w, h] = [h, w];
  if (forceH && h > w) [w, h] = [h, w];
  return { w, h };
}

function hexRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#6b21a8');
  return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [107, 33, 168];
}

function darken(hex, p = 0.25) {
  return '#' + hexRgb(hex).map(c => Math.max(0, Math.round(c * (1 - p))).toString(16).padStart(2, '0')).join('');
}

function lighten(hex, p = 0.88) {
  return '#' + hexRgb(hex).map(c => Math.min(255, Math.round(c + (255 - c) * p)).toString(16).padStart(2, '0')).join('');
}

function formatDate(val) {
  if (!val) return 'N/A';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

async function fetchBuf(url, req) {
  if (!url || url.includes('default-')) return null;
  try {
    let fullUrl = url;
    if (!url.startsWith('http')) {
      const host = req ? req.get('host') : 'localhost:5000';
      const proto = req ? req.protocol : 'http';
      fullUrl = `${proto}://${host}${url.startsWith('/') ? '' : '/'}${url}`;
    }
    const res = await axios.get(fullUrl, { responseType: 'arraybuffer', timeout: 8000 });
    return Buffer.from(res.data, 'binary');
  } catch (e) {
    console.warn('[IDCard] fetchBuf failed for:', url, e.message);
    return null;
  }
}

// Resolve color — use template default if generic blue passed
function resolveColor(primaryColor, defaultColor) {
  if (!primaryColor || primaryColor === '#2b6cb0') return defaultColor;
  return primaryColor;
}

// Watermark
function wm(doc, x, y, w, h, logo) {
  if (!logo) return;
  doc.save();
  doc.opacity(0.06);
  const s = Math.min(w, h) * 0.65;
  try { doc.image(logo, x + (w - s) / 2, y + (h - s) / 2, { width: s, height: s }); } catch { }
  doc.restore();
}

// Draw photo — square, silhouette fallback
function drawPhoto(doc, buf, x, y, w, h) {
  doc.save();
  doc.rect(x, y, w, h).fill('#e0e0e0');
  if (!buf) {
    const cx = x + w / 2;
    doc.circle(cx, y + h * 0.33, w * 0.19).fill('#b5b5b5');
    doc.ellipse(cx, y + h * 0.73, w * 0.28, h * 0.22).fill('#b5b5b5');
  } else {
    try { doc.image(buf, x, y, { width: w, height: h, cover: [w, h], align: 'center', valign: 'center' }); } catch { }
  }
  doc.restore();
}

// Draw logo — image if available, white graduation cap icon otherwise (no bg box on colored headers)
function drawLogo(doc, x, y, size, logoBuf, needsBgOnWhite, bgColor) {
  if (logoBuf) {
    doc.save();
    try {
      doc.image(logoBuf, x, y, { width: size, height: size, fit: [size, size], align: 'center', valign: 'center' });
    } catch (e) {
      console.warn('[IDCard] logo draw failed:', e.message);
    }
    doc.restore();
  } else {
    // On white headers we need a colored background so white icon is visible
    if (needsBgOnWhite && bgColor) {
      doc.save();
      doc.rect(x, y, size, size).fill(bgColor);
      doc.restore();
    }
    // White cap icon
    doc.save();
    doc.fillColor('#ffffff').opacity(0.92);
    const cx = x + size * 0.5, cy = y + size * 0.48, s = size * 0.3;
    doc.moveTo(cx, cy - s * 0.55).lineTo(cx + s, cy).lineTo(cx, cy + s * 0.45).lineTo(cx - s, cy).closePath().fill();
    doc.rect(cx - s * 0.32, cy + s * 0.08, s * 0.64, s * 0.28).fill();
    doc.restore();
  }
}

// Field row
function fRow(doc, label, value, lx, vx, y, fs, lc, vc) {
  doc.fillColor(lc || '#555').font('Helvetica').fontSize(fs).text(label, lx, y, { lineBreak: false });
  doc.fillColor(lc || '#555').font('Helvetica').fontSize(fs).text(' :', lx + doc.widthOfString(label), y, { lineBreak: false });
  doc.fillColor(vc || '#111').font('Helvetica-Bold').fontSize(fs).text(String(value || 'N/A'), vx, y, { lineBreak: false });
}

// Footer
function footer(doc, x, y, w, h, color, textColor) {
  const fh = h * 0.08, fy = y + h - fh;
  doc.rect(x, fy, w, fh).fill(color);
  doc.fillColor(textColor || '#fff').font('Helvetica-Bold').fontSize(Math.max(fh * 0.32, 7))
    .text('www.apnaschooledu.com', x, fy + fh * 0.28, { width: w, align: 'center', lineBreak: false });
}

// Signature — small, right side, vertical cards
function sigRightV(doc, x, y, w, h, lineColor) {
  const sigY = y + h * 0.882;
  const x1 = x + w * 0.52, x2 = x + w * 0.93;
  doc.save();
  doc.strokeColor(lineColor || '#cccccc').lineWidth(0.5).moveTo(x1, sigY).lineTo(x2, sigY).stroke();
  doc.restore();
  doc.fillColor('#999').font('Helvetica').fontSize(Math.max(h * 0.019, 5.5))
    .text('Principal Signature', x1, sigY + 2.5, { width: x2 - x1, align: 'center', lineBreak: false });
}

// Signature — small, right side, horizontal cards
function sigRightH(doc, rx, rw, sigY, lineColor) {
  const x1 = rx + rw * 0.42, x2 = rx + rw * 0.97;
  doc.save();
  doc.strokeColor(lineColor || '#cccccc').lineWidth(0.5).moveTo(x1, sigY).lineTo(x2, sigY).stroke();
  doc.restore();
  doc.fillColor('#999').font('Helvetica').fontSize(6)
    .text('Principal Signature', x1, sigY + 2, { width: x2 - x1, align: 'right', lineBreak: false });
}

// ── TEMPLATE 1: Student Vertical — PURPLE ─────────────────────────────────────
function tStudentVBlue(doc, x, y, w, h, d) {
  const p = resolveColor(d.primaryColor, '#6b21a8');
  doc.rect(x, y, w, h).fill('#ffffff');
  wm(doc, x, y, w, h, d.logo);

  const hH = h * 0.17;
  doc.rect(x, y, w, hH).fill(p);
  const logoSz = hH * 0.68;
  drawLogo(doc, x + 10, y + (hH - logoSz) / 2, logoSz, d.logo, false, null);
  const snX = x + 10 + logoSz + 8;
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.28, 11))
    .text((d.schoolName || 'APNA SCHOOL').toUpperCase(), snX, y + hH * 0.17, { lineBreak: false, width: w * 0.6 });
  doc.fillColor('rgba(255,255,255,0.82)').font('Helvetica').fontSize(Math.min(hH * 0.18, 7.5))
    .text(d.schoolAddress || 'School Address', snX, y + hH * 0.57, { lineBreak: false, width: w * 0.6 });

  const bH = h * 0.048, bY = y + hH + h * 0.022;
  const bW = w * 0.78, bX = x + (w - bW) / 2;
  doc.rect(bX, bY, bW, bH).fill(p);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(bH * 0.52)
    .text('STUDENT ID CARD', x, bY + bH * 0.22, { width: w, align: 'center', lineBreak: false });

  const ps = w * 0.42, px = x + (w - ps) / 2, pY = bY + bH + h * 0.028;
  doc.save(); doc.rect(px - 1.5, pY - 1.5, ps + 3, ps + 3).lineWidth(1.5).strokeColor(p).stroke(); doc.restore();
  drawPhoto(doc, d.profileImage, px, pY, ps, ps);

  const nY = pY + ps + h * 0.022;
  doc.fillColor(p).font('Helvetica-Bold').fontSize(h * 0.048)
    .text((d.name || 'Name').toUpperCase(), x + 5, nY, { width: w - 10, align: 'center', lineBreak: false });

  const lx = x + w * 0.1, vx = x + w * 0.5, fs = h * 0.027, gap = h * 0.043;
  let fy = nY + h * 0.062;
  fRow(doc, 'Class', d.class || 'N/A', lx, vx, fy, fs); fy += gap;
  fRow(doc, 'Section', d.section || 'N/A', lx, vx, fy, fs); fy += gap;
  fRow(doc, 'Roll No.', d.roll || 'N/A', lx, vx, fy, fs); fy += gap;
  fRow(doc, 'Student ID', d.studentId || 'N/A', lx, vx, fy, fs);

  sigRightV(doc, x, y, w, h, p);
  footer(doc, x, y, w, h, p);
}

// ── TEMPLATE 2: Student Horizontal Wave — GREEN ───────────────────────────────
function tStudentHWave(doc, x, y, w, h, d) {
  const p = resolveColor(d.primaryColor, '#1a6b3c');
  const dk = darken(p, 0.25);
  doc.rect(x, y, w, h).fill('#ffffff');
  wm(doc, x, y, w, h, d.logo);

  const hH = h * 0.22;
  doc.rect(x, y, w, hH).fill(p);
  const logoSz = hH * 0.65;
  drawLogo(doc, x + 12, y + (hH - logoSz) / 2, logoSz, d.logo, false, null);
  const snX = x + 12 + logoSz + 10;
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.3, 11))
    .text((d.schoolName || 'APNA SCHOOL').toUpperCase(), snX, y + hH * 0.15, { lineBreak: false, width: w * 0.42 });
  doc.fillColor('rgba(255,255,255,0.8)').font('Helvetica').fontSize(Math.min(hH * 0.18, 7.5))
    .text(d.schoolAddress || 'School Address', snX, y + hH * 0.54, { lineBreak: false, width: w * 0.42 });

  const bw = w * 0.22;
  doc.rect(x + w - bw, y, bw, hH).fill(dk);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.22, 9))
    .text('STUDENT\nID CARD', x + w - bw, y + hH * 0.2, { width: bw, align: 'center' });

  const panelW = w * 0.35;
  doc.rect(x, y + hH, panelW, h - hH).fill(p);
  const ps = panelW * 0.72, px2 = x + (panelW - ps) / 2, pY = y + hH + (h - hH) * 0.09;
  doc.save(); doc.rect(px2 - 2, pY - 2, ps + 4, ps + 4).fill('#fff'); doc.restore();
  drawPhoto(doc, d.profileImage, px2, pY, ps, ps);
  doc.fillColor('#fff').font('Helvetica').fontSize(Math.min(h * 0.04, 7))
    .text('ID: ' + (d.studentId || 'N/A'), x, pY + ps + h * 0.03, { width: panelW, align: 'center', lineBreak: false });

  const rx = x + panelW + 18, rw = w - panelW - 25;
  const nY = y + hH + (h - hH) * 0.09;
  doc.fillColor(p).font('Helvetica-Bold').fontSize(Math.min(h * 0.1, 18))
    .text((d.name || 'Name').toUpperCase(), rx, nY, { width: rw, lineBreak: false });

  const fs = Math.min(h * 0.055, 9), gap = h * 0.1;
  let fy = nY + h * 0.17;
  const lvx = rx + rw * 0.42;
  fRow(doc, 'Class', d.class || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Section', d.section || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Roll No.', d.roll || 'N/A', rx, lvx, fy, fs);

  sigRightH(doc, rx, rw, y + h * 0.84, p);
  footer(doc, x, y, w, h, p);
}

// ── TEMPLATE 3: Teacher Horizontal — GREEN ────────────────────────────────────
function tTeacherHGreen(doc, x, y, w, h, d) {
  const p = resolveColor(d.primaryColor, '#1a6b3c');
  const lt = lighten(p, 0.88);
  doc.rect(x, y, w, h).fill('#ffffff');
  wm(doc, x, y, w, h, d.logo);

  const hH = h * 0.22;
  doc.rect(x, y, w, hH).fill('#ffffff');
  const logoSz = hH * 0.72;
  // On white header — needs colored bg so icon visible
  drawLogo(doc, x + 12, y + (hH - logoSz) / 2, logoSz, d.logo, true, p);

  const snX = x + 12 + logoSz + 10;
  doc.fillColor(p).font('Helvetica-Bold').fontSize(Math.min(hH * 0.3, 11))
    .text((d.schoolName || 'APNA SCHOOL').toUpperCase(), snX, y + hH * 0.15, { lineBreak: false, width: w * 0.42 });
  doc.fillColor('#666').font('Helvetica').fontSize(Math.min(hH * 0.18, 7.5))
    .text(d.schoolAddress || 'School Address', snX, y + hH * 0.55, { lineBreak: false, width: w * 0.42 });

  const bw = w * 0.22;
  doc.rect(x + w - bw, y, bw, hH).fill(p);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.22, 9))
    .text('TEACHER\nID CARD', x + w - bw, y + hH * 0.2, { width: bw, align: 'center' });

  doc.save();
  doc.strokeColor(p).lineWidth(1.5).moveTo(x, y + hH).lineTo(x + w, y + hH).stroke();
  doc.restore();

  const panelW = w * 0.35;
  doc.rect(x, y + hH, panelW, h - hH).fill(lt);
  const ps = panelW * 0.72, px2 = x + (panelW - ps) / 2, pY = y + hH + (h - hH) * 0.09;
  doc.save(); doc.rect(px2 - 1.5, pY - 1.5, ps + 3, ps + 3).lineWidth(1.5).strokeColor(p).stroke(); doc.restore();
  drawPhoto(doc, d.profileImage, px2, pY, ps, ps);
  doc.fillColor(p).font('Helvetica-Bold').fontSize(Math.min(h * 0.04, 7))
    .text('ID: ' + (d.staffId || 'N/A'), x, pY + ps + h * 0.03, { width: panelW, align: 'center', lineBreak: false });

  const rx = x + panelW + 18, rw = w - panelW - 25;
  doc.fillColor(p).font('Helvetica-Bold').fontSize(Math.min(h * 0.1, 16))
    .text((d.name || 'Name').toUpperCase(), rx, pY, { width: rw, lineBreak: false });

  const fs = Math.min(h * 0.055, 9), gap = h * 0.1;
  let fy = pY + h * 0.17;
  const lvx = rx + rw * 0.48;
  fRow(doc, 'Designation', d.designation || 'Teacher', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Subject', d.subject || 'General', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Join Date', formatDate(d.joinDate), rx, lvx, fy, fs);

  sigRightH(doc, rx, rw, y + h * 0.84, p);
  footer(doc, x, y, w, h, p);
}

// ── TEMPLATE 4: Staff Vertical Orange ────────────────────────────────────────
function tStaffVOrange(doc, x, y, w, h, d) {
  const p = resolveColor(d.primaryColor, '#c05621');
  const lt = lighten(p, 0.88);
  doc.rect(x, y, w, h).fill('#ffffff');
  wm(doc, x, y, w, h, d.logo);

  const stripW = w * 0.055;
  doc.rect(x, y, stripW, h).fill(p);

  const hH = h * 0.19;
  doc.rect(x + stripW, y, w - stripW, hH).fill(p);
  const logoSz = hH * 0.68;
  drawLogo(doc, x + stripW + 10, y + (hH - logoSz) / 2, logoSz, d.logo, false, null);
  const snX = x + stripW + logoSz + 18;
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.26, 10))
    .text((d.schoolName || 'APNA SCHOOL').toUpperCase(), snX, y + hH * 0.17, { lineBreak: false, width: w * 0.56 });
  doc.fillColor('rgba(255,255,255,0.8)').font('Helvetica').fontSize(Math.min(hH * 0.17, 7))
    .text(d.schoolAddress || 'School Address', snX, y + hH * 0.57, { lineBreak: false, width: w * 0.56 });

  const titleY = y + hH + h * 0.025;
  doc.fillColor(p).font('Helvetica-Bold').fontSize(h * 0.05)
    .text('STAFF ID CARD', x + stripW, titleY, { width: w - stripW, align: 'center', lineBreak: false });
  const lineW = (w - stripW) * 0.75;
  doc.rect(x + stripW + (w - stripW - lineW) / 2, titleY + h * 0.055, lineW, 1.5).fill(p);

  const ps = w * 0.44, px2 = x + stripW + ((w - stripW) - ps) / 2, pY = titleY + h * 0.075;
  doc.save(); doc.rect(px2 - 2.5, pY - 2.5, ps + 5, ps + 5).lineWidth(2.5).strokeColor(p).stroke(); doc.restore();
  drawPhoto(doc, d.profileImage, px2, pY, ps, ps);

  const nY = pY + ps + h * 0.022;
  doc.fillColor(p).font('Helvetica-Bold').fontSize(h * 0.05)
    .text((d.name || 'Name').toUpperCase(), x + stripW + 5, nY, { width: w - stripW - 10, align: 'center', lineBreak: false });

  const fieldsY = nY + h * 0.055;
  doc.rect(x + stripW + w * 0.05, fieldsY - h * 0.008, w * 0.85, h * 0.225).fill(lt);
  const lx = x + stripW + w * 0.1, vx = x + stripW + w * 0.5;
  const fs = h * 0.028, gap = h * 0.045;
  let fy = fieldsY + h * 0.01;
  fRow(doc, 'Designation', d.designation || 'Staff', lx, vx, fy, fs); fy += gap;
  fRow(doc, 'Department', d.department || 'N/A', lx, vx, fy, fs); fy += gap;
  fRow(doc, 'Employee ID', d.staffId || 'N/A', lx, vx, fy, fs); fy += gap;
  fRow(doc, 'Join Date', formatDate(d.joinDate), lx, vx, fy, fs);

  const bcY = y + h * 0.868, bcH = h * 0.027;
  const bars = [2, 1, 3, 1, 2, 1, 4, 1, 2, 3, 1, 2, 1, 3, 2, 1, 4, 1, 2, 1, 3, 2, 1];
  let bxB = x + stripW + w * 0.1;
  bars.forEach((bw2, i) => { if (i % 2 === 0) doc.rect(bxB, bcY, bw2, bcH).fill('#333'); bxB += bw2 + 1; });

  footer(doc, x, y, w, h, p);
}

// ── TEMPLATE 5: Security Horizontal Red ──────────────────────────────────────
function tSecurityHRed(doc, x, y, w, h, d) {
  const p = resolveColor(d.primaryColor, '#c53030');
  const dk = darken(p, 0.22);
  doc.rect(x, y, w, h).fill('#ffffff');
  wm(doc, x, y, w, h, d.logo);

  const hH = h * 0.24;
  doc.rect(x, y, w, hH).fill(p);
  const logoSz = hH * 0.65;
  drawLogo(doc, x + 12, y + (hH - logoSz) / 2, logoSz, d.logo, false, null);
  const snX = x + 12 + logoSz + 10;
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.28, 10))
    .text((d.schoolName || 'APNA SCHOOL').toUpperCase(), snX, y + hH * 0.15, { lineBreak: false, width: w * 0.38 });
  doc.fillColor('rgba(255,255,255,0.8)').font('Helvetica').fontSize(Math.min(hH * 0.18, 7))
    .text(d.schoolAddress || 'School Address', snX, y + hH * 0.54, { lineBreak: false, width: w * 0.38 });

  const bw = w * 0.26, bx2 = x + w - bw;
  doc.rect(bx2, y, bw, hH).fill(dk);
  doc.save();
  const shX = bx2 + bw * 0.5, shY = y + hH * 0.18, shS = hH * 0.22;
  doc.fillColor('rgba(255,255,255,0.22)');
  doc.moveTo(shX, shY).lineTo(shX + shS, shY + shS * 0.32).lineTo(shX + shS, shY + shS * 0.9)
    .lineTo(shX, shY + shS * 1.2).lineTo(shX - shS, shY + shS * 0.9).lineTo(shX - shS, shY + shS * 0.32).closePath().fill();
  doc.restore();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.22, 8))
    .text('SECURITY\nID CARD', bx2, y + hH * 0.18, { width: bw, align: 'center' });

  const ps = h * 0.48, px2 = x + 18, pY = y + hH + (h - hH) * 0.1;
  doc.save(); doc.rect(px2 - 1.5, pY - 1.5, ps + 3, ps + 3).lineWidth(1.5).strokeColor(p).stroke(); doc.restore();
  drawPhoto(doc, d.profileImage, px2, pY, ps, ps);

  const rx = px2 + ps + 20, rw = w - rx + x - 12;
  doc.fillColor(p).font('Helvetica-Bold').fontSize(Math.min(h * 0.1, 15))
    .text((d.name || 'Name').toUpperCase(), rx, pY, { width: rw, lineBreak: false });

  const fs = Math.min(h * 0.05, 8.5), gap = h * 0.095;
  let fy = pY + h * 0.16;
  const lvx = rx + rw * 0.48;
  fRow(doc, 'Position', d.designation || 'Security Guard', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'ID Number', d.staffId || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Contact', d.contact || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Blood Group', d.bloodGroup || 'N/A', rx, lvx, fy, fs);

  const bannerH = h * 0.1, bannerY = y + h * 0.82;
  doc.rect(x, bannerY, w, bannerH).fill(p);
  doc.save();
  doc.rect(x, bannerY, w, bannerH).clip();
  for (let i = -10; i < w + 20; i += 14) {
    doc.save(); doc.strokeColor(dk).lineWidth(6).opacity(0.3);
    doc.moveTo(x + i, bannerY).lineTo(x + i + 15, bannerY + bannerH).stroke();
    doc.restore();
  }
  doc.restore();
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(bannerH * 0.45, 10))
    .text('AUTHORIZED STAFF', x, bannerY + bannerH * 0.27, { width: w, align: 'center', lineBreak: false });

  footer(doc, x, y, w, h, p);
}

// ── TEMPLATE 6: Support Staff Horizontal — NO SIGNATURE ──────────────────────
function tSupportStaffHPurple(doc, x, y, w, h, d) {
  const p = resolveColor(d.primaryColor, '#553c9a');
  const dk = darken(p, 0.22);
  doc.rect(x, y, w, h).fill('#f8f8f8');
  wm(doc, x, y, w, h, d.logo);

  const hH = h * 0.24;
  doc.rect(x, y, w, hH).fill(p);
  doc.save();
  doc.fillColor(dk);
  doc.moveTo(x + w * 0.56, y).lineTo(x + w, y).lineTo(x + w, y + hH).lineTo(x + w * 0.7, y + hH).closePath().fill();
  doc.restore();

  const logoSz = hH * 0.62;
  drawLogo(doc, x + 14, y + (hH - logoSz) / 2, logoSz, d.logo, false, null);
  const snX = x + 14 + logoSz + 10;
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.27, 10))
    .text((d.schoolName || 'APNA SCHOOL').toUpperCase(), snX, y + hH * 0.15, { lineBreak: false, width: w * 0.36 });
  doc.fillColor('rgba(255,255,255,0.82)').font('Helvetica').fontSize(Math.min(hH * 0.17, 7))
    .text(d.schoolAddress || 'School Address', snX, y + hH * 0.53, { lineBreak: false, width: w * 0.36 });
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.19, 8))
    .text('SUPPORT STAFF\nID CARD', x + w * 0.73, y + hH * 0.22, { width: w * 0.24, align: 'center' });
  doc.rect(x, y + hH - h * 0.03, w, h * 0.03).fill(dk);

  const ps = h * 0.46, px2 = x + 16, pY = y + hH + (h - hH) * 0.1;
  doc.save(); doc.rect(px2 - 2, pY - 2, ps + 4, ps + 4).lineWidth(2).strokeColor(p).stroke(); doc.restore();
  drawPhoto(doc, d.profileImage, px2, pY, ps, ps);

  const rx = px2 + ps + 16, rw = w - rx + x - 10;
  doc.fillColor(p).font('Helvetica-Bold').fontSize(Math.min(h * 0.095, 14))
    .text((d.name || 'Name').toUpperCase(), rx, pY, { width: rw, lineBreak: false });
  doc.save(); doc.rect(rx, pY + h * 0.115, rw * 0.85, 2).fill(p); doc.restore();

  const fs = Math.min(h * 0.05, 8.5), gap = h * 0.093;
  let fy = pY + h * 0.15;
  const lvx = rx + rw * 0.44;
  fRow(doc, 'Role', d.designation || 'Support Staff', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Staff ID', d.staffId || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Contact', d.contact || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Join Date', formatDate(d.joinDate), rx, lvx, fy, fs);

  // NO SIGNATURE
  const fh = h * 0.1, fy2 = y + h - fh;
  doc.rect(x, fy2, w, fh).fill(p);
  doc.fillColor('rgba(255,255,255,0.65)').font('Helvetica').fontSize(Math.min(fh * 0.28, 7))
    .text((d.schoolName || 'APNA SCHOOL').toUpperCase(), x + 8, fy2 + fh * 0.32, { lineBreak: false });
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(fh * 0.28, 7))
    .text('www.apnaschooledu.com', x, fy2 + fh * 0.32, { width: w - 10, align: 'right', lineBreak: false });
}

// ── TEMPLATE 7: Position Holder Black & Gold ──────────────────────────────────
function tPositionHolderV(doc, x, y, w, h, d) {
  const gold = resolveColor(d.primaryColor, '#d4a017');
  const darkGold = darken(gold, 0.25);
  doc.rect(x, y, w, h).fill('#111111');
  wm(doc, x, y, w, h, d.logo);

  const hH = h * 0.14;
  const logoSz = hH * 0.72;
  drawLogo(doc, x + 10, y + (hH - logoSz) / 2, logoSz, d.logo, false, null);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.28, 9))
    .text((d.schoolName || 'APNA SCHOOL').toUpperCase(), x + logoSz + 22, y + hH * 0.18, { lineBreak: false, width: w - logoSz - 32 });
  doc.fillColor('rgba(255,255,255,0.6)').font('Helvetica').fontSize(Math.min(hH * 0.18, 6.5))
    .text(d.schoolAddress || 'School Address', x + logoSz + 22, y + hH * 0.57, { lineBreak: false, width: w - logoSz - 32 });

  const bannerH = h * 0.055, bannerY = y + hH;
  doc.rect(x, bannerY, w, bannerH).fill(gold);
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(bannerH * 0.48)
    .text('POSITION HOLDER', x, bannerY + bannerH * 0.22, { width: w, align: 'center', lineBreak: false });

  const ps = w * 0.42, pY = bannerY + bannerH + h * 0.04;
  const cxP = x + w / 2, cyP = pY + ps / 2;
  doc.save();
  doc.circle(cxP, cyP, ps / 2 + 8).lineWidth(4).strokeColor(gold).stroke();
  doc.circle(cxP, cyP, ps / 2 + 3).lineWidth(1).strokeColor(darkGold).stroke();
  doc.circle(cxP, cyP, ps / 2).clip();
  drawPhoto(doc, d.profileImage, cxP - ps / 2, cyP - ps / 2, ps, ps);
  doc.restore();

  const rH = h * 0.045, rY = pY + ps + h * 0.015;
  const rW = w * 0.7, rX = x + (w - rW) / 2;
  doc.rect(rX, rY, rW, rH).fill(gold);
  doc.save();
  const tail = rH * 0.4;
  doc.moveTo(rX, rY).lineTo(rX - tail, rY + rH / 2).lineTo(rX, rY + rH).closePath().fill(gold);
  doc.moveTo(rX + rW, rY).lineTo(rX + rW + tail, rY + rH / 2).lineTo(rX + rW, rY + rH).closePath().fill(gold);
  doc.restore();
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(rH * 0.5)
    .text((d.position || 'HEAD BOY').toUpperCase(), rX, rY + rH * 0.22, { width: rW, align: 'center', lineBreak: false });

  const nY = rY + rH + h * 0.022;
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(h * 0.048)
    .text((d.name || 'Name').toUpperCase(), x + 5, nY, { width: w - 10, align: 'center', lineBreak: false });

  const lx = x + w * 0.12, vx = x + w * 0.5, fs = h * 0.026, gap = h * 0.042;
  let fy = nY + h * 0.065;
  fRow(doc, 'Class', d.class || 'N/A', lx, vx, fy, fs, '#aaa', '#fff'); fy += gap;
  fRow(doc, 'Section', d.section || 'N/A', lx, vx, fy, fs, '#aaa', '#fff'); fy += gap;
  fRow(doc, 'Roll No.', d.roll || 'N/A', lx, vx, fy, fs, '#aaa', '#fff'); fy += gap;
  fRow(doc, 'Student ID', d.studentId || 'N/A', lx, vx, fy, fs, '#aaa', '#fff');

  sigRightV(doc, x, y, w, h, gold);

  const fh = h * 0.08, fy3 = y + h - fh;
  doc.rect(x, fy3, w, fh).fill(gold);
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(Math.max(fh * 0.3, 7))
    .text('www.apnaschooledu.com', x, fy3 + fh * 0.28, { width: w, align: 'center', lineBreak: false });
}

// ── TEMPLATE 8: Class Monitor — HORIZONTAL (CHANGED from vertical) ────────────
function tClassMonitorH(doc, x, y, w, h, d) {
  const p = resolveColor(d.primaryColor, '#0f766e');
  const dk = darken(p, 0.25);
  doc.rect(x, y, w, h).fill('#ffffff');
  wm(doc, x, y, w, h, d.logo);

  // Header — same style as student horizontal
  const hH = h * 0.22;
  doc.rect(x, y, w, hH).fill(p);
  const logoSz = hH * 0.65;
  drawLogo(doc, x + 12, y + (hH - logoSz) / 2, logoSz, d.logo, false, null);
  const snX = x + 12 + logoSz + 10;
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.3, 11))
    .text((d.schoolName || 'APNA SCHOOL').toUpperCase(), snX, y + hH * 0.15, { lineBreak: false, width: w * 0.42 });
  doc.fillColor('rgba(255,255,255,0.8)').font('Helvetica').fontSize(Math.min(hH * 0.18, 7.5))
    .text(d.schoolAddress || 'School Address', snX, y + hH * 0.54, { lineBreak: false, width: w * 0.42 });

  // CLASS MONITOR badge top right
  const bw = w * 0.24;
  doc.rect(x + w - bw, y, bw, hH).fill(dk);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(Math.min(hH * 0.22, 9))
    .text('CLASS\nMONITOR', x + w - bw, y + hH * 0.2, { width: bw, align: 'center' });

  // Left colored panel
  const panelW = w * 0.35;
  doc.rect(x, y + hH, panelW, h - hH).fill(p);
  const ps = panelW * 0.72, px2 = x + (panelW - ps) / 2, pY = y + hH + (h - hH) * 0.09;
  doc.save(); doc.rect(px2 - 2, pY - 2, ps + 4, ps + 4).fill('#fff'); doc.restore();
  drawPhoto(doc, d.profileImage, px2, pY, ps, ps);
  doc.fillColor('#fff').font('Helvetica').fontSize(Math.min(h * 0.04, 7))
    .text('ID: ' + (d.studentId || 'N/A'), x, pY + ps + h * 0.03, { width: panelW, align: 'center', lineBreak: false });

  // Right content
  const rx = x + panelW + 18, rw = w - panelW - 25;
  const nY = y + hH + (h - hH) * 0.09;
  doc.fillColor(p).font('Helvetica-Bold').fontSize(Math.min(h * 0.1, 18))
    .text((d.name || 'Name').toUpperCase(), rx, nY, { width: rw, lineBreak: false });

  // Accent line under name
  doc.save(); doc.rect(rx, nY + h * 0.115, rw * 0.7, 1.5).fill(p); doc.restore();

  const fs = Math.min(h * 0.055, 9), gap = h * 0.095;
  let fy = nY + h * 0.16;
  const lvx = rx + rw * 0.42;
  fRow(doc, 'Class', d.class || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Section', d.section || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Roll No.', d.roll || 'N/A', rx, lvx, fy, fs); fy += gap;
  fRow(doc, 'Student ID', d.studentId || 'N/A', rx, lvx, fy, fs);

  sigRightH(doc, rx, rw, y + h * 0.84, p);
  footer(doc, x, y, w, h, p);
}

// ── Router ────────────────────────────────────────────────────────────────────

function drawTemplate(doc, x, y, w, h, tpl, d) {
  const map = {
    'student-vertical-blue': tStudentVBlue,
    'student-horizontal-wave': tStudentHWave,
    'teacher-horizontal-green': tTeacherHGreen,
    'staff-vertical-orange': tStaffVOrange,
    'security-horizontal-red': tSecurityHRed,
    'support-staff-horizontal-purple': tSupportStaffHPurple,
    'position-holder-black-gold': tPositionHolderV,
    'class-monitor-horizontal': tClassMonitorH,
    // backward compat alias
    'class-monitor-vertical': tClassMonitorH
  };
  const f = map[tpl] || tStudentVBlue;
  f(doc, x, y, w, h, d);
}

// ── Data helpers ──────────────────────────────────────────────────────────────

async function getPersonData(req, schoolId, role, classId, personId, rollNumber, staffType) {
  const Student = await getModel(schoolId, 'students');
  const Staff = await getModel(schoolId, 'staffs');
  const Class = await getModel(schoolId, 'classes');
  let p = null, c = null;
  const isStudentRole = ['student', 'position_holder', 'class_monitor'].includes(role);
  console.log(`[IDCard] role:${role} classId:${classId} personId:${personId} rollNumber:${rollNumber}`);

  if (isStudentRole) {
    if (personId) {
      p = await Student.findById(personId).lean();
    } else if (role === 'position_holder' && rollNumber) {
      p = await Student.findOne({ rollNumber: String(rollNumber).trim(), isActive: true, status: 'active' }).lean();
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
      if (role === 'security') {
        q.designation = 'Security Guard';
      } else if (role === 'teacher') {
        // BROADENED: match role OR designation containing 'teacher'
        // Use $or so we catch both field conventions
        p = await Staff.findOne({
          status: 'active',
          $or: [
            { role: 'teacher' },
            { role: 'Teacher' },
            { designation: { $regex: /teacher/i } }
          ]
        }).lean();
      } else if (role === 'staff' && staffType) {
        q.designation = staffType;
      }
      if (!p) p = await Staff.findOne(q).lean();
      if (!p && role === 'security') {
        p = { name: '', staffId: '', designation: 'Security Guard', contact: '', profilePicture: null };
      }
    }
  }
  return { p, c };
}

function buildData(p, c, school, profileBuffer, logoBuffer, primaryColor, role, staffType, position) {
  return {
    schoolName: school?.schoolName || 'Sample School',
    schoolAddress: school?.address || 'Sample Address',
    logo: logoBuffer,
    profileImage: profileBuffer,
    primaryColor,
    role,
    name: p.name || p.fullName || 'Name',
    class: c ? `${c.className} ${c.section || ''}`.trim() : '',
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
    dob: p.dateOfBirth || p.dob || '',
    position: position || '',
    session: c?.academicYear || '2025-2026'
  };
}

// ── Exported handlers ─────────────────────────────────────────────────────────

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
    // Return ALL active staff — frontend filters by role/designation
    const staff = await Staff.find({ status: 'active' })
      .select('name staffId designation profilePicture contact role')
      .lean();
    res.status(200).json({ success: true, data: staff });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error fetching staff' });
  }
};

export const previewIDCard = async (req, res) => {
  console.log('[IDCard preview] body:', req.body);
  try {
    const { schoolId } = req;
    const { role = 'student', classId, templateName, personId, rollNumber, staffType, cardWidth, cardHeight, primaryColor, position } = req.body;
    const school = await School.findById(schoolId).lean();
    let { p, c } = await getPersonData(req, schoolId, role, classId, personId, rollNumber, staffType);
    if (!p) {
      p = {
        name: 'Name', fullName: 'Name', rollNumber: '0000', studentId: 'ST-0000', staffId: 'EMP-0000',
        designation: staffType || (role === 'teacher' ? 'Teacher' : role === 'security' ? 'Security Guard' : 'Staff'),
        contact: '000-0000000', phone: '000-0000000', profilePicture: null
      };
      c = { className: 'Class X', section: 'A' };
    }
    const logoBuffer = await fetchBuf(school?.logo?.url, req);
    const profileBuffer = await fetchBuf(p.profilePicture, req);
    const { w, h } = dims(cardWidth, cardHeight, templateName);
    const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
    doc.addPage({ size: [w, h], margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    drawTemplate(doc, 0, 0, w, h, templateName, buildData(p, c, school, profileBuffer, logoBuffer, primaryColor, role, staffType, position));
    doc.end();
  } catch (error) {
    console.error('Preview error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to generate preview' });
  }
};

export const generateIDCards = async (req, res) => {
  try {
    const { schoolId } = req;
    const { role = 'student', classId, templateName, personId, rollNumber, staffType, cardWidth, cardHeight, primaryColor, position } = req.body;
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
        let staffQuery;
        if (role === 'security') {
          staffQuery = { status: 'active', designation: 'Security Guard' };
          people = await Staff.find(staffQuery).lean();
        } else if (role === 'teacher') {
          // BROADENED query
          people = await Staff.find({
            status: 'active',
            $or: [
              { role: 'teacher' },
              { role: 'Teacher' },
              { designation: { $regex: /teacher/i } }
            ]
          }).lean();
        } else if (role === 'staff' && staffType) {
          people = await Staff.find({ status: 'active', designation: staffType }).lean();
        } else {
          people = await Staff.find({ status: 'active' }).lean();
        }
      }
    }

    if (people.length === 0) {
      if (role === 'security' && !personId) {
        people = [{ name: '', staffId: '', designation: 'Security Guard', contact: '', profilePicture: null }];
      } else {
        return res.status(404).json({ success: false, message: 'No active records found' });
      }
    }

    const logoBuffer = await fetchBuf(school?.logo?.url, req);
    const { w, h } = dims(cardWidth, cardHeight, templateName);
    const spacing = 15;
    const cols = Math.floor((A4W - spacing) / (w + spacing)) || 1;
    const rows = Math.floor((A4H - spacing) / (h + spacing)) || 1;
    const cardsPerPage = cols * rows;
    const marginX = (A4W - (cols * w + (cols - 1) * spacing)) / 2;
    const marginY = (A4H - (rows * h + (rows - 1) * spacing)) / 2;

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ID_Cards_${role}.pdf"`);
    doc.pipe(res);
    let cardsOnPage = 0;

    for (let i = 0; i < people.length; i++) {
      const person = people[i];
      if (cardsOnPage === cardsPerPage) { doc.addPage(); cardsOnPage = 0; }
      if (cardsOnPage === 0) {
        doc.save(); doc.lineWidth(0.5); doc.strokeColor('#ccc'); doc.dash(3, { space: 3 });
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
      const col = cardsOnPage % cols, row = Math.floor(cardsOnPage / cols);
      const px3 = marginX + col * (w + spacing), py2 = marginY + row * (h + spacing);
      const profileBuffer = await fetchBuf(person.profilePicture, req);
      drawTemplate(doc, px3, py2, w, h, templateName, buildData(person, c, school, profileBuffer, logoBuffer, primaryColor, role, staffType, position));
      cardsOnPage++;
    }
    doc.end();
  } catch (error) {
    console.error('Generation error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Server error generating ID cards' });
  }
};
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
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
       .text(data.schoolName || 'School Name', x + 50, y + 10, { width: w - 55, align: 'left' });

    if (data.schoolAddress) {
       doc.fontSize(6).font('Helvetica').text(data.schoolAddress, x + 50, y + 21, { width: w - 55, height: 20 });
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
    const fontSize = 7;

    doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(9).text(data.name, labelX, dataY, { width: w - photoSize - 25 });
    dataY += 13;

    doc.fillColor(textColor).font('Helvetica-Bold').fontSize(fontSize).text('Class:', labelX, dataY, { continued: true })
       .font('Helvetica').text(` ${data.class}`);
    dataY += 10;

    doc.font('Helvetica-Bold').text('Roll No:', labelX, dataY, { continued: true })
       .font('Helvetica').text(` ${data.roll || 'N/A'}`);
    dataY += 10;

    doc.font('Helvetica-Bold').text('Student ID:', labelX, dataY, { continued: true })
       .font('Helvetica').text(` ${data.studentId !== 'N/A' ? data.studentId : '-'}`);
    dataY += 10;

    doc.font('Helvetica-Bold').text('Session:', labelX, dataY, { continued: true })
       .font('Helvetica').text(` ${data.session}`);
    dataY += 10;

    if (data.parentPhone && data.parentPhone !== 'N/A') {
        doc.font('Helvetica-Bold').text('Emergency:', labelX, dataY, { continued: true })
           .font('Helvetica').text(` ${data.parentPhone}`);
    }

    // Footer
    doc.rect(x, y + h - 14, w, 14).fill(primaryColor);
    doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold')
       .text('STUDENT IDENTITY CARD', x, y + h - 10, { width: w, align: 'center' });
}
