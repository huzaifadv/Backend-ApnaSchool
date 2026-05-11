const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://127.0.0.1:27017/apnaschool');
  
  const FeePayment = await require('./models/dynamicModels').getModel('655b1f3c88a8e1001a1b1234', 'feepayments').catch(e => {
    // maybe try to get the active school ID?
    console.log(e);
  });
  process.exit();
}

test();
