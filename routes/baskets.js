import express from 'express';
import { protectStaff } from '../middleware/staffAuthMiddleware.js';
import { tenantModel } from '../utils/tenantModel.js';
import QuestionBasketModel from '../models/QuestionBasket.js';
import QuestionModel       from '../models/Question.js';

const router = express.Router();

router.use(protectStaff);

router.post('/', async (req, res) => {
  try {
    const { teacherId, subjectId, classId, examTitle, totalMarks, timeAllowed, questions } = req.body;
    const schoolId = req.schoolId?.toString();

    if (!teacherId || !subjectId || !classId || !examTitle || !totalMarks || !timeAllowed) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const QuestionBasket = await tenantModel(schoolId, QuestionBasketModel);
    const Question       = await tenantModel(schoolId, QuestionModel);

    const basket = await QuestionBasket.create({ teacherId, subjectId, classId, examTitle, totalMarks, timeAllowed });

    if (questions && Array.isArray(questions)) {
      await Question.insertMany(questions.map(q => ({ ...q, basketId: basket._id })));
    }

    return res.json({ success: true, basketId: basket._id.toString() });
  } catch (error) {
    console.error('Create Basket Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { teacherId } = req.query;
    const schoolId = req.schoolId?.toString();
    if (!teacherId) return res.status(400).json({ error: 'teacherId is required' });

    const QuestionBasket = await tenantModel(schoolId, QuestionBasketModel);
    const Question       = await tenantModel(schoolId, QuestionModel);

    const baskets = await QuestionBasket.find({ teacherId }).sort({ createdAt: -1 }).lean();
    for (const basket of baskets) {
      basket.questions = await Question.find({ basketId: basket._id }).lean();
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
    const schoolId = req.schoolId?.toString();

    const QuestionBasket = await tenantModel(schoolId, QuestionBasketModel);
    const Question       = await tenantModel(schoolId, QuestionModel);

    const basket = await QuestionBasket.findById(id);
    if (!basket) return res.status(404).json({ error: 'Basket not found' });

    if (examTitle   !== undefined) basket.examTitle   = examTitle;
    if (totalMarks  !== undefined) basket.totalMarks  = totalMarks;
    if (timeAllowed !== undefined) basket.timeAllowed = timeAllowed;
    await basket.save();

    if (questions && Array.isArray(questions)) {
      await Question.deleteMany({ basketId: id });
      await Question.insertMany(questions.map(q => ({ ...q, basketId: id })));
    }

    return res.json({ success: true, message: 'Basket updated' });
  } catch (error) {
    console.error('Update Basket Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = req.schoolId?.toString();

    const QuestionBasket = await tenantModel(schoolId, QuestionBasketModel);
    const Question       = await tenantModel(schoolId, QuestionModel);

    const basket = await QuestionBasket.findById(id).lean();
    if (!basket) return res.status(404).json({ error: 'Basket not found' });

    const questions = await Question.find({ basketId: id }).lean();
    basket.questions = questions.map(q => ({
      _id: q._id, type: q.type, pageNo: q.pageNo,
      questionText: q.questionText, options: q.options, correctAnswer: q.correctAnswer, marks: q.marks
    }));

    return res.json(basket);
  } catch (error) {
    console.error('Fetch Basket Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default router;
