import cron from 'node-cron';
import { autoDeleteOldDiaries } from '../controllers/diaryController.js';

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
};

export default initializeCronJobs;
