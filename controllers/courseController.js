import Course from '../models/Course.js';

/**
 * @desc    Get all courses (public - only published)
 * @route   GET /api/courses
 * @access  Public
 */
export const getAllCourses = async (req, res) => {
  try {
    const filter = { isPublished: true };

    const courses = await Course.find(filter)
      .sort({ publishedAt: -1 })
      .select('title category content playlistUrl thumbnail slug publishedAt createdAt');

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error('Get All Courses Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching courses',
    });
  }
};

/**
 * @desc    Get single course by slug (public)
 * @route   GET /api/courses/:slug
 * @access  Public
 */
export const getCourseBySlug = async (req, res) => {
  try {
    const course = await Course.findOne({
      slug: req.params.slug,
      isPublished: true
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (error) {
    console.error('Get Course By Slug Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching course',
    });
  }
};


/**
 * @desc    Get all courses for super admin (including unpublished)
 * @route   GET /api/courses/admin/all
 * @access  Private (Super Admin)
 */
export const getAllCoursesAdmin = async (req, res) => {
  try {
    const courses = await Course.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error('Get All Courses Admin Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching courses',
    });
  }
};

/**
 * @desc    Create new course
 * @route   POST /api/courses/admin/create
 * @access  Private (Super Admin)
 */
export const createCourse = async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('📚 CREATE COURSE REQUEST RECEIVED');
    console.log('========================================');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Super Admin ID:', req.superAdmin?.id);
    console.log('========================================\n');

    const { title, category, content, playlistUrl, thumbnail } = req.body;

    // Validation: Check title
    if (!title || !title.trim()) {
      console.log('❌ Validation Error: Title is missing');
      return res.status(400).json({
        success: false,
        message: 'Please provide a title',
      });
    }

    // Validation: Check category
    if (!category || !category.trim()) {
      console.log('❌ Validation Error: Category is missing');
      return res.status(400).json({
        success: false,
        message: 'Please provide a category',
      });
    }

    // Validation: Check content
    if (!content || !content.trim()) {
      console.log('❌ Validation Error: Content is missing');
      return res.status(400).json({
        success: false,
        message: 'Please provide course description',
      });
    }

    // Validation: Check playlist URL
    if (!playlistUrl || !playlistUrl.trim()) {
      console.log('❌ Validation Error: Playlist URL is missing');
      return res.status(400).json({
        success: false,
        message: 'Please provide YouTube playlist URL',
      });
    }

    // Create course in database
    const courseData = {
      title: title.trim(),
      category: category.trim(),
      content: content.trim(),
      playlistUrl: playlistUrl.trim(),
      createdBy: req.superAdmin.id,
    };

    // Add thumbnail if provided
    if (thumbnail && thumbnail.trim()) {
      courseData.thumbnail = thumbnail.trim();
      console.log('🖼️ Thumbnail included:', thumbnail);
    }

    const course = await Course.create(courseData);

    console.log('✅ Course created successfully! ID:', course._id);
    console.log('========================================\n');

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: course,
    });

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ CREATE COURSE ERROR');
    console.error('========================================');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('========================================\n');

    res.status(500).json({
      success: false,
      message: 'Server error creating course',
      error: error.message,
    });
  }
};

/**
 * @desc    Update course
 * @route   PUT /api/courses/admin/:id
 * @access  Private (Super Admin)
 */
export const updateCourse = async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('✏️  UPDATE COURSE REQUEST RECEIVED');
    console.log('========================================');
    console.log('Course ID:', req.params.id);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('========================================\n');

    const { title, category, content, playlistUrl, thumbnail, isPublished } = req.body;

    const course = await Course.findById(req.params.id);

    if (!course) {
      console.log('❌ Course not found with ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Update fields if provided
    if (title) course.title = title.trim();
    if (category) course.category = category.trim();
    if (content) course.content = content.trim();
    if (playlistUrl) course.playlistUrl = playlistUrl.trim();

    if (typeof thumbnail !== 'undefined') {
      course.thumbnail = thumbnail ? thumbnail.trim() : '';
    }

    if (typeof isPublished !== 'undefined') {
      course.isPublished = isPublished;
    }

    await course.save();

    console.log('✅ Course updated successfully!');
    console.log('========================================\n');

    res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      data: course,
    });
  } catch (error) {
    console.error('\n❌ UPDATE COURSE ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating course',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete course
 * @route   DELETE /api/courses/admin/:id
 * @access  Private (Super Admin)
 */
export const deleteCourse = async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('🗑️  DELETE COURSE REQUEST RECEIVED');
    console.log('========================================');
    console.log('Course ID:', req.params.id);
    console.log('========================================\n');

    const course = await Course.findById(req.params.id);

    if (!course) {
      console.log('❌ Course not found with ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    await Course.findByIdAndDelete(req.params.id);

    console.log('✅ Course deleted successfully!');
    console.log('========================================\n');

    res.status(200).json({
      success: true,
      message: 'Course deleted successfully',
    });
  } catch (error) {
    console.error('\n❌ DELETE COURSE ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting course',
      error: error.message,
    });
  }
};
