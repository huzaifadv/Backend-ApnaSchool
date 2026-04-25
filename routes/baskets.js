import express from 'express';
import QuestionBasket from '../models/QuestionBasket.js';
import Question from '../models/Question.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { teacherId, subjectId, classId, examTitle, totalMarks, timeAllowed, questions } = req.body;

    if (!teacherId || !subjectId || !classId || !examTitle || !totalMarks || !timeAllowed) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const basket = new QuestionBasket({
      teacherId,
      subjectId,
      classId,
      examTitle,
      totalMarks,
      timeAllowed
    });

    await basket.save();

    if (questions && Array.isArray(questions)) {
      const qns = questions.map(q => ({
        ...q,
        basketId: basket._id
      }));
      await Question.insertMany(qns);
    }

    return res.json({
      success: true,
      basketId: basket._id.toString()
    });

  } catch (error) {
    console.error('Create Basket Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { teacherId } = req.query;
    if (!teacherId) {
      return res.status(400).json({ error: 'teacherId is required' });
    }

    const baskets = await QuestionBasket.find({ teacherId }).sort({ createdAt: -1 }).lean();
    
    for (let basket of baskets) {
      const questions = await Question.find({ basketId: basket._id }).lean();
      basket.questions = questions;
    }

    return res.json(baskets);
  } catch (error) {
    console.error('Fetch Baskets Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { examTitle, totalMarks, timeAllowed, questions } = req.body;

    const basket = await QuestionBasket.findById(id);
    if (!basket) {
      return res.status(404).json({ error: 'Basket not found' });
    }

    if (examTitle !== undefined) basket.examTitle = examTitle;
    if (totalMarks !== undefined) basket.totalMarks = totalMarks;
    if (timeAllowed !== undefined) basket.timeAllowed = timeAllowed;

    await basket.save();

    if (questions && Array.isArray(questions)) {
      await Question.deleteMany({ basketId: id });
      const qns = questions.map(q => ({
        ...q,
        basketId: id
      }));
      await Question.insertMany(qns);
    }

    return res.json({
      success: true,
      message: 'Basket updated'
    });

  } catch (error) {
    console.error('Update Basket Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const basket = await QuestionBasket.findById(id).lean();
    if (!basket) {
      return res.status(404).json({ error: 'Basket not found' });
    }

    const questions = await Question.find({ basketId: id }).lean();
    basket.questions = questions.map(q => ({
      _id: q._id,
      type: q.type,
      pageNo: q.pageNo,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      marks: q.marks
    }));

    return res.json(basket);

  } catch (error) {
    console.error('Fetch Basket Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default router;
