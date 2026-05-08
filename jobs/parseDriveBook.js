import axios from 'axios';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import Book from '../models/Book.js';
import BookPage from '../models/BookPage.js';

/**
 * Download a Google Drive file and extract text into BookPages.
 * Handles Google's virus-scan confirmation page for large files.
 * Runs fully async — caller does not await this.
 */

async function downloadGoogleDriveFile(fileId) {
  const baseUrl = 'https://drive.usercontent.google.com/download';
  const axiosOpts = {
    responseType: 'arraybuffer',
    timeout: 300000, // 5 minute timeout for large books
    maxRedirects: 15,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
      'Accept': 'application/pdf,*/*'
    }
  };

  // First attempt — confirm=t usually bypasses virus scan for public files
  let response = await axios.get(`${baseUrl}?id=${fileId}&export=download&confirm=t`, axiosOpts);
  let buffer = Buffer.from(response.data);

  // Check if Google returned a confirmation HTML page instead of the PDF
  const headerStr = buffer.toString('utf8', 0, 100).toLowerCase();
  const isHtml = headerStr.includes('<!doc') || headerStr.includes('<html') || headerStr.startsWith('﻿<');

  if (isHtml) {
    const html = buffer.toString('utf8');

    // Extract hidden form fields Google uses for large-file confirmation
    const uuidMatch = html.match(/name=["']uuid["']\s+value=["']([^"']+)["']/i);
    const atMatch   = html.match(/name=["']at["']\s+value=["']([^"']+)["']/i);
    const cfMatch   = html.match(/confirm=([0-9A-Za-z_-]+)/);

    if (uuidMatch || atMatch || cfMatch) {
      let url = `${baseUrl}?id=${fileId}&export=download&confirm=t`;
      if (uuidMatch) url += `&uuid=${uuidMatch[1]}`;
      if (atMatch)   url += `&at=${atMatch[1]}`;
      if (cfMatch && !uuidMatch && !atMatch) url = `${baseUrl}?id=${fileId}&export=download&confirm=${cfMatch[1]}`;

      response = await axios.get(url, axiosOpts);
      buffer = Buffer.from(response.data);

      const recheck = buffer.toString('utf8', 0, 100).toLowerCase();
      if (recheck.includes('<!doc') || recheck.includes('<html')) {
        throw new Error('Google Drive requires you to sign in or the file is not publicly shared. Make sure "Anyone with the link" is selected in Share settings.');
      }
    } else {
      // Try legacy export URL as last resort
      const legacyUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      response = await axios.get(legacyUrl, axiosOpts);
      buffer = Buffer.from(response.data);

      const recheck = buffer.toString('utf8', 0, 100).toLowerCase();
      if (recheck.includes('<!doc') || recheck.includes('<html')) {
        throw new Error('Could not download file. Make sure the Google Drive file is set to "Anyone with the link can view".');
      }
    }
  }

  // Sanity check — must start with %PDF
  const pdfHeader = buffer.toString('ascii', 0, 5);
  if (!pdfHeader.startsWith('%PDF')) {
    throw new Error(`Downloaded file is not a valid PDF (got: "${pdfHeader}"). Check that the Drive link points to a PDF file.`);
  }

  return buffer;
}

const parseDriveBook = async (bookId, fileId) => {
  console.log(`[DriveParser] Starting job for book: ${bookId}, fileId: ${fileId}`);

  let buffer;
  try {
    buffer = await downloadGoogleDriveFile(fileId);
    console.log(`[DriveParser] Downloaded ${buffer.length} bytes for book ${bookId}`);
  } catch (downloadErr) {
    console.error(`[DriveParser] Download failed for book ${bookId}:`, downloadErr.message);
    await Book.findByIdAndUpdate(bookId, {
      status: 'error',
      errorMessage: downloadErr.message
    });
    return;
  }

  try {
    let result;
    let isScanned = false;

    try {
      result = await pdf(buffer);
    } catch (parseErr) {
      console.warn(`[DriveParser] PDF parse warning for book ${bookId}:`, parseErr.message);
      const pdfString = buffer.toString('ascii', 0, Math.min(buffer.length, 1000000));
      const pageMatches = pdfString.match(/\/Type\s*\/Page\b/g);
      const estimatedPages = pageMatches ? pageMatches.length : 1;
      result = { text: '', numpages: estimatedPages };
      isScanned = true;
    }

    const fullText = (result.text || '').trim();
    const numPages = result.numpages || 1;

    // Detect scanned PDF: text is empty or contains only whitespace/control chars
    const meaningfulChars = fullText.replace(/[\s\n\r\t\f]+/g, '');
    if (meaningfulChars.length < 50) {
      isScanned = true;
    }

    // Clear any existing pages
    await BookPage.deleteMany({ bookId });

    const book = await Book.findById(bookId);

    if (isScanned || meaningfulChars.length < 50) {
      // Scanned PDF — save a single informational page so the record isn't empty
      await new BookPage({
        bookId,
        pageNo: 1,
        pageText: `[SCANNED_PDF] This book contains ${numPages} pages of scanned images. Text-based questions cannot be auto-generated. To use AI generation, please use a text-based PDF (e.g. downloaded from the Punjab Curriculum & Textbook Board website).`,
        subjectId: book.subjectId,
        schoolId: book.schoolId
      }).save();

      await Book.findByIdAndUpdate(bookId, {
        status: 'parsed',
        errorMessage: 'scanned_pdf'
      });
      console.log(`[DriveParser] Book ${bookId} is scanned — marked accordingly.`);
      return;
    }

    // Text-based PDF — split into pages
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
      if (pageText.length < 5) {
        pageText = `[Page ${i + 1}: image or blank page]`;
      }
      await new BookPage({
        bookId,
        pageNo: i + 1,
        pageText,
        subjectId: book.subjectId,
        schoolId: book.schoolId
      }).save();
    }

    await Book.findByIdAndUpdate(bookId, { status: 'parsed', errorMessage: '' });
    console.log(`✓ [DriveParser] Processed book ${bookId} — ${numPages} pages, ${meaningfulChars.length} chars.`);
  } catch (err) {
    console.error(`✗ [DriveParser] Parse failed for book ${bookId}:`, err.message);
    await Book.findByIdAndUpdate(bookId, {
      status: 'error',
      errorMessage: 'Parse failed: ' + err.message
    });
  }
};

export default parseDriveBook;
