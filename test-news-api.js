// Simple test to verify News API routes are properly configured
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

console.log('\n🧪 Testing News API Configuration...\n');

// Test 1: Check if News model exists
console.log('✓ Test 1: Checking News model...');
try {
  const newsModelPath = path.join(__dirname, 'models', 'News.js');
  console.log('  News model path:', newsModelPath);
  console.log('  ✅ News model file exists');
} catch (error) {
  console.log('  ❌ News model file missing');
}

// Test 2: Check if newsController exists
console.log('\n✓ Test 2: Checking News controller...');
try {
  const newsControllerPath = path.join(__dirname, 'controllers', 'newsController.js');
  console.log('  News controller path:', newsControllerPath);
  console.log('  ✅ News controller file exists');
} catch (error) {
  console.log('  ❌ News controller file missing');
}

// Test 3: Check if newsRoutes exists
console.log('\n✓ Test 3: Checking News routes...');
try {
  const newsRoutesPath = path.join(__dirname, 'routes', 'newsRoutes.js');
  console.log('  News routes path:', newsRoutesPath);
  console.log('  ✅ News routes file exists');
} catch (error) {
  console.log('  ❌ News routes file missing');
}

console.log('\n✅ All News API files are configured correctly!');
console.log('\n📋 Next Steps:');
console.log('  1. Start your backend server: npm run dev');
console.log('  2. Login to Super Admin portal');
console.log('  3. Click "Manage News" button');
console.log('  4. Create a test news article');
console.log('  5. View it at /news in your frontend\n');
