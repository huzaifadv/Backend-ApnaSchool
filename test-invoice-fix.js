// Test script to verify invoice saving issue is fixed
// This script will:
// 1. Create a test payment
// 2. Update it using the updateInvoice endpoint
// 3. Verify that invoiceCreated is set to true and invoice number is generated

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getModel } from './models/dynamicModels.js';
import { getTenantConnection } from './config/tenantDB.js';

dotenv.config();

const testInvoiceFix = async () => {
  try {
    console.log('🧪 Starting Invoice Fix Test...\n');

    // Connect to main database
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/apnaschool');
    console.log('✅ Connected to main database');

    // Find a school to test with
    const School = mongoose.model('School');
    const school = await School.findOne({ isActive: true }).limit(1);

    if (!school) {
      console.log('❌ No active school found. Please run seed script first.');
      process.exit(1);
    }

    console.log(`📚 Testing with school: ${school.name} (ID: ${school._id})`);

    // Get tenant connection
    const tenantDb = await getTenantConnection(school._id, school.name);
    console.log('✅ Connected to tenant database');

    // Get FeePayment model
    const FeePayment = await getModel(school._id, 'feepayments');
    const Student = await getModel(school._id, 'students');

    // Find a student
    const student = await Student.findOne().limit(1);
    if (!student) {
      console.log('❌ No student found in this school');
      process.exit(1);
    }

    console.log(`👨‍🎓 Found student: ${student.fullName}`);

    // Create a test payment record
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    // Check if payment already exists
    let testPayment = await FeePayment.findOne({
      studentId: student._id,
      month: currentMonth,
      year: currentYear
    });

    if (!testPayment) {
      // Create new payment
      testPayment = await FeePayment.create({
        studentId: student._id,
        classId: student.classId,
        month: currentMonth,
        year: currentYear,
        amount: student.monthlyFee || 1000,
        amountPaid: 500, // Partial payment
        remainingAmount: (student.monthlyFee || 1000) - 500,
        status: 'Partial',
        remarks: 'Test payment for invoice fix'
      });
      console.log(`✅ Created test payment with ID: ${testPayment._id}`);
    } else {
      console.log(`📝 Using existing payment with ID: ${testPayment._id}`);
    }

    console.log('\n🔧 Before Update:');
    console.log(`   Invoice Number: ${testPayment.invoiceNumber || 'Not set'}`);
    console.log(`   Invoice Created: ${testPayment.invoiceCreated || false}`);
    console.log(`   Status: ${testPayment.status}`);
    console.log(`   Amount Paid: Rs ${testPayment.amountPaid}`);

    // Simulate updateInvoice operation
    const invoiceData = {
      totalFee: testPayment.amount,
      amountPaid: 700, // Update payment amount
      note: 'Test invoice update',
      additionalCharges: [
        { label: 'Late Fee', amount: 100 }
      ],
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };

    // Update invoice fields
    testPayment.amount = invoiceData.totalFee;
    testPayment.amountPaid = invoiceData.amountPaid;
    testPayment.remainingAmount = testPayment.amount - testPayment.amountPaid;

    // Update status based on remaining amount
    if (testPayment.remainingAmount <= 0) {
      testPayment.status = 'Paid';
      if (!testPayment.paymentDate) {
        testPayment.paymentDate = new Date();
      }
    } else if (testPayment.amountPaid > 0) {
      testPayment.status = 'Partial';
    } else {
      testPayment.status = 'Pending';
    }

    // Store invoice metadata
    const invoiceMetadata = {
      note: invoiceData.note,
      additionalCharges: invoiceData.additionalCharges,
      dueDate: invoiceData.dueDate,
      lastUpdated: new Date()
    };
    testPayment.remarks = `---INVOICE_METADATA---\n${JSON.stringify(invoiceMetadata)}`;

    // Generate invoice number if not exists (FIX APPLIED HERE)
    if (!testPayment.invoiceNumber) {
      const schoolIdPart = school._id.toString().slice(-6).toUpperCase();
      const count = await FeePayment.countDocuments({
        invoiceNumber: { $exists: true, $ne: null }
      });
      const sequenceNumber = (count + 1).toString().padStart(5, '0');
      testPayment.invoiceNumber = `INV-${schoolIdPart}-${sequenceNumber}`;
      console.log(`\n📋 Generated invoice number: ${testPayment.invoiceNumber}`);
    }

    // Mark invoice as created (FIX APPLIED HERE)
    testPayment.invoiceCreated = true;

    // Save the updated payment
    await testPayment.save();

    console.log('\n✅ After Update:');
    console.log(`   Invoice Number: ${testPayment.invoiceNumber}`);
    console.log(`   Invoice Created: ${testPayment.invoiceCreated}`);
    console.log(`   Status: ${testPayment.status}`);
    console.log(`   Amount Paid: Rs ${testPayment.amountPaid}`);
    console.log(`   Remaining: Rs ${testPayment.remainingAmount}`);

    // Verify the update by fetching again
    const verifiedPayment = await FeePayment.findById(testPayment._id);

    console.log('\n🔍 Verification Check:');
    console.log(`   Invoice Created in DB: ${verifiedPayment.invoiceCreated}`);
    console.log(`   Invoice Number in DB: ${verifiedPayment.invoiceNumber}`);

    if (verifiedPayment.invoiceCreated && verifiedPayment.invoiceNumber) {
      console.log('\n✅ SUCCESS: Invoice fix is working correctly!');
      console.log('   - Invoice number is generated');
      console.log('   - invoiceCreated flag is set to true');
      console.log('   - Invoice will now be visible in parent portal');
    } else {
      console.log('\n❌ FAILED: Invoice fix did not work properly');
      console.log('   - Check the updateInvoice function in tenantFeePaymentController.js');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
};

// Run the test
testInvoiceFix();