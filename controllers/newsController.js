import News from '../models/News.js';

/**
 * @desc    Get all news (public - only published)
 * @route   GET /api/news
 * @access  Public
 */
export const getAllNews = async (req, res) => {
  try {
    const news = await News.find({ isPublished: true })
      .sort({ publishedAt: -1 })
      .select('title content slug publishedAt createdAt videoUrl');

    res.status(200).json({
      success: true,
      count: news.length,
      data: news,
    });
  } catch (error) {
    console.error('Get All News Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching news',
    });
  }
};

/**
 * @desc    Get single news by slug (public)
 * @route   GET /api/news/:slug
 * @access  Public
 */
export const getNewsBySlug = async (req, res) => {
  try {
    const news = await News.findOne({
      slug: req.params.slug,
      isPublished: true
    });

    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News not found',
      });
    }

    res.status(200).json({
      success: true,
      data: news,
    });
  } catch (error) {
    console.error('Get News By Slug Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching news',
    });
  }
};

/**
 * @desc    Get all news for super admin (including unpublished)
 * @route   GET /api/news/admin/all
 * @access  Private (Super Admin)
 */
export const getAllNewsAdmin = async (req, res) => {
  try {
    const news = await News.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      count: news.length,
      data: news,
    });
  } catch (error) {
    console.error('Get All News Admin Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching news',
    });
  }
};

/**
 * @desc    Create new news
 * @route   POST /api/news/admin/create
 * @access  Private (Super Admin)
 */
export const createNews = async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('📰 CREATE NEWS REQUEST RECEIVED');
    console.log('========================================');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Super Admin ID:', req.superAdmin?.id);
    console.log('========================================\n');

    const { title, content, videoUrl } = req.body;

    // Validation: Check title
    if (!title || !title.trim()) {
      console.log('❌ Validation Error: Title is missing');
      return res.status(400).json({
        success: false,
        message: 'Please provide a title',
      });
    }

    // Validation: Check content
    if (!content || !content.trim()) {
      console.log('❌ Validation Error: Content is missing');
      return res.status(400).json({
        success: false,
        message: 'Please provide content',
      });
    }

    // Validation: Check word count (1500 words max)
    const wordCount = content.trim().split(/\s+/).length;
    console.log('📊 Content word count:', wordCount);

    if (wordCount > 1500) {
      console.log('❌ Validation Error: Content exceeds 1500 words');
      return res.status(400).json({
        success: false,
        message: `Content cannot exceed 1500 words. Current: ${wordCount} words`,
      });
    }

    // Create news in database
    const newsData = {
      title: title.trim(),
      content: content.trim(),
      createdBy: req.superAdmin.id,
    };

    // Add videoUrl if provided
    if (videoUrl && videoUrl.trim()) {
      newsData.videoUrl = videoUrl.trim();
      console.log('📹 Video URL included:', videoUrl);
    }

    const news = await News.create(newsData);

    console.log('✅ News created successfully! ID:', news._id);
    console.log('========================================\n');

    res.status(201).json({
      success: true,
      message: 'News created successfully',
      data: news,
    });

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ CREATE NEWS ERROR');
    console.error('========================================');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('========================================\n');

    res.status(500).json({
      success: false,
      message: 'Server error creating news',
      error: error.message,
    });
  }
};

/**
 * @desc    Update news
 * @route   PUT /api/news/admin/:id
 * @access  Private (Super Admin)
 */
export const updateNews = async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('✏️  UPDATE NEWS REQUEST RECEIVED');
    console.log('========================================');
    console.log('News ID:', req.params.id);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('========================================\n');

    const { title, content, videoUrl, isPublished } = req.body;

    const news = await News.findById(req.params.id);

    if (!news) {
      console.log('❌ News not found with ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'News not found',
      });
    }

    // Update title if provided
    if (title) {
      news.title = title.trim();
    }

    // Update content if provided
    if (content) {
      const wordCount = content.trim().split(/\s+/).length;
      if (wordCount > 1500) {
        console.log('❌ Content exceeds 1500 words:', wordCount);
        return res.status(400).json({
          success: false,
          message: `Content cannot exceed 1500 words. Current: ${wordCount} words`,
        });
      }
      news.content = content.trim();
    }

    // Update videoUrl if provided (can be empty string to remove)
    if (typeof videoUrl !== 'undefined') {
      news.videoUrl = videoUrl ? videoUrl.trim() : '';
      console.log('📹 Video URL updated:', videoUrl || 'removed');
    }

    // Update publish status if provided
    if (typeof isPublished !== 'undefined') {
      news.isPublished = isPublished;
    }

    await news.save();

    console.log('✅ News updated successfully!');
    console.log('========================================\n');

    res.status(200).json({
      success: true,
      message: 'News updated successfully',
      data: news,
    });
  } catch (error) {
    console.error('\n❌ UPDATE NEWS ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating news',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete news
 * @route   DELETE /api/news/admin/:id
 * @access  Private (Super Admin)
 */
export const deleteNews = async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('🗑️  DELETE NEWS REQUEST RECEIVED');
    console.log('========================================');
    console.log('News ID:', req.params.id);
    console.log('========================================\n');

    const news = await News.findById(req.params.id);

    if (!news) {
      console.log('❌ News not found with ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'News not found',
      });
    }

    await News.findByIdAndDelete(req.params.id);

    console.log('✅ News deleted successfully!');
    console.log('========================================\n');

    res.status(200).json({
      success: true,
      message: 'News deleted successfully',
    });
  } catch (error) {
    console.error('\n❌ DELETE NEWS ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting news',
      error: error.message,
    });
  }
};
