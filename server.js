// ⚠️ IMPORTANT: Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file with explicit path
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

// Debug: Log to verify .env is loaded
console.log('🔍 Loading .env from:', envPath);
console.log('🔍 CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME || '❌ NOT FOUND');
console.log('🔍 CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY || '❌ NOT FOUND');

// Now import everything else
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import classRoutes from './routes/classRoutes.js';
import parentRoutes from './routes/parentRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import noticeRoutes from './routes/noticeRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import diaryRoutes from './routes/diaryRoutes.js';
import feePaymentRoutes from './routes/feePaymentRoutes.js';
import parentDiaryRoutes from './routes/parentDiaryRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import schoolRegistryRoutes from './routes/schoolRegistryRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import newsRoutes from './routes/newsRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import academicYearRoutes from './routes/academicYearRoutes.js';
import feeAccessRoutes from './routes/feeAccessRoutes.js';
import logoRoutes from './routes/logoRoutes.js';
// ── Staff Management (new — safe extension) ───────────────────────────────────
import staffRoutes from './routes/staffRoutes.js';
import staffPortalRoutes from './routes/staffPortalRoutes.js';
// ── FBR POS Integration (new — safe extension) ────────────────────────────────
import fbrRoutes from './routes/fbrRoutes.js';
import errorHandler from './middleware/errorHandler.js';
import initializeCronJobs from './config/cronJobs.js';

// __filename and __dirname already defined above

const app = express();

// Trust proxy - important for deployment behind reverse proxies (Heroku, Vercel, etc.)
app.set('trust proxy', 1);

// Security Middleware
// Helmet helps secure Express apps by setting various HTTP headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false,
}));

// Compression middleware to compress response bodies
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined')); // Standard Apache combined log output
} else {
  app.use(morgan('dev')); // Concise colored output for development
}

// Middleware
// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or same-origin)
    if (!origin) return callback(null, true);

    const allowedOrigins = process.env.NODE_ENV === 'production'
      ? [
          process.env.FRONTEND_URL,
          'https://apnaschooledu.com', // Non-www version
          'https://www.apnaschooledu.com' // www version
        ].filter(Boolean)
      : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'];

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      console.error('❌ CORS Error: Origin not allowed:', origin);
      console.log('✓ Allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database connection
connectDB();

// Initialize cron jobs
initializeCronJobs();

// Basic health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'ApnaSchool API is running' });
});

// Routes
app.use('/api', authRoutes);
app.use('/api/admin/students', studentRoutes);
app.use('/api/admin/classes', classRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/admin/reports', reportRoutes);
app.use('/api/admin/notices', noticeRoutes);
app.use('/api/admin/attendance', attendanceRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/admin/diary', diaryRoutes);
app.use('/api/admin/fees', feePaymentRoutes);
app.use('/api/parent/diary', parentDiaryRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/super-admin/registry', schoolRegistryRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/admin/academic-years', academicYearRoutes);
app.use('/api/admin/fee-access', feeAccessRoutes);
app.use('/api/super/logos', logoRoutes); // Super admin routes (must be first - more specific)
app.use('/api/logos', logoRoutes); // Public route for active logos (less specific)
// ── Staff Management (new — safe extension) ───────────────────────────────────
app.use('/api/admin/staff', staffRoutes);       // Admin manages staff
app.use('/api/staff',       staffPortalRoutes); // Staff portal (login + own data)
// ── FBR POS Integration (new — safe extension) ────────────────────────────────
app.use('/api/admin/fbr', fbrRoutes);           // FBR configuration and testing

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Graceful shutdown handling
const server = app.listen(PORT, () => {
  console.log(`✓ Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log(`✓ API Health Check: http://localhost:${PORT}/api/health`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  if (process.env.NODE_ENV === 'production') {
    server.close(() => process.exit(1));
  }
});

// Handle SIGTERM for graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});
