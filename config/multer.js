import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Ensure uploads directories exist
const uploadsDir = path.join(__dirname, '../uploads');
const reportsDir = path.join(uploadsDir, 'reports');
const diaryDir = path.join(uploadsDir, 'diary');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

if (!fs.existsSync(diaryDir)) {
  fs.mkdirSync(diaryDir, { recursive: true });
}

// Configure storage for report PDFs
const reportStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, reportsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: studentId_timestamp_originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const studentId = req.body.student || req.body.studentId || 'unknown';
    const extension = path.extname(file.originalname);
    const filename = `report_${studentId}_${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

// File filter to accept PDFs and other common document types
const pdfFileFilter = (req, file, cb) => {
  // Accept PDF, DOC, DOCX, JPG, PNG files
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed. Only PDF, DOC, DOCX, JPG, PNG are allowed'), false);
  }
};

// Configure multer for report uploads
export const uploadReportPDF = multer({
  storage: reportStorage,
  fileFilter: pdfFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// General file upload configuration (for notices, etc.)
const generalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const noticesDir = path.join(uploadsDir, 'notices');
    if (!fs.existsSync(noticesDir)) {
      fs.mkdirSync(noticesDir, { recursive: true });
    }
    cb(null, noticesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension);
    const filename = `${basename}_${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

// File filter for notices (accept common document types)
const generalFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed. Only PDF, DOC, DOCX, JPG, PNG are allowed'), false);
  }
};

// Configure multer for general uploads
export const uploadGeneral = multer({
  storage: generalStorage,
  fileFilter: generalFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Configure storage for diary attachments
const diaryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, diaryDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension);
    const filename = `diary_${basename}_${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

// File filter for diary attachments
const diaryFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed. Only PDF, DOC, DOCX, JPG, PNG are allowed'), false);
  }
};

// Configure multer for diary uploads
export const uploadDiary = multer({
  storage: diaryStorage,
  fileFilter: diaryFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// ============================================
// CLOUDINARY STORAGE FOR REPORT IMAGES
// ============================================

// Configure Cloudinary Storage for Report Images
const reportImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'apnaschool/reports',
    allowed_formats: ['jpg', 'jpeg', 'png'], // Only JPG and PNG
    transformation: [
      {
        width: 1920,
        height: 1080,
        crop: 'limit', // Don't upscale, only downscale if needed
        quality: 'auto:good' // Auto quality optimization
      }
    ],
  },
});

// File filter for report images - Only JPG/PNG, max 300KB
const reportImageFileFilter = (req, file, cb) => {
  console.log('=== REPORT IMAGE UPLOAD VALIDATION ===');
  console.log('File mimetype:', file.mimetype);
  console.log('File size:', file.size, 'bytes');
  console.log('File size KB:', (file.size / 1024).toFixed(2), 'KB');

  // Check file type - Only JPG and PNG
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];

  if (!allowedTypes.includes(file.mimetype)) {
    console.log('❌ File type rejected:', file.mimetype);
    return cb(new Error('Only JPG and PNG images are allowed for reports'), false);
  }

  // Check file size - Max 300KB (300 * 1024 bytes)
  const maxSize = 300 * 1024; // 300KB in bytes
  if (file.size > maxSize) {
    const fileSizeKB = (file.size / 1024).toFixed(2);
    console.log(`❌ File size rejected: ${fileSizeKB}KB (max 300KB)`);
    return cb(new Error(`Image size must be less than 300KB. Current size: ${fileSizeKB}KB`), false);
  }

  console.log('✅ File validation passed');
  cb(null, true);
};

// Configure multer for report image uploads to Cloudinary
export const uploadReportImage = multer({
  storage: reportImageStorage,
  fileFilter: reportImageFileFilter,
  limits: {
    fileSize: 300 * 1024 // 300KB limit
  }
});
