import cron from 'node-cron';
import { autoDeleteOldDiaries } from '../controllers/diaryController.js';
import { generateMonthlyFeeRecords } from '../services/feeGenerationService.js';

/**
 * Initialize all scheduled cron jobs
 */
export const initializeCronJobs = () => {
  console.log('Initializing cron jobs...');

  // Auto-delete diary entries older than 7 days
  // Runs every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('Running scheduled task: Auto-delete old diaries');
    try {
      const result = await autoDeleteOldDiaries();
      if (result.success) {
        console.log(`Cron job completed: Deleted ${result.deletedCount} old diary entries`);
      } else {
        console.error('Cron job failed:', result.error);
      }
    } catch (error) {
      console.error('Error running auto-delete cron job:', error);
    }
  });

  console.log('✓ Cron job scheduled: Auto-delete old diaries (Daily at 2:00 AM)');

  // Generate monthly fee records on 1st of every month
  // Runs at 12:01 AM on the 1st of every month
  cron.schedule('1 0 1 * *', async () => {
    console.log('🗓️ Running scheduled task: Generate monthly fee records');
    try {
      const result = await generateMonthlyFeeRecords();
      if (result.success) {
        console.log(`✅ Cron job completed: Generated fee records for ${result.totalStudents} students across ${result.totalSchools} schools`);
      } else {
        console.error('❌ Cron job failed:', result.error);
      }
    } catch (error) {
      console.error('❌ Error running monthly fee generation cron job:', error);
    }
  });

  console.log('✓ Cron job scheduled: Generate monthly fees (1st of every month at 12:01 AM)');
};

export default initializeCronJobs;
