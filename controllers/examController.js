import Book from '../models/Book.js';
import Chapter from '../models/Chapter.js';
import GeneratedExam from '../models/GeneratedExam.js';

function parseMCQs(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const mcqs = [];
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  let currentMCQ = null;

  for (const line of lines) {
    const questionMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (questionMatch) {
      if (currentMCQ) {
        mcqs.push(currentMCQ);
      }
      currentMCQ = {
        question: questionMatch[2],
        options: [],
        correctOption: ''
      };
    } else if (currentMCQ) {
      const optionMatch = line.match(/^([A-D])\)\s+(.*)/);
      if (optionMatch) {
        currentMCQ.options.push(optionMatch[2]);
      }
    }
  }

  if (currentMCQ) {
    mcqs.push(currentMCQ);
  }

  return mcqs;
}

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

// ── Books ─────────────────────────────────────────────────────────────────────

export const getBooks = async (req, res) => {
  try {
    const schoolId  = req.schoolId?.toString();
    const teacherId = req.staffDbId?.toString();
    const books = await Book.find({ schoolId, teacherId }).sort({ createdAt: -1 });

    const bookIds  = books.map(b => b._id);
    const chapters = await Chapter.find({ bookId: { $in: bookIds } }).select('bookId mcqs shortQuestions longQuestions');
    const stats    = {};
    chapters.forEach(c => {
      const id = c.bookId.toString();
      if (!stats[id]) stats[id] = { chapters: 0, mcqs: 0, short: 0, long: 0 };
      stats[id].chapters++;
      stats[id].mcqs  += c.mcqs.length;
      stats[id].short += c.shortQuestions.length;
      stats[id].long  += c.longQuestions.length;
    });

    const result = books.map(b => ({
      ...b.toObject(),
      chapterCount: stats[b._id.toString()]?.chapters || 0,
      mcqCount:     stats[b._id.toString()]?.mcqs     || 0,
      shortCount:   stats[b._id.toString()]?.short    || 0,
      longCount:    stats[b._id.toString()]?.long     || 0
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const createBook = async (req, res) => {
  try {
    const { title } = req.body;
    const schoolId  = req.schoolId?.toString();
    const teacherId = req.staffDbId?.toString();
    if (!title?.trim()) return res.status(400).json({ error: 'Book title is required' });
    const book = await Book.create({ title: title.trim(), schoolId, teacherId });
    return res.status(201).json(book);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const deleteBook = async (req, res) => {
  try {
    const { bookId } = req.params;
    const schoolId   = req.schoolId?.toString();
    const teacherId  = req.staffDbId?.toString();
    const book = await Book.findOne({ _id: bookId, schoolId, teacherId });
    if (!book) return res.status(404).json({ error: 'Book not found' });
    await Chapter.deleteMany({ bookId });
    await Book.findByIdAndDelete(bookId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Chapters ──────────────────────────────────────────────────────────────────

export const getChapters = async (req, res) => {
  try {
    const { bookId } = req.params;
    const schoolId   = req.schoolId?.toString();
    const teacherId  = req.staffDbId?.toString();
    const book = await Book.findOne({ _id: bookId, schoolId, teacherId });
    if (!book) return res.status(404).json({ error: 'Book not found' });

    const chapters = await Chapter.find({ bookId, schoolId }).sort({ createdAt: 1 });
    const result   = chapters.map(c => ({
      _id:        c._id,
      title:      c.title,
      mcqCount:   c.mcqs.length,
      shortCount: c.shortQuestions.length,
      longCount:  c.longQuestions.length,
      createdAt:  c.createdAt
    }));
    return res.json({ book, chapters: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const createChapter = async (req, res) => {
  try {
    const { bookId } = req.params;
    const { title }  = req.body;
    const schoolId   = req.schoolId?.toString();
    const teacherId  = req.staffDbId?.toString();
    const book = await Book.findOne({ _id: bookId, schoolId, teacherId });
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (!title?.trim()) return res.status(400).json({ error: 'Chapter title is required' });
    const chapter = await Chapter.create({ bookId, schoolId, teacherId, title: title.trim(), mcqs: [], shortQuestions: [], longQuestions: [] });
    return res.status(201).json({ ...chapter.toObject(), mcqCount: 0, shortCount: 0, longCount: 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getChapter = async (req, res) => {
  try {
    const { chapterId } = req.params;
    const schoolId      = req.schoolId?.toString();
    const chapter = await Chapter.findOne({ _id: chapterId, schoolId });
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    return res.json(chapter);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const updateChapter = async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { title, mcqs, shortQuestions, longQuestions } = req.body;
    const schoolId = req.schoolId?.toString();
    const teacherId = req.staffDbId?.toString();
    const chapter = await Chapter.findOne({ _id: chapterId, schoolId, teacherId });
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    if (title !== undefined) chapter.title = title.trim();
    if (mcqs !== undefined) {
      if (typeof mcqs === 'string') {
        chapter.mcqs = parseMCQs(mcqs);
      } else {
        chapter.mcqs = mcqs;
      }
    }
    if (shortQuestions !== undefined) chapter.shortQuestions = shortQuestions.map(q => q?.trim()).filter(Boolean);
    if (longQuestions !== undefined) chapter.longQuestions = longQuestions.map(q => q?.trim()).filter(Boolean);
    await chapter.save();
    return res.json(chapter);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const deleteChapter = async (req, res) => {
  try {
    const { chapterId } = req.params;
    const schoolId      = req.schoolId?.toString();
    const teacherId     = req.staffDbId?.toString();
    const chapter = await Chapter.findOneAndDelete({ _id: chapterId, schoolId, teacherId });
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Paper Generation ──────────────────────────────────────────────────────────

export const generatePaper = async (req, res) => {
  try {
    const {
      bookId, chapterIds, examTitle, className, subjectName, timeAllowed, totalMarks,
      // Manual selection mode
      selectedMcqs: manualMcqs,
      selectedShortQuestions: manualShort,
      selectedLongQuestions: manualLong,
      mcqMarks, shortMarks, longMarks,
      // Legacy random mode
      mcqCount, shortCount, longCount
    } = req.body;
    const teacherId = req.staffDbId?.toString();
    const schoolId  = req.schoolId?.toString();

    if (!bookId || !examTitle?.trim()) return res.status(400).json({ error: 'bookId and examTitle are required' });
    if (!Array.isArray(chapterIds) || !chapterIds.length) return res.status(400).json({ error: 'Select at least one chapter' });

    const mcqMarks_   = parseInt(mcqMarks)   || 1;
    const shortMarks_ = parseInt(shortMarks) || 3;
    const longMarks_  = parseInt(longMarks)  || 5;

    let finalMcqs, finalShort, finalLong;
    let mode = 'random';

    // Manual selection: use the questions the teacher explicitly chose
    if (manualMcqs !== undefined || manualShort !== undefined || manualLong !== undefined) {
      mode       = 'manual';
      finalMcqs  = Array.isArray(manualMcqs)  ? manualMcqs  : [];
      finalShort = Array.isArray(manualShort) ? manualShort : [];
      finalLong  = Array.isArray(manualLong)  ? manualLong  : [];
    } else {
      // Legacy: pick randomly from chapters by count
      const mcqs_  = parseInt(mcqCount)   || 0;
      const short_ = parseInt(shortCount) || 0;
      const long_  = parseInt(longCount)  || 0;

      const chapters = await Chapter.find({ _id: { $in: chapterIds }, bookId, schoolId });
      if (!chapters.length) return res.status(404).json({ error: 'No chapters found for this book' });

      finalMcqs  = pickRandom(chapters.flatMap(c => c.mcqs),            mcqs_);
      finalShort = pickRandom(chapters.flatMap(c => c.shortQuestions), short_);
      finalLong  = pickRandom(chapters.flatMap(c => c.longQuestions),  long_);
    }

    const calcTotalMarks = parseInt(totalMarks) ||
      (finalMcqs.length * mcqMarks_ + finalShort.length * shortMarks_ + finalLong.length * longMarks_);

    const exam = await GeneratedExam.create({
      teacherId, schoolId, bookId, chapterIds,
      examTitle:     examTitle.trim(),
      className:     className   || '',
      subjectName:   subjectName || '',
      timeAllowed:   timeAllowed || '1 Hour',
      totalMarks:    calcTotalMarks,
      selectionMode: mode,
      mcqMarks:      mcqMarks_,
      shortMarks:    shortMarks_,
      longMarks:     longMarks_,
      mcqs:           finalMcqs,
      shortQuestions: finalShort,
      longQuestions:  finalLong
    });

    return res.json({
      success: true,
      examId:        exam._id,
      examTitle:     exam.examTitle,
      className:     exam.className,
      subjectName:   exam.subjectName,
      timeAllowed:   exam.timeAllowed,
      totalMarks:    exam.totalMarks,
      selectionMode: exam.selectionMode,
      mcqMarks:      exam.mcqMarks,
      shortMarks:    exam.shortMarks,
      longMarks:     exam.longMarks,
      mcqs:           finalMcqs,
      shortQuestions: finalShort,
      longQuestions:  finalLong
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const regeneratePaper = async (req, res) => {
  try {
    const { examId } = req.params;
    const teacherId  = req.staffDbId?.toString();
    const schoolId   = req.schoolId?.toString();

    const exam = await GeneratedExam.findOne({ _id: examId, teacherId, schoolId });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const chapters = await Chapter.find({ _id: { $in: exam.chapterIds || [] }, bookId: exam.bookId, schoolId });

    let allMcqs, allShort, allLong;
    if (chapters.length) {
      allMcqs  = chapters.flatMap(c => c.mcqs);
      allShort = chapters.flatMap(c => c.shortQuestions);
      allLong  = chapters.flatMap(c => c.longQuestions);
    } else {
      allMcqs  = exam.mcqs;
      allShort = exam.shortQuestions;
      allLong  = exam.longQuestions;
    }

    exam.mcqs           = pickRandom(allMcqs,  exam.mcqs.length);
    exam.shortQuestions = pickRandom(allShort, exam.shortQuestions.length);
    exam.longQuestions  = pickRandom(allLong,  exam.longQuestions.length);
    await exam.save();

    return res.json({
      success: true,
      examId:      exam._id,
      examTitle:   exam.examTitle,
      className:   exam.className,
      subjectName: exam.subjectName,
      timeAllowed: exam.timeAllowed,
      totalMarks:  exam.totalMarks,
      selectionMode: exam.selectionMode || 'random',
      mcqMarks:    exam.mcqMarks   || 1,
      shortMarks:  exam.shortMarks || 3,
      longMarks:   exam.longMarks  || 5,
      mcqs:           exam.mcqs,
      shortQuestions: exam.shortQuestions,
      longQuestions:  exam.longQuestions
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── History ───────────────────────────────────────────────────────────────────

export const getExamHistory = async (req, res) => {
  try {
    const teacherId = req.staffDbId?.toString();
    const schoolId  = req.schoolId?.toString();
    const exams = await GeneratedExam.find({ teacherId, schoolId })
      .sort({ createdAt: -1 })
      .select('_id examTitle className subjectName totalMarks timeAllowed createdAt mcqs shortQuestions longQuestions mcqMarks shortMarks longMarks selectionMode');
    return res.json(exams);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getExamById = async (req, res) => {
  try {
    const { examId } = req.params;
    const teacherId  = req.staffDbId?.toString();
    const schoolId   = req.schoolId?.toString();
    const exam = await GeneratedExam.findOne({ _id: examId, teacherId, schoolId });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    return res.json(exam);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const deleteExam = async (req, res) => {
  try {
    const { examId } = req.params;
    const teacherId  = req.staffDbId?.toString();
    const schoolId   = req.schoolId?.toString();
    await GeneratedExam.findOneAndDelete({ _id: examId, teacherId, schoolId });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
