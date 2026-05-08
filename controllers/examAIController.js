import mongoose from 'mongoose';
import axios from 'axios';
import Book from '../models/Book.js';
import BookPage from '../models/BookPage.js';
import QuestionBank from '../models/QuestionBank.js';
import DailyApiUsage from '../models/DailyApiUsage.js';
import GeneratedExam from '../models/GeneratedExam.js';

// ── Grok (xAI) API call ───────────────────────────────────────────────────────
async function callGrok(prompt) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey || apiKey.includes('ReplaceWith')) {
    throw new Error('GROK_API_KEY not set. Get a free key from console.x.ai and add it to backend/.env');
  }
  const response = await axios.post(
    'https://api.x.ai/v1/chat/completions',
    {
      model: 'grok-3-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 6000,
      temperature: 0.7
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 90000
    }
  );
  return response.data.choices[0].message.content;
}

const DAILY_LIMIT = 10;

const getTodayDate = () => new Date().toISOString().slice(0, 10);

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr, count) {
  return shuffleArray(arr).slice(0, Math.min(count, arr.length));
}

// GET /staff/exam/books
export const getMyBooks = async (req, res) => {
  try {
    const schoolId = req.schoolId;
    const books = await Book.find({ schoolId })
      .sort({ uploadedAt: -1 })
      .select('_id title fileName status subjectId classId uploadedAt');
    return res.json(books);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// DELETE /staff/exam/books/:bookId
export const deleteMyBook = async (req, res) => {
  try {
    const { bookId } = req.params;
    const schoolId = req.schoolId;

    const book = await Book.findOne({ _id: bookId, schoolId });
    if (!book) return res.status(404).json({ error: 'Book not found' });

    // Delete GridFS file only for file-upload books
    if (book.source !== 'drive' && book.gridFsId) {
      try {
        const { GridFSBucket } = await import('mongodb');
        const db = mongoose.connection.db;
        const bucket = new GridFSBucket(db, { bucketName: 'books' });
        await bucket.delete(book.gridFsId);
      } catch (e) {
        console.warn('GridFS delete warning:', e.message);
      }
    }

    await BookPage.deleteMany({ bookId });
    await QuestionBank.deleteOne({ bookId });
    await Book.findByIdAndDelete(bookId);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /staff/exam/usage
export const getApiUsage = async (req, res) => {
  try {
    const teacherId = req.staffDbId?.toString();
    const date = getTodayDate();
    const usage = await DailyApiUsage.findOne({ teacherId, date });
    return res.json({ used: usage?.count || 0, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - (usage?.count || 0) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// POST /staff/exam/generate
export const generatePaper = async (req, res) => {
  try {
    const { bookId, examTitle, className, subjectName, timeAllowed, totalMarks, mcqCount, shortCount, longCount } = req.body;

    const teacherId = req.staffDbId?.toString();
    const schoolId = req.schoolId;

    if (!bookId || !examTitle) return res.status(400).json({ error: 'bookId and examTitle are required' });

    const book = await Book.findOne({ _id: bookId, schoolId });
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.status !== 'parsed') return res.status(400).json({ error: 'Book is still being processed. Please wait.' });

    const mcqs_ = parseInt(mcqCount) || 5;
    const short_ = parseInt(shortCount) || 3;
    const long_  = parseInt(longCount)  || 2;

    // Check existing question bank
    let bank = await QuestionBank.findOne({ bookId });

    if (!bank || bank.mcqs.length < mcqs_ || bank.shortQuestions.length < short_ || bank.longQuestions.length < long_) {
      // Need to call Grok API
      const date = getTodayDate();
      let usageDoc = await DailyApiUsage.findOne({ teacherId, date });
      const used = usageDoc?.count || 0;
      if (used >= DAILY_LIMIT) {
        return res.status(429).json({ error: `Daily limit of ${DAILY_LIMIT} AI calls reached. Try again tomorrow or regenerate from existing bank.`, limitReached: true });
      }

      // Build book text from BookPages
      const pages = await BookPage.find({ bookId }).sort({ pageNo: 1 }).limit(50).select('pageText');

      if (pages.length === 0) {
        return res.status(400).json({ error: 'No pages found for this book. It may still be processing — please wait and try again.' });
      }

      const realPages = pages.filter(p =>
        p.pageText &&
        !p.pageText.startsWith('[SCANNED_PDF]') &&
        !p.pageText.startsWith('[Page') &&
        p.pageText.replace(/\s+/g, '').length > 20
      );

      if (realPages.length === 0) {
        return res.status(400).json({
          error: 'This book is a scanned PDF. Grok cannot read scanned images. Please upload a text-based PDF (download from PCTB website: ptbb.punjab.gov.pk).',
          isScanned: true
        });
      }

      const bookText = realPages.map(p => p.pageText).join('\n\n').substring(0, 14000);

      const prompt = `You are an educational exam paper generator for Pakistani school students.

Generate exam questions based on the following textbook content:
- ${mcqs_ * 3} MCQ questions (4 options A/B/C/D, mark the correct answer)
- ${short_ * 3} short questions (requiring 2-3 sentence answers)
- ${long_ * 3} long questions (requiring detailed paragraph answers)

Generate MORE questions than needed so we can build a question bank for later use.

Textbook Content:
${bookText}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation, no extra text):
{"mcqs":[{"question":"...","options":{"A":"...","B":"...","C":"...","D":"..."},"correct":"A"}],"shortQuestions":["..."],"longQuestions":["..."]}`;

      let aiResult;
      try {
        const rawText = await callGrok(prompt);
        const jsonText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        aiResult = JSON.parse(jsonText);
      } catch (aiErr) {
        console.error('Grok AI Error:', aiErr);
        const msg = aiErr.response?.data?.error?.message || aiErr.message || '';
        if (msg.includes('401') || aiErr.response?.status === 401) {
          return res.status(401).json({ error: 'Invalid Grok API key. Get a free key from console.x.ai and set GROK_API_KEY in backend/.env', apiKeyInvalid: true });
        }
        if (msg.includes('429') || aiErr.response?.status === 429) {
          return res.status(429).json({ error: 'Grok rate limit hit. Please wait a moment and try again.', limitReached: true });
        }
        return res.status(500).json({ error: 'AI generation failed: ' + (msg || aiErr.message) });
      }

      // Save/update question bank
      bank = await QuestionBank.findOneAndUpdate(
        { bookId },
        {
          bookId,
          schoolId,
          teacherId,
          mcqs: Array.isArray(aiResult.mcqs) ? aiResult.mcqs : [],
          shortQuestions: Array.isArray(aiResult.shortQuestions) ? aiResult.shortQuestions : [],
          longQuestions: Array.isArray(aiResult.longQuestions) ? aiResult.longQuestions : [],
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      // Increment daily usage
      await DailyApiUsage.findOneAndUpdate(
        { teacherId, date },
        { $inc: { count: 1 }, $setOnInsert: { schoolId } },
        { upsert: true }
      );
    }

    // Pick questions from bank
    const selectedMcqs   = pickRandom(bank.mcqs, mcqs_);
    const selectedShort  = pickRandom(bank.shortQuestions, short_);
    const selectedLong   = pickRandom(bank.longQuestions, long_);

    // Calculate total marks if not provided
    const calcTotalMarks = totalMarks || (mcqs_ * 1 + short_ * 3 + long_ * 5);

    // Save generated exam to history
    const exam = await GeneratedExam.create({
      teacherId,
      schoolId,
      bookId,
      examTitle,
      className: className || '',
      subjectName: subjectName || '',
      timeAllowed: timeAllowed || '1 Hour',
      totalMarks: calcTotalMarks,
      mcqs: selectedMcqs,
      shortQuestions: selectedShort,
      longQuestions: selectedLong
    });

    return res.json({
      success: true,
      examId: exam._id,
      examTitle,
      className,
      subjectName,
      timeAllowed: timeAllowed || '1 Hour',
      totalMarks: calcTotalMarks,
      mcqs: selectedMcqs,
      shortQuestions: selectedShort,
      longQuestions: selectedLong
    });
  } catch (err) {
    console.error('generatePaper error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// POST /staff/exam/regenerate/:examId
export const regeneratePaper = async (req, res) => {
  try {
    const { examId } = req.params;
    const teacherId = req.staffDbId?.toString();
    const schoolId = req.schoolId;

    const exam = await GeneratedExam.findOne({ _id: examId, teacherId, schoolId });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const bank = await QuestionBank.findOne({ bookId: exam.bookId });
    if (!bank) return res.status(404).json({ error: 'Question bank not found. Please generate the paper first.' });

    const mcqCount = exam.mcqs.length;
    const shortCount = exam.shortQuestions.length;
    const longCount = exam.longQuestions.length;

    const newMcqs  = pickRandom(bank.mcqs, mcqCount);
    const newShort = pickRandom(bank.shortQuestions, shortCount);
    const newLong  = pickRandom(bank.longQuestions, longCount);

    exam.mcqs = newMcqs;
    exam.shortQuestions = newShort;
    exam.longQuestions = newLong;
    await exam.save();

    return res.json({
      success: true,
      examId: exam._id,
      examTitle: exam.examTitle,
      className: exam.className,
      subjectName: exam.subjectName,
      timeAllowed: exam.timeAllowed,
      totalMarks: exam.totalMarks,
      mcqs: newMcqs,
      shortQuestions: newShort,
      longQuestions: newLong
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /staff/exam/history
export const getExamHistory = async (req, res) => {
  try {
    const teacherId = req.staffDbId?.toString();
    const schoolId = req.schoolId;
    const exams = await GeneratedExam.find({ teacherId, schoolId })
      .sort({ createdAt: -1 })
      .select('_id examTitle className subjectName totalMarks timeAllowed createdAt mcqs shortQuestions longQuestions');
    return res.json(exams);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /staff/exam/history/:examId
export const getExamById = async (req, res) => {
  try {
    const { examId } = req.params;
    const teacherId = req.staffDbId?.toString();
    const schoolId = req.schoolId;
    const exam = await GeneratedExam.findOne({ _id: examId, teacherId, schoolId });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    return res.json(exam);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// DELETE /staff/exam/history/:examId
export const deleteExam = async (req, res) => {
  try {
    const { examId } = req.params;
    const teacherId = req.staffDbId?.toString();
    const schoolId = req.schoolId;
    await GeneratedExam.findOneAndDelete({ _id: examId, teacherId, schoolId });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
