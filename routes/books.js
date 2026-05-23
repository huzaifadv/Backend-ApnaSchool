import express from 'express';
import { protectStaff } from '../middleware/staffAuthMiddleware.js';
import upload from '../middleware/upload.js';
import { tenantModel } from '../utils/tenantModel.js';
import { getTenantConnection } from '../config/tenantDB.js';
import BookModel    from '../models/Book.js';
import BookPageModel from '../models/BookPage.js';
import parseBook     from '../jobs/parseBook.js';
import parseDriveBook from '../jobs/parseDriveBook.js';

const router = express.Router();

// All book routes require staff auth so we always have req.schoolId
router.use(protectStaff);

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { subjectId, classId, title } = req.body;
    const schoolId   = req.schoolId?.toString();
    const uploadedBy = req.staffDbId?.toString() || req.body.uploadedBy;

    if (!subjectId || !classId) return res.status(400).json({ error: 'Please select a Class and Subject' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded or file type not allowed (PDF only)' });

    const { GridFSBucket } = await import('mongodb');
    const connection = await getTenantConnection(schoolId);
    const db = connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'books' });

    const filename = `${Date.now()}-${req.file.originalname}`;
    const uploadStream = bucket.openUploadStream(filename, {
      metadata: { schoolId, subjectId, classId, uploadedBy }
    });

    await new Promise((resolve, reject) => {
      uploadStream.end(req.file.buffer, (err) => { if (err) return reject(err); resolve(); });
    });

    const Book = await tenantModel(schoolId, BookModel);
    const newBook = await Book.create({
      schoolId, subjectId, classId,
      title: title || '',
      fileName: req.file.originalname,
      gridFsId: uploadStream.id,
      uploadedBy: uploadedBy || 'unknown',
      status: 'processing'
    });

    parseBook(newBook._id, schoolId);

    return res.json({ success: true, bookId: newBook._id, message: 'Book uploaded successfully' });
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

router.post('/upload-link', async (req, res) => {
  try {
    const { title, subjectId, classId, driveLink } = req.body;
    const schoolId   = req.schoolId?.toString();
    const uploadedBy = req.staffDbId?.toString() || 'unknown';

    if (!title || !subjectId || !classId || !driveLink) {
      return res.status(400).json({ error: 'title, subjectId, classId and driveLink are required' });
    }

    const idMatch  = driveLink.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    const idMatch2 = driveLink.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    const driveFileId = idMatch?.[1] || idMatch2?.[1];
    if (!driveFileId) {
      return res.status(400).json({ error: 'Invalid Google Drive link. Please use the "Share" link (e.g. https://drive.google.com/file/d/ID/view)' });
    }

    const Book = await tenantModel(schoolId, BookModel);
    const newBook = await Book.create({
      schoolId, subjectId, classId, title, uploadedBy,
      fileName: title, driveLink, driveFileId, source: 'drive', status: 'processing'
    });

    parseDriveBook(newBook._id, driveFileId, schoolId);

    return res.json({ success: true, bookId: newBook._id, message: 'Book link added. Processing will complete shortly (1-2 minutes).' });
  } catch (error) {
    console.error('Drive Upload Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { subjectId, classId } = req.query;
    const schoolId = req.schoolId?.toString();
    if (!subjectId || !classId) return res.status(400).json({ error: 'subjectId and classId are required' });

    const Book = await tenantModel(schoolId, BookModel);
    const books = await Book.find({ subjectId, classId, schoolId })
      .sort({ createdAt: -1 })
      .select('_id fileName uploadedAt status subjectId classId');

    return res.json(books);
  } catch (error) {
    console.error('Fetch Books Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

router.get('/:bookId/pages/:pageNo', async (req, res) => {
  try {
    const { bookId, pageNo } = req.params;
    const schoolId = req.schoolId?.toString();

    const Book     = await tenantModel(schoolId, BookModel);
    const BookPage = await tenantModel(schoolId, BookPageModel);

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.status === 'processing') return res.status(202).json({ error: 'Book is still being parsed, please wait' });

    const pageCount = await BookPage.countDocuments({ bookId });
    const page = await BookPage.findOne({ bookId, pageNo: parseInt(pageNo, 10) });
    if (!page) return res.status(404).json({ error: 'Page not found' });

    return res.json({ pageNo: page.pageNo, pageText: page.pageText, totalPages: pageCount });
  } catch (error) {
    console.error('Fetch Page Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

router.get('/:bookId/pages', async (req, res) => {
  try {
    const { bookId }  = req.params;
    const schoolId    = req.schoolId?.toString();
    const BookPage    = await tenantModel(schoolId, BookPageModel);
    const pageCount   = await BookPage.countDocuments({ bookId });
    return res.json({ totalPages: pageCount, bookId });
  } catch (error) {
    console.error('Fetch Total Pages Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

router.get('/:bookId/view', async (req, res) => {
  try {
    const { bookId } = req.params;
    const schoolId   = req.schoolId?.toString();

    const Book = await tenantModel(schoolId, BookModel);
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ error: 'Book not found' });

    const { GridFSBucket } = await import('mongodb');
    const { Types } = await import('mongoose');
    const connection = await getTenantConnection(schoolId);
    const db = connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'books' });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${book.fileName}"`,
      'Cache-Control': 'public, max-age=3600'
    });

    const downloadStream = bucket.openDownloadStream(new Types.ObjectId(book.gridFsId));
    downloadStream.pipe(res);
    downloadStream.on('error', () => res.status(500).end());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:bookId/retry', async (req, res) => {
  try {
    const { bookId } = req.params;
    const schoolId   = req.schoolId?.toString();
    const Book = await tenantModel(schoolId, BookModel);
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    book.status = 'processing';
    await book.save();
    parseBook(book._id, schoolId);
    res.json({ success: true, message: 'Parsing retried' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    const schoolId   = req.schoolId?.toString();

    const Book     = await tenantModel(schoolId, BookModel);
    const BookPage = await tenantModel(schoolId, BookPageModel);
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ error: 'Book not found' });

    try {
      const { GridFSBucket } = await import('mongodb');
      const connection = await getTenantConnection(schoolId);
      const bucket = new GridFSBucket(connection.db, { bucketName: 'books' });
      await bucket.delete(book.gridFsId);
    } catch (gridErr) {
      console.warn(`⚠ Could not delete GridFS file for book ${bookId}:`, gridErr.message);
    }

    await BookPage.deleteMany({ bookId });
    await Book.findByIdAndDelete(bookId);

    return res.json({ success: true, message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Delete Book Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

export default router;
