/**
 * Quick Email Configuration Test
 * Run: node test-email.js your-email@gmail.com
 */

import dotenv from 'dotenv';
import { sendVerificationEmail } from './utils/emailService.js';

// Load environment variables
dotenv.config();

const testEmail = async () => {
  console.log('🧪 Testing Email Configuration...\n');

  // Check if email is provided as argument
  const testRecipient = process.argv[2];

  if (!testRecipient) {
    console.error('❌ Please provide a recipient email:');
    console.error('   node test-email.js your-email@gmail.com\n');
    process.exit(1);
  }

  // Check environment variables
  console.log('📋 Current Email Configuration:');
  console.log(`   EMAIL_SERVICE: ${process.env.EMAIL_SERVICE || 'NOT SET'}`);
  console.log(`   EMAIL_USER: ${process.env.EMAIL_USER || 'NOT SET'}`);
  console.log(`   EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? '***' + process.env.EMAIL_PASSWORD.slice(-4) : 'NOT SET'}`);
  console.log();

  // Validate configuration
  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your-email@gmail.com') {
    console.error('❌ EMAIL_USER not configured!');
    console.error('   Please update EMAIL_USER in .env file\n');
    process.exit(1);
  }

  if (!process.env.EMAIL_PASSWORD || process.env.EMAIL_PASSWORD === 'your-app-password') {
    console.error('❌ EMAIL_PASSWORD not configured!');
    console.error('   Please update EMAIL_PASSWORD in .env file');
    console.error('   For Gmail, use App Password (not regular password)\n');
    process.exit(1);
  }

  // Send test email
  console.log(`📧 Sending test email to: ${testRecipient}...`);

  try {
    const result = await sendVerificationEmail(testRecipient, '123456', 'Test Admin');
    console.log('✅ Email sent successfully!');
    console.log(`   Message ID: ${result.messageId}`);
    console.log('\n🎉 Email configuration is working!\n');
  } catch (error) {
    console.error('\n❌ Failed to send email:');
    console.error(`   ${error.message}\n`);

    if (error.message.includes('Invalid login')) {
      console.error('💡 Tip: For Gmail, make sure you are using an App Password, not your regular password.');
      console.error('   Generate App Password at: https://myaccount.google.com/apppasswords\n');
    }

    process.exit(1);
  }
};

testEmail();
