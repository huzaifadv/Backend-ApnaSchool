import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import BookModel from '../models/Book.js';
import BookPageModel from '../models/BookPage.js';
import { tenantModel } from '../utils/tenantModel.js';
import { getTenantConnection } from '../config/tenantDB.js';

const parseBook = async (bookId, schoolId) => {
  console.log(`[Parser] Starting job for book: ${bookId}`);
  try {
    const Book     = await tenantModel(schoolId, BookModel);
    const BookPage = await tenantModel(schoolId, BookPageModel);

    const book = await Book.findById(bookId);
    if (!book) {
      console.error(`[Parser] Error: Book ${bookId} not found in database.`);
      return;
    }

    const { GridFSBucket } = await import('mongodb');
    const connection = await getTenantConnection(schoolId);
    const db = connection.db;
    if (!db) throw new Error('Database object is not available');

    const bucket = new GridFSBucket(db, { bucketName: 'books' });

    console.log(`[Parser] Downloading file from GridFS: ${book.gridFsId}`);

    const { Types } = await import('mongoose');
    const downloadStream = bucket.openDownloadStream(new Types.ObjectId(book.gridFsId));

    const chunks = [];
    await new Promise((resolve, reject) => {
      downloadStream.on('data', chunk => chunks.push(chunk));
      downloadStream.on('end', resolve);
      downloadStream.on('error', (err) => {
        console.error('[Parser] Download Stream Error:', err);
        reject(err);
      });
    });

    const buffer = Buffer.concat(chunks);
    console.log(`[Parser] File downloaded. Size: ${buffer.length} bytes. Parsing...`);

    let result;

    try {
      result = await pdf(buffer);
    } catch (err) {
      console.warn(`[Parser] Stage 1 failed for book ${bookId}:`, err.message);

      const pdfString = buffer.toString('ascii', 0, Math.min(buffer.length, 1000000));
      const pageMatches = pdfString.match(/\/Type\s*\/Page\b/g);
      const estimatedPages = pageMatches ? pageMatches.length : 1;

      result = {
        text: `[Note: This PDF is either scanned or encrypted. Automated text extraction was limited.]`,
        numpages: estimatedPages
      };
    }

    const fullText = result.text || '';
    const numPages = result.numpages || 1;

    await BookPage.deleteMany({ bookId: book._id });

    let pages = fullText.split('\f');

    if (pages.length < numPages && fullText.length > 50) {
      const charsPerPage = Math.ceil(fullText.length / numPages);
      pages = [];
      for (let i = 0; i < numPages; i++) {
        pages.push(fullText.substring(i * charsPerPage, (i + 1) * charsPerPage));
      }
    }

    for (let i = 0; i < numPages; i++) {
      let pageText = (pages[i] || '').trim();

      if (!pageText || pageText.length < 5) {
        pageText = `[Page ${i + 1}: This page likely contains an image or scanned text. Please use the "View" button to see the content.]`;
      }

      const bookPage = new BookPage({
        bookId: book._id,
        pageNo: i + 1,
        pageText,
        subjectId: book.subjectId,
        schoolId: book.schoolId
      });
      await bookPage.save();
    }

    book.status = 'parsed';
    await book.save();
    console.log(`✓ [Parser] Successfully processed book ${bookId} with ${numPages} pages.`);

  } catch (err) {
    console.error(`✗ [Parser] Failed to parse book ${bookId}:`, err.message);
    try {
      const Book = await tenantModel(schoolId, BookModel);
      await Book.findByIdAndUpdate(bookId, { status: 'error' });
    } catch (updateErr) {
      console.error('[Parser] Failed to update book error status:', updateErr);
    }
  }
};

export default parseBook;
