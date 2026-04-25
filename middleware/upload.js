import multer from 'multer';

// Use disk storage — we'll stream to GridFS manually in the route handler
// This avoids ECONNRESET race conditions with GridFsStorage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || file.mimetype === 'application/octet-stream') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }
});

export default upload;
