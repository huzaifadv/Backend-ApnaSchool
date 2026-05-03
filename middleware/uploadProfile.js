import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base memory storage for Multer
const storage = multer.memoryStorage();

// File filter restricting to JPG/JPEG/PNG
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG and PNG images are allowed for profile pictures'), false);
  }
};

// Generic factory function for creating the multer middleware and sharp processor
const createUploadMiddleware = (folderName) => {
  const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 512000 } // 500KB size limit (512000 bytes)
  });

  const processImage = async (req, res, next) => {
    if (!req.file) return next();

    try {
      const folderPath = path.join(__dirname, `../uploads/${folderName}`);

      // Ensure the destination folder exists
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const prefix = folderName.substring(0, folderName.length - 1); // e.g. 'student' or 'staff'
      const filename = `${prefix}_${uniqueSuffix}.jpg`;
      const localFilePath = path.join(folderPath, filename);

      // Resize exactly to 500x500 using Sharp
      await sharp(req.file.buffer)
        .resize(500, 500, {
          fit: sharp.fit.cover,
          position: 'center'
        })
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toFile(localFilePath);

      // Attach the relative path mapped to the server URL structure
      req.file.path = `/uploads/${folderName}/${filename}`;
      next();
    } catch (error) {
      console.error(`Error processing image for ${folderName}:`, error);
      next(error);
    }
  };

  return { upload, processImage };
};

// Configuration for Students
export const studentUpload = createUploadMiddleware('students');

// Configuration for Staff
export const staffUpload = createUploadMiddleware('staff');

// Configuration for Admins
export const adminUpload = createUploadMiddleware('admin');

// Configuration for School Logos
export const schoolLogoUpload = createUploadMiddleware('school-logos');
