/**
 * Test Password Reset Email
 * Run: node test-password-reset-email.js your-email@gmail.com
 */

import dotenv from 'dotenv';
import { sendPasswordResetEmail } from './utils/emailService.js';

// Load environment variables
dotenv.config();

const testPasswordResetEmail = async () => {
  console.log('\n🧪 Testing Password Reset Email...\n');

  // Check if email is provided as argument
  const testRecipient = process.argv[2];

  if (!testRecipient) {
    console.error('❌ Please provide a recipient email:');
    console.error('   node test-password-reset-email.js your-email@gmail.com\n');
    process.exit(1);
  }

  // Check environment variables
  console.log('📋 Current Email Configuration:');
  console.log(`   EMAIL_SERVICE: ${process.env.EMAIL_SERVICE || 'NOT SET'}`);
  console.log(`   EMAIL_USER: ${process.env.EMAIL_USER || 'NOT SET'}`);
  console.log(`   EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? '***' + process.env.EMAIL_PASSWORD.slice(-4) : 'NOT SET'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
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

  // Generate test OTP
  const testOTP = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`🔑 Generated Test OTP: ${testOTP}`);
  console.log(`📧 Sending password reset email to: ${testRecipient}...`);
  console.log();

  try {
    const result = await sendPasswordResetEmail(testRecipient, testOTP, 'Test Admin');

    if (result.success) {
      console.log('✅ Email sent successfully!');
      console.log(`   Message ID: ${result.messageId}`);
      console.log(`\n🎉 Password reset email is working!`);
      console.log(`📬 Check ${testRecipient} for the email`);
      console.log(`🔑 Test OTP: ${testOTP}\n`);
    } else {
      console.error('\n❌ Email sending failed:');
      console.error(`   Error: ${result.error}\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Failed to send email:');
    console.error(`   ${error.message}\n`);

    if (error.message.includes('Invalid login')) {
      console.error('💡 Tip: For Gmail, make sure you are using an App Password, not your regular password.');
      console.error('   Generate App Password at: https://myaccount.google.com/apppasswords');
    } else if (error.message.includes('self signed certificate')) {
      console.error('💡 Tip: This might be a TLS/SSL issue. Try updating Node.js or checking your network.');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('💡 Tip: Cannot connect to email server. Check your internet connection.');
    }

    console.log();
    process.exit(1);
  }
};

testPasswordResetEmail();
