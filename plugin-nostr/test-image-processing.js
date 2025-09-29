#!/usr/bin/env node

// Simple test script for image processing functionality
const { extractImageUrls, processImageContent } = require('./lib/image-vision');

// Test extractImageUrls
console.log('Testing extractImageUrls...');

const testContent = `
Check out this amazing image: https://example.com/image.jpg
Also this one: https://test.com/photo.png?size=large
And this: https://blossom.primal.net/1234567890abcdef.jpg
Not an image: https://example.com/document.pdf
`;

const urls = extractImageUrls(testContent);
console.log('Extracted URLs:', urls);

// Test processImageContent (without runtime to avoid API calls)
console.log('\nTesting processImageContent...');

async function testProcessImageContent() {
  try {
    // Mock runtime object
    const mockRuntime = {
      getSetting: (key) => {
        if (key === 'OPENAI_API_KEY') return 'test-key';
        if (key === 'OPENROUTER_API_KEY') return 'test-key';
        return null;
      }
    };

    const result = await processImageContent(testContent, mockRuntime);
    console.log('Process result:', result);
  } catch (error) {
    console.log('Process error (expected without real API keys):', error.message);
  }
}

testProcessImageContent().then(() => {
  console.log('\nTest completed!');
}).catch(console.error);