import express from 'express';
import mongoose from 'mongoose';
import upload from '../middleware/upload.js';
import { protectStaff } from '../middleware/staffAuthMiddleware.js';
import Book from '../models/Book.js';
import BookPage from '../models/BookPage.js';
import parseBook from '../jobs/parseBook.js';

const router = express.Router();

router.post('/upload', protectStaff, upload.single('file'), async (req, res) => {
  try {
    const { subjectId, classId } = req.body;

    // Use JWT-extracted values — guaranteed to be correct
    const schoolId = req.schoolId || req.body.schoolId;
    const uploadedBy = req.staffDbId?.toString() || req.body.uploadedBy;

    if (!subjectId || !classId) {
      return res.status(400).json({ error: 'Please select a Class and Subject' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded or file type not allowed (PDF only)' });
    }

    // Stream buffer to GridFS using the live mongoose connection
    const { GridFSBucket } = await import('mongodb');
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'books' });

    const filename = `${Date.now()}-${req.file.originalname}`;
    const uploadStream = bucket.openUploadStream(filename, {
      metadata: { schoolId, subjectId, classId, uploadedBy }
    });

    // Write buffer to GridFS
    await new Promise((resolve, reject) => {
      uploadStream.end(req.file.buffer, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const gridFsId = uploadStream.id;

    const newBook = new Book({
      schoolId,
      subjectId,
      classId,
      fileName: req.file.originalname,
      gridFsId,
      uploadedBy: uploadedBy || 'unknown',
      status: 'processing'
    });

    await newBook.save();

    parseBook(newBook._id);

    return res.json({
      success: true,
      bookId: newBook._id,
      message: 'Book uploaded successfully'
    });

  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});


router.get('/', async (req, res) => {
  try {
    const { subjectId, classId } = req.query;

    if (!subjectId || !classId) {
      return res.status(400).json({ error: 'subjectId and classId are required' });
    }

    const books = await Book.find({ subjectId, classId })
      .sort({ uploadedAt: -1 })
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

    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    if (book.status === 'processing') {
      return res.status(202).json({ error: 'Book is still being parsed, please wait' });
    }

    const pageCount = await BookPage.countDocuments({ bookId });
    const parsedPageNo = parseInt(pageNo, 10);

    const page = await BookPage.findOne({ bookId, pageNo: parsedPageNo });
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    return res.json({
      pageNo: page.pageNo,
      pageText: page.pageText,
      totalPages: pageCount
    });

  } catch (error) {
    console.error('Fetch Page Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

router.get('/:bookId/pages', async (req, res) => {
  try {
    const { bookId } = req.params;

    const pageCount = await BookPage.countDocuments({ bookId });
    return res.json({
      totalPages: pageCount,
      bookId
    });
  } catch (error) {
    console.error('Fetch Total Pages Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

router.get('/:bookId/view', protectStaff, async (req, res) => {
  try {
    const { bookId } = req.params;
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ error: 'Book not found' });

    const { GridFSBucket } = await import('mongodb');
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'books' });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${book.fileName}"`,
      'Cache-Control': 'public, max-age=3600'
    });

    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(book.gridFsId));
    downloadStream.pipe(res);

    downloadStream.on('error', (err) => {
      console.error('View PDF Stream Error:', err);
      res.status(500).end();
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:bookId/retry', protectStaff, async (req, res) => {
  try {
    const { bookId } = req.params;
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ error: 'Book not found' });

    // Update status to processing
    book.status = 'processing';
    await book.save();

    // Trigger parsing job asynchronously
    import('../jobs/parseBook.js').then(m => m.default(book._id));

    res.json({ success: true, message: 'Parsing retried' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:bookId', protectStaff, async (req, res) => {
  try {
    const { bookId } = req.params;

    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // 1. Delete file from GridFS
    try {
      const { GridFSBucket } = await import('mongodb');
      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db, { bucketName: 'books' });
      await bucket.delete(book.gridFsId);
    } catch (gridErr) {
      // Log but don't block — file may already be missing
      console.warn(`⚠ Could not delete GridFS file for book ${bookId}:`, gridErr.message);
    }

    // 2. Delete all parsed pages for this book
    await BookPage.deleteMany({ bookId });

    // 3. Delete the book record
    await Book.findByIdAndDelete(bookId);

    return res.json({ success: true, message: 'Book deleted successfully' });

  } catch (error) {
    console.error('Delete Book Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

export default router;
