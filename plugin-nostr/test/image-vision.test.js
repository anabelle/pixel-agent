const { extractImageUrls } = require('../lib/image-vision');

// Mock logger
global.logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

describe('Image Vision - URL Deduplication', () => {
  test('should deduplicate blossom.primal.net URLs that match both regex patterns', () => {
    const content = 'Check out this image: https://blossom.primal.net/452da360b0d84f54da36b7a3dc4bad69bb88d12d6069b9f03b7c52d4864b7d63.jpg';

    const urls = extractImageUrls(content);

    // Should only return one URL, not two
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://blossom.primal.net/452da360b0d84f54da36b7a3dc4bad69bb88d12d6069b9f03b7c52d4864b7d63.jpg');
  });

  test('should handle multiple different URLs correctly', () => {
    const content = 'Images: https://example.com/image1.jpg https://blossom.primal.net/abc123.jpg https://example.com/image2.png';
    
    const urls = extractImageUrls(content);
    
    // Should return all three unique URLs
    expect(urls).toHaveLength(3);
    expect(urls).toContain('https://example.com/image1.jpg');
    expect(urls).toContain('https://blossom.primal.net/abc123.jpg');
    expect(urls).toContain('https://example.com/image2.png');
  });

  test('should handle duplicate URLs in content', () => {
    const content = 'Same image twice: https://blossom.primal.net/abc123.jpg https://blossom.primal.net/abc123.jpg';
    
    const urls = extractImageUrls(content);
    
    // Should deduplicate to one URL
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://blossom.primal.net/abc123.jpg');
  });
});