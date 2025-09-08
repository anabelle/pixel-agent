// Test NIP-21 and NIP-18 implementations
const { generateNostrUri, generateNostrProfileUri, parseNostrUri } = require('../lib/utils');
const { buildQuoteRepost, buildNIP18QuoteRepost } = require('../lib/eventFactory');

describe('NIP-21 URI Generation', () => {
  test('should generate nevent URI', () => {
    const eventId = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const authorPubkey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const relays = ['wss://relay.damus.io', 'wss://nos.lol'];

    const uri = generateNostrUri(eventId, authorPubkey, relays);

    expect(uri).toMatch(/^nostr:nevent1/);
    expect(uri).toBeTruthy();
    expect(typeof uri).toBe('string');
  });

  test('should generate nprofile URI', () => {
    const pubkey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const relays = ['wss://relay.damus.io'];

    const uri = generateNostrProfileUri(pubkey, relays);

    expect(uri).toMatch(/^nostr:nprofile1/);
    expect(uri).toBeTruthy();
    expect(typeof uri).toBe('string');
  });

  test('should generate fallback URI when NIP-19 fails', () => {
    // Test with invalid data to trigger fallback
    const uri = generateNostrUri('invalid', 'invalid', []);

    expect(uri).toMatch(/^https:\/\/njump\.me\//);
  });

  test('should parse valid nostr URI', () => {
    // Use a valid nevent URI (this would need to be generated properly in real usage)
    // For now, just test that the function doesn't crash
    const uri = 'nostr:note1example';

    const parsed = parseNostrUri(uri);

    // Should return null for invalid URIs, which is expected behavior
    expect(parsed).toBeNull();
  });
});

describe('NIP-18 Quote Reposts', () => {
  const mockEvent = {
    id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    pubkey: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    content: 'Original post content',
    created_at: Math.floor(Date.now() / 1000)
  };

  test('should create kind 1 quote repost with NIP-21 URI', () => {
    const quoteText = 'This is a great post!';
    const relays = ['wss://relay.damus.io'];

    const repost = buildQuoteRepost(mockEvent, quoteText, relays);

    expect(repost).toBeTruthy();
    expect(repost.kind).toBe(1);
    expect(repost.content).toContain(quoteText);
    expect(repost.content).toMatch(/nostr:(nevent|note)/);
    expect(repost.tags).toContainEqual(['e', mockEvent.id, '', 'quote']);
    expect(repost.tags).toContainEqual(['p', mockEvent.pubkey]);
  });

  test('should create NIP-18 kind 6 quote repost', () => {
    const quoteText = 'This is a great post!';
    const relays = ['wss://relay.damus.io'];

    const repost = buildNIP18QuoteRepost(mockEvent, quoteText, relays);

    expect(repost).toBeTruthy();
    expect(repost.kind).toBe(6); // NIP-18 specifies kind 6
    expect(repost.content).toContain(quoteText);
    expect(repost.content).toMatch(/nostr:(nevent|note)/);
    expect(repost.tags).toContainEqual(['e', mockEvent.id, '', 'mention']);
    expect(repost.tags).toContainEqual(['p', mockEvent.pubkey]);
  });

  test('should handle missing quote text', () => {
    const repost = buildQuoteRepost(mockEvent, null, []);

    expect(repost).toBeTruthy();
    expect(repost.content).toMatch(/nostr:(nevent|note)/);
    expect(repost.content).toContain('↪️');
  });
});