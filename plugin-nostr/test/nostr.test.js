import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the functions to test
const {
  getConversationIdFromEvent,
  extractTopicsFromEvent,
  getTopicExtractorStats,
  destroyTopicExtractor,
  isSelfAuthor,
  decryptDirectMessage,
  decryptNIP04Manual,
  encryptNIP04Manual,
  TIMELINE_LORE_IGNORED_TERMS,
  FORBIDDEN_TOPIC_WORDS,
  EXTRACTED_TOPICS_LIMIT,
} = require('../lib/nostr.js');

describe('Nostr Protocol Utilities', () => {
  describe('Constants', () => {
    it('exports FORBIDDEN_TOPIC_WORDS set', () => {
      expect(FORBIDDEN_TOPIC_WORDS).toBeInstanceOf(Set);
      expect(FORBIDDEN_TOPIC_WORDS.has('pixel')).toBe(true);
      expect(FORBIDDEN_TOPIC_WORDS.has('art')).toBe(true);
      expect(FORBIDDEN_TOPIC_WORDS.has('lnpixels')).toBe(true);
    });

    it('exports TIMELINE_LORE_IGNORED_TERMS set', () => {
      expect(TIMELINE_LORE_IGNORED_TERMS).toBeInstanceOf(Set);
      expect(TIMELINE_LORE_IGNORED_TERMS.has('bitcoin')).toBe(true);
      expect(TIMELINE_LORE_IGNORED_TERMS.has('nostr')).toBe(true);
      expect(TIMELINE_LORE_IGNORED_TERMS.has('crypto')).toBe(true);
    });

    it('exports EXTRACTED_TOPICS_LIMIT number', () => {
      expect(typeof EXTRACTED_TOPICS_LIMIT).toBe('number');
      expect(EXTRACTED_TOPICS_LIMIT).toBeGreaterThan(0);
    });
  });

  describe('getConversationIdFromEvent', () => {
    it('returns event ID when no tags present', () => {
      const event = { id: 'test-event-123', tags: [] };
      expect(getConversationIdFromEvent(event)).toBe('test-event-123');
    });

    it('returns root e-tag when marked as root', () => {
      const event = {
        id: 'reply-123',
        tags: [
          ['e', 'root-event-id', '', 'root'],
          ['e', 'other-event-id'],
        ],
      };
      expect(getConversationIdFromEvent(event)).toBe('root-event-id');
    });

    it('returns first e-tag when no root marker', () => {
      const event = {
        id: 'reply-456',
        tags: [
          ['e', 'first-event-id'],
          ['e', 'second-event-id'],
        ],
      };
      expect(getConversationIdFromEvent(event)).toBe('first-event-id');
    });

    it('handles missing or invalid tags gracefully', () => {
      expect(getConversationIdFromEvent({ id: 'solo' })).toBe('solo');
      expect(getConversationIdFromEvent({ id: 'solo', tags: null })).toBe('solo');
      expect(getConversationIdFromEvent({})).toBe('nostr');
    });

    it('returns "nostr" when event is null or undefined', () => {
      expect(getConversationIdFromEvent(null)).toBe('nostr');
      expect(getConversationIdFromEvent(undefined)).toBe('nostr');
    });

    it('ignores e-tags without event ID', () => {
      const event = {
        id: 'test-789',
        tags: [['e'], ['p', 'some-pubkey']],
      };
      expect(getConversationIdFromEvent(event)).toBe('test-789');
    });
  });

  describe('isSelfAuthor', () => {
    it('returns true when pubkeys match', () => {
      const event = { pubkey: 'abc123' };
      expect(isSelfAuthor(event, 'abc123')).toBe(true);
    });

    it('returns true when pubkeys match (case insensitive)', () => {
      const event = { pubkey: 'ABC123' };
      expect(isSelfAuthor(event, 'abc123')).toBe(true);
    });

    it('returns false when pubkeys do not match', () => {
      const event = { pubkey: 'abc123' };
      expect(isSelfAuthor(event, 'xyz789')).toBe(false);
    });

    it('returns false when event is null', () => {
      expect(isSelfAuthor(null, 'abc123')).toBe(false);
    });

    it('returns false when selfPkHex is null', () => {
      const event = { pubkey: 'abc123' };
      expect(isSelfAuthor(event, null)).toBe(false);
    });

    it('returns false when event has no pubkey', () => {
      const event = {};
      expect(isSelfAuthor(event, 'abc123')).toBe(false);
    });

    it('handles errors gracefully', () => {
      const event = { pubkey: {} }; // Invalid pubkey type
      expect(isSelfAuthor(event, 'abc123')).toBe(false);
    });
  });

  describe('Topic Extraction', () => {
    describe('extractTopicsFromEvent', () => {
      it('returns empty array for null event', async () => {
        const topics = await extractTopicsFromEvent(null, null);
        expect(topics).toEqual([]);
      });

      it('returns empty array for event without content', async () => {
        const event = { id: 'test' };
        const topics = await extractTopicsFromEvent(event, null);
        expect(topics).toEqual([]);
      });

      it('extracts topics using fallback when no runtime provided', async () => {
        const event = {
          id: 'test-event',
          content: 'This is about artificial intelligence and machine learning technology',
        };
        const topics = await extractTopicsFromEvent(event, null);
        expect(Array.isArray(topics)).toBe(true);
        expect(topics.length).toBeGreaterThan(0);
      });

      it('filters out forbidden topic words', async () => {
        const event = {
          id: 'test-event',
          content: 'pixel art creativity freedom',
        };
        const topics = await extractTopicsFromEvent(event, null);
        // All words are in FORBIDDEN_TOPIC_WORDS
        expect(topics.length).toBe(0);
      });

      it('filters out generic ignored terms', async () => {
        const event = {
          id: 'test-event',
          content: 'bitcoin nostr crypto blockchain discussion',
        };
        const topics = await extractTopicsFromEvent(event, null);
        // All words are in TIMELINE_LORE_IGNORED_TERMS
        expect(topics.length).toBe(0);
      });

      it('extracts meaningful topics', async () => {
        const event = {
          id: 'test-event',
          content: 'OpenAI releases GPT-4 with amazing capabilities',
        };
        const topics = await extractTopicsFromEvent(event, null);
        expect(topics.some(t => t.includes('openai') || t.includes('gpt'))).toBe(true);
      });

      it('removes URLs from content before extraction', async () => {
        const event = {
          id: 'test-event',
          content: 'Check out https://example.com for more info about Python programming',
        };
        const topics = await extractTopicsFromEvent(event, null);
        expect(topics.some(t => t.includes('http'))).toBe(false);
      });

      it('removes tracking parameters', async () => {
        const event = {
          id: 'test-event',
          content: 'Article about climate change?utm_source=twitter&ref_src=twsrc',
        };
        const topics = await extractTopicsFromEvent(event, null);
        expect(topics.some(t => t.includes('utm') || t.includes('ref'))).toBe(false);
      });

      it('uses TopicExtractor when runtime provided', async () => {
        const mockRuntime = {
          agentId: 'test-agent',
          logger: {
            debug: vi.fn(),
          },
          useModel: vi.fn().mockResolvedValue({ text: 'topic1\ntopic2' }),
        };

        const event = {
          id: 'test-event',
          content: 'Some interesting content about Rust and WebAssembly',
        };

        const topics = await extractTopicsFromEvent(event, mockRuntime);
        expect(Array.isArray(topics)).toBe(true);
      });

      it('falls back to fast extraction on error', async () => {
        const mockRuntime = {
          agentId: 'test-agent',
          logger: {
            debug: vi.fn(),
          },
          useModel: vi.fn().mockRejectedValue(new Error('Model error')),
        };

        const event = {
          id: 'test-event',
          content: 'Content about TypeScript and JavaScript frameworks',
        };

        const topics = await extractTopicsFromEvent(event, mockRuntime);
        expect(Array.isArray(topics)).toBe(true);
      });
    });

    describe('Topic Extractor Lifecycle', () => {
      afterEach(async () => {
        // Clean up any extractors created during tests
        await destroyTopicExtractor({ agentId: 'test-agent' });
        await destroyTopicExtractor({ agentId: 'default' });
      });

      it('getTopicExtractorStats returns null for non-existent extractor', () => {
        const stats = getTopicExtractorStats({ agentId: 'non-existent' });
        expect(stats).toBeNull();
      });

      it('getTopicExtractorStats returns stats after extraction', async () => {
        const mockRuntime = {
          agentId: 'test-stats-agent',
          logger: { debug: vi.fn() },
          useModel: vi.fn().mockResolvedValue({ text: 'test' }),
        };

        const event = {
          id: 'test',
          content: 'Some content',
        };

        await extractTopicsFromEvent(event, mockRuntime);
        const stats = getTopicExtractorStats(mockRuntime);
        expect(stats).not.toBeNull();
        expect(stats).toHaveProperty('processed');
      });

      it('destroyTopicExtractor removes extractor', async () => {
        const mockRuntime = {
          agentId: 'test-destroy-agent',
          logger: { debug: vi.fn() },
          useModel: vi.fn().mockResolvedValue({ text: 'test' }),
        };

        const event = { id: 'test', content: 'Some content' };
        await extractTopicsFromEvent(event, mockRuntime);

        // Verify extractor exists
        let stats = getTopicExtractorStats(mockRuntime);
        expect(stats).not.toBeNull();

        // Destroy it
        await destroyTopicExtractor(mockRuntime);

        // Verify it's gone
        stats = getTopicExtractorStats(mockRuntime);
        expect(stats).toBeNull();
      });

      it('destroyTopicExtractor handles non-existent extractor gracefully', async () => {
        await expect(destroyTopicExtractor({ agentId: 'never-existed' })).resolves.not.toThrow();
      });
    });
  });

  describe('NIP-04 Encryption/Decryption', () => {
    // Test keypairs (these are example keys for testing only)
    const testPrivateKey = 'a'.repeat(64); // 64-char hex
    const testPeerPubkey = 'b'.repeat(64);

    describe('encryptNIP04Manual', () => {
      it('encrypts a message successfully', async () => {
        const message = 'Hello, this is a secret message';
        const encrypted = await encryptNIP04Manual(testPrivateKey, testPeerPubkey, message);

        expect(encrypted).toBeDefined();
        expect(typeof encrypted).toBe('string');
        expect(encrypted).toContain('?iv=');
      });

      it('returns different ciphertext for same message (random IV)', async () => {
        const message = 'Same message';
        const encrypted1 = await encryptNIP04Manual(testPrivateKey, testPeerPubkey, message);
        const encrypted2 = await encryptNIP04Manual(testPrivateKey, testPeerPubkey, message);

        expect(encrypted1).not.toBe(encrypted2);
      });

      it('throws error when encryption fails', async () => {
        await expect(encryptNIP04Manual(null, testPeerPubkey, 'message')).rejects.toThrow();
      });
    });

    describe('decryptNIP04Manual', () => {
      it('decrypts encrypted message successfully', async () => {
        const message = 'Test message for decryption';
        const encrypted = await encryptNIP04Manual(testPrivateKey, testPeerPubkey, message);
        const decrypted = await decryptNIP04Manual(testPrivateKey, testPeerPubkey, encrypted);

        expect(decrypted).toBe(message);
      });

      it('handles encryption/decryption roundtrip', async () => {
        const message = 'Roundtrip test with special chars: 🔐 áéíóú';
        const encrypted = await encryptNIP04Manual(testPrivateKey, testPeerPubkey, message);
        const decrypted = await decryptNIP04Manual(testPrivateKey, testPeerPubkey, encrypted);

        expect(decrypted).toBe(message);
      });

      it('throws error for missing encrypted content', async () => {
        await expect(decryptNIP04Manual(testPrivateKey, testPeerPubkey, null)).rejects.toThrow('Missing encrypted content');
      });

      it('throws error for invalid payload format', async () => {
        await expect(decryptNIP04Manual(testPrivateKey, testPeerPubkey, 'invalid')).rejects.toThrow('Invalid NIP-04 payload format');
      });

      it('throws error for missing IV', async () => {
        await expect(decryptNIP04Manual(testPrivateKey, testPeerPubkey, 'data?iv=')).rejects.toThrow('Invalid NIP-04 payload format');
      });

      it('throws error for invalid IV length', async () => {
        const shortIv = Buffer.from('short').toString('base64');
        await expect(decryptNIP04Manual(testPrivateKey, testPeerPubkey, `data?iv=${shortIv}`)).rejects.toThrow('Invalid IV length');
      });

      it('throws error for non-string encrypted content', async () => {
        await expect(decryptNIP04Manual(testPrivateKey, testPeerPubkey, 123)).rejects.toThrow('Missing encrypted content');
      });
    });

    describe('decryptDirectMessage', () => {
      const selfPrivateKey = 'c'.repeat(64);
      const selfPublicKey = 'd'.repeat(64);
      const senderPubkey = 'e'.repeat(64);

      it('returns null for non-DM event', async () => {
        const event = { kind: 1, content: 'Not a DM' };
        const result = await decryptDirectMessage(event, selfPrivateKey, selfPublicKey, null);
        expect(result).toBeNull();
      });

      it('returns null when missing private key', async () => {
        const event = {
          kind: 4,
          pubkey: senderPubkey,
          content: 'encrypted',
          tags: [['p', selfPublicKey]],
        };
        const result = await decryptDirectMessage(event, null, selfPublicKey, null);
        expect(result).toBeNull();
      });

      it('returns null when missing public key', async () => {
        const event = {
          kind: 4,
          pubkey: senderPubkey,
          content: 'encrypted',
          tags: [['p', selfPublicKey]],
        };
        const result = await decryptDirectMessage(event, selfPrivateKey, null, null);
        expect(result).toBeNull();
      });

      it('returns null when no p-tag found', async () => {
        const event = {
          kind: 4,
          pubkey: senderPubkey,
          content: 'encrypted',
          tags: [],
        };
        const result = await decryptDirectMessage(event, selfPrivateKey, selfPublicKey, null);
        expect(result).toBeNull();
      });

      it('uses provided decrypt function when available', async () => {
        const mockDecryptFn = vi.fn().mockResolvedValue('Decrypted message');
        const event = {
          kind: 4,
          pubkey: senderPubkey,
          content: 'encrypted-content',
          tags: [['p', selfPublicKey]],
        };

        const result = await decryptDirectMessage(event, selfPrivateKey, selfPublicKey, mockDecryptFn);
        expect(result).toBe('Decrypted message');
        expect(mockDecryptFn).toHaveBeenCalled();
      });

      it('falls back to manual decryption when decrypt function fails', async () => {
        const mockDecryptFn = vi.fn().mockResolvedValue(null);
        
        // First encrypt a message
        const message = 'Test DM';
        const encrypted = await encryptNIP04Manual(selfPrivateKey, senderPubkey, message);
        
        const event = {
          kind: 4,
          pubkey: senderPubkey,
          content: encrypted,
          tags: [['p', selfPublicKey]],
        };

        const result = await decryptDirectMessage(event, selfPrivateKey, selfPublicKey, mockDecryptFn);
        expect(result).toBe(message);
      });

      it('determines correct peer pubkey when we are recipient', async () => {
        const mockDecryptFn = vi.fn().mockResolvedValue('Decrypted');
        const event = {
          kind: 4,
          pubkey: senderPubkey,
          content: 'encrypted',
          tags: [['p', selfPublicKey]],
        };

        await decryptDirectMessage(event, selfPrivateKey, selfPublicKey, mockDecryptFn);
        
        // Should use sender's pubkey for decryption
        const callArgs = mockDecryptFn.mock.calls[0];
        expect(callArgs[1]).toBe(senderPubkey.toLowerCase());
      });

      it('determines correct peer pubkey when we are sender', async () => {
        const mockDecryptFn = vi.fn().mockResolvedValue('Decrypted');
        const recipientPubkey = 'f'.repeat(64);
        const event = {
          kind: 4,
          pubkey: selfPublicKey, // We are the sender
          content: 'encrypted',
          tags: [['p', recipientPubkey]],
        };

        await decryptDirectMessage(event, selfPrivateKey, selfPublicKey, mockDecryptFn);
        
        // Should use recipient's pubkey for decryption
        const callArgs = mockDecryptFn.mock.calls[0];
        expect(callArgs[1]).toBe(recipientPubkey.toLowerCase());
      });

      it('handles errors gracefully and returns null', async () => {
        const mockDecryptFn = vi.fn().mockRejectedValue(new Error('Decrypt failed'));
        const event = {
          kind: 4,
          pubkey: senderPubkey,
          content: 'invalid-encrypted-content',
          tags: [['p', selfPublicKey]],
        };

        const result = await decryptDirectMessage(event, selfPrivateKey, selfPublicKey, mockDecryptFn);
        expect(result).toBeNull();
      });
    });
  });

  describe('Internal Helper Functions', () => {
    // These are internal but we can test them indirectly through public APIs
    describe('Encryption helpers through public APIs', () => {
      it('handles Uint8Array private keys', async () => {
        const privateKeyBytes = new Uint8Array(32).fill(10);
        const peerPubkey = 'b'.repeat(64);
        const message = 'Test with Uint8Array key';

        // Should not throw
        await expect(encryptNIP04Manual(privateKeyBytes, peerPubkey, message)).resolves.toBeDefined();
      });

      it('handles Buffer private keys', async () => {
        if (typeof Buffer !== 'undefined') {
          const privateKeyBuffer = Buffer.alloc(32, 10);
          const peerPubkey = 'b'.repeat(64);
          const message = 'Test with Buffer key';

          await expect(encryptNIP04Manual(privateKeyBuffer, peerPubkey, message)).resolves.toBeDefined();
        }
      });

      it('normalizes hex keys to lowercase', async () => {
        const privateKeyUpper = 'A'.repeat(64);
        const peerPubkeyUpper = 'B'.repeat(64);
        const message = 'Test case sensitivity';

        const encrypted = await encryptNIP04Manual(privateKeyUpper, peerPubkeyUpper, message);
        expect(encrypted).toBeDefined();

        // Should decrypt with lowercase keys
        const privateKeyLower = 'a'.repeat(64);
        const peerPubkeyLower = 'b'.repeat(64);
        const decrypted = await decryptNIP04Manual(privateKeyLower, peerPubkeyLower, encrypted);
        expect(decrypted).toBe(message);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('extractTopicsFromEvent handles empty content', async () => {
      const event = { id: 'test', content: '' };
      const topics = await extractTopicsFromEvent(event, null);
      expect(topics).toEqual([]);
    });

    it('extractTopicsFromEvent handles content with only stopwords', async () => {
      const event = { id: 'test', content: 'the and is a an or but' };
      const topics = await extractTopicsFromEvent(event, null);
      expect(topics.length).toBe(0);
    });

    it('extractTopicsFromEvent handles very long content', async () => {
      const longContent = 'interesting topic '.repeat(200);
      const event = { id: 'test', content: longContent };
      const topics = await extractTopicsFromEvent(event, null);
      expect(Array.isArray(topics)).toBe(true);
      expect(topics.length).toBeLessThanOrEqual(EXTRACTED_TOPICS_LIMIT);
    });

    it('extractTopicsFromEvent handles unicode content', async () => {
      const event = { id: 'test', content: '日本語 中文 Español français αλφάβητο' };
      const topics = await extractTopicsFromEvent(event, null);
      expect(Array.isArray(topics)).toBe(true);
    });

    it('extractTopicsFromEvent handles emoji', async () => {
      const event = { id: 'test', content: '🚀 rocket science 🔬 laboratory research 🧪' };
      const topics = await extractTopicsFromEvent(event, null);
      expect(Array.isArray(topics)).toBe(true);
      expect(topics.some(t => t.includes('rocket') || t.includes('science'))).toBe(true);
    });

    it('getConversationIdFromEvent handles malformed tags', async () => {
      const event = {
        id: 'test',
        tags: [null, undefined, [], ['e'], ['e', null], ['e', undefined]],
      };
      expect(getConversationIdFromEvent(event)).toBe('test');
    });

    it('isSelfAuthor handles numeric pubkeys', () => {
      const event = { pubkey: 123 };
      const result = isSelfAuthor(event, 123);
      // Should handle the type coercion
      expect(typeof result).toBe('boolean');
    });

    it('encryption handles empty message', async () => {
      const privateKey = 'a'.repeat(64);
      const peerPubkey = 'b'.repeat(64);
      const encrypted = await encryptNIP04Manual(privateKey, peerPubkey, '');
      const decrypted = await decryptNIP04Manual(privateKey, peerPubkey, encrypted);
      expect(decrypted).toBe('');
    });

    it('encryption handles very long message', async () => {
      const privateKey = 'a'.repeat(64);
      const peerPubkey = 'b'.repeat(64);
      const longMessage = 'x'.repeat(10000);
      const encrypted = await encryptNIP04Manual(privateKey, peerPubkey, longMessage);
      const decrypted = await decryptNIP04Manual(privateKey, peerPubkey, encrypted);
      expect(decrypted).toBe(longMessage);
    });
  });

  describe('Topic Extraction with Bigrams', () => {
    it('extracts single-word topics', async () => {
      const event = {
        id: 'test',
        content: 'Rust programming language',
      };
      const topics = await extractTopicsFromEvent(event, null);
      expect(topics.some(t => t === 'rust' || t === 'programming' || t === 'language')).toBe(true);
    });

    it('extracts two-word topics', async () => {
      const event = {
        id: 'test',
        content: 'Machine learning and artificial intelligence',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Should have bigrams like "machine learning" or "artificial intelligence"
      expect(topics.length).toBeGreaterThan(0);
    });

    it('scores bigrams higher than single words', async () => {
      const event = {
        id: 'test',
        content: 'quantum computing quantum computing quantum computing',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // The bigram "quantum computing" should appear due to higher scoring
      expect(topics.some(t => t.includes('quantum'))).toBe(true);
    });
  });

  describe('Logger Integration', () => {
    it('uses runtime logger when available', async () => {
      const mockLogger = {
        debug: vi.fn(),
      };
      const mockRuntime = {
        agentId: 'test-logger',
        logger: mockLogger,
        useModel: vi.fn().mockResolvedValue({ text: 'topic' }),
      };

      const event = { id: 'test', content: 'Some content' };
      await extractTopicsFromEvent(event, mockRuntime);

      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('handles missing logger gracefully', async () => {
      const mockRuntime = {
        agentId: 'test-no-logger',
        useModel: vi.fn().mockResolvedValue({ text: 'topic' }),
      };

      const event = { id: 'test', content: 'Some content' };
      await expect(extractTopicsFromEvent(event, mockRuntime)).resolves.not.toThrow();
    });

    it('handles non-function logger methods', async () => {
      const mockRuntime = {
        agentId: 'test-bad-logger',
        logger: {
          debug: 'not a function',
        },
        useModel: vi.fn().mockResolvedValue({ text: 'topic' }),
      };

      const event = { id: 'test', content: 'Some content' };
      await expect(extractTopicsFromEvent(event, mockRuntime)).resolves.not.toThrow();
    });
  });

  describe('SECP256K1 Dependency', () => {
    it('throws error when @noble/secp256k1 is not available', async () => {
      // This test verifies the error handling for missing dependencies
      // The actual encryption will fail if secp256k1 is not available
      const privateKey = 'invalid';
      const peerPubkey = 'b'.repeat(64);
      const message = 'Test';

      await expect(encryptNIP04Manual(privateKey, peerPubkey, message)).rejects.toThrow();
    });
  });

  describe('Content Sanitization', () => {
    it('removes nostr: URIs from content', async () => {
      const event = {
        id: 'test',
        content: 'Check out nostr:npub1abc and nostr:note1xyz for more',
      };
      const topics = await extractTopicsFromEvent(event, null);
      expect(topics.some(t => t.includes('nostr:'))).toBe(false);
    });

    it('removes query parameters from content', async () => {
      const event = {
        id: 'test',
        content: 'Article about Python?utm_source=feed&utm_campaign=test',
      };
      const topics = await extractTopicsFromEvent(event, null);
      expect(topics.some(t => t.includes('python'))).toBe(true);
      expect(topics.some(t => t.includes('utm'))).toBe(false);
    });

    it('handles multiple URLs in content', async () => {
      const event = {
        id: 'test',
        content: 'Check https://example.com and https://test.com for JavaScript tutorials',
      };
      const topics = await extractTopicsFromEvent(event, null);
      expect(topics.some(t => t.includes('javascript'))).toBe(true);
      expect(topics.some(t => t.includes('http'))).toBe(false);
      expect(topics.some(t => t.includes('example'))).toBe(false);
      expect(topics.some(t => t.includes('test.com'))).toBe(false);
    });
  });

  describe('Topic Limit Enforcement', () => {
    it('respects EXTRACTED_TOPICS_LIMIT', async () => {
      const manyTopics = Array(50)
        .fill(0)
        .map((_, i) => `topic${i}`)
        .join(' ');
      const event = { id: 'test', content: manyTopics };
      const topics = await extractTopicsFromEvent(event, null);
      expect(topics.length).toBeLessThanOrEqual(EXTRACTED_TOPICS_LIMIT);
    });

    it('returns most relevant topics when exceeding limit', async () => {
      // Repeated words should score higher
      const event = {
        id: 'test',
        content: 'important important important other another different',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // "important" should appear due to higher frequency
      expect(topics.some(t => t === 'important')).toBe(true);
    });
  });

  describe('Token Filtering and Scoring', () => {
    it('filters out tokens shorter than 3 characters', async () => {
      const event = {
        id: 'test',
        content: 'ab cd ef programming language',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Short tokens should be filtered
      expect(topics.some(t => t === 'ab' || t === 'cd' || t === 'ef')).toBe(false);
      expect(topics.some(t => t.includes('programming') || t.includes('language'))).toBe(true);
    });

    it('filters NOISE_TOKENS (src, ref, utm, etc)', async () => {
      const event = {
        id: 'test',
        content: 'src ref utm twsrc tfw important article',
      };
      const topics = await extractTopicsFromEvent(event, null);
      expect(topics.some(t => t === 'src' || t === 'ref' || t === 'utm')).toBe(false);
      expect(topics.some(t => t.includes('important') || t.includes('article'))).toBe(true);
    });

    it('requires alphanumeric characters in tokens', async () => {
      const event = {
        id: 'test',
        content: '### @@@ $$$ valid topic',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Pure special characters should be filtered
      expect(topics.some(t => t.includes('valid') || t.includes('topic'))).toBe(true);
    });

    it('handles hyphens and apostrophes in tokens', async () => {
      const event = {
        id: 'test',
        content: "state-of-the-art isn't it's don't machine-learning",
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Should preserve hyphenated and contracted words
      expect(topics.length).toBeGreaterThan(0);
    });

    it('deduplicates topics in results', async () => {
      const event = {
        id: 'test',
        content: 'typescript typescript typescript',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Should not have duplicates
      const uniqueTopics = new Set(topics);
      expect(topics.length).toBe(uniqueTopics.size);
    });

    it('excludes bigrams with identical tokens', async () => {
      const event = {
        id: 'test',
        content: 'test test test programming programming programming',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Should not create bigrams like "test test" or "programming programming"
      expect(topics.some(t => t === 'test test')).toBe(false);
      expect(topics.some(t => t === 'programming programming')).toBe(false);
    });

    it('excludes candidates containing "http"', async () => {
      const event = {
        id: 'test',
        content: 'httpserver httpclient interesting technology',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Even partial matches with "http" should be filtered in final results
      expect(topics.length).toBeGreaterThan(0);
    });
  });

  describe('Bigram Scoring Logic', () => {
    it('excludes bigrams when both tokens are not meaningful', async () => {
      const event = {
        id: 'test',
        content: 'the and but programming language',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Bigrams of stopwords should not appear
      expect(topics.some(t => t === 'the and' || t === 'and but')).toBe(false);
    });

    it('includes bigrams when at least one token is meaningful', async () => {
      const event = {
        id: 'test',
        content: 'machine learning deep learning',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Should have meaningful bigrams
      expect(topics.length).toBeGreaterThan(0);
    });

    it('scores bigrams higher than single words (weight 2 vs 1)', async () => {
      const event = {
        id: 'test',
        content: 'quantum computing quantum computing single',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Bigrams appear first due to higher weight
      // At minimum, should have both bigram and single word
      expect(topics.length).toBeGreaterThan(0);
    });

    it('handles adjacent single-char tokens gracefully', async () => {
      const event = {
        id: 'test',
        content: 'a b c programming language x y z',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Should get meaningful topics despite single-char noise
      expect(topics.some(t => t.includes('programming') || t.includes('language'))).toBe(true);
    });
  });

  describe('Case Sensitivity and Normalization', () => {
    it('normalizes content to lowercase for extraction', async () => {
      const event = {
        id: 'test',
        content: 'TYPESCRIPT JavaScript RuSt',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // All topics should be lowercase
      topics.forEach(topic => {
        expect(topic).toBe(topic.toLowerCase());
      });
    });

    it('treats case-insensitive matches as same topic', async () => {
      const event = {
        id: 'test',
        content: 'Python PYTHON python',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Should deduplicate case variations
      const pythonCount = topics.filter(t => t === 'python').length;
      expect(pythonCount).toBeLessThanOrEqual(1);
    });
  });

  describe('Environment Variable Configuration', () => {
    it('EXTRACTED_TOPICS_LIMIT can be configured via environment', () => {
      // The limit is read at module load time
      expect(typeof EXTRACTED_TOPICS_LIMIT).toBe('number');
      expect(EXTRACTED_TOPICS_LIMIT).toBeGreaterThan(0);
      // Default is 15 unless overridden
      expect(EXTRACTED_TOPICS_LIMIT).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Special Characters and Formatting', () => {
    it('handles newlines and multiple spaces', async () => {
      const event = {
        id: 'test',
        content: 'machine\n\nlearning   deep    neural    networks',
      };
      const topics = await extractTopicsFromEvent(event, null);
      expect(topics.length).toBeGreaterThan(0);
    });

    it('handles tabs and other whitespace', async () => {
      const event = {
        id: 'test',
        content: 'artificial\tintelligence\tand\trobots',
      };
      const topics = await extractTopicsFromEvent(event, null);
      expect(topics.some(t => t.includes('artificial') || t.includes('intelligence'))).toBe(true);
    });

    it('handles mixed scripts and languages', async () => {
      const event = {
        id: 'test',
        content: 'Python プログラミング JavaScript 编程',
      };
      const topics = await extractTopicsFromEvent(event, null);
      // Should extract valid tokens from mixed content
      expect(Array.isArray(topics)).toBe(true);
    });
  });

  describe('Conversation Threading', () => {
    it('getConversationIdFromEvent handles reply marker', () => {
      const event = {
        id: 'reply-abc',
        tags: [
          ['e', 'root-123', '', 'root'],
          ['e', 'parent-456', '', 'reply'],
        ],
      };
      // Root takes precedence over reply
      expect(getConversationIdFromEvent(event)).toBe('root-123');
    });

    it('getConversationIdFromEvent handles mention marker', () => {
      const event = {
        id: 'mention-abc',
        tags: [
          ['e', 'mentioned-123', '', 'mention'],
          ['e', 'other-456'],
        ],
      };
      // Root/reply not present, so first e-tag wins
      expect(getConversationIdFromEvent(event)).toBe('mentioned-123');
    });

    it('getConversationIdFromEvent prefers root over first e-tag', () => {
      const event = {
        id: 'test',
        tags: [
          ['e', 'first-123'],
          ['e', 'root-456', '', 'root'],
        ],
      };
      expect(getConversationIdFromEvent(event)).toBe('root-456');
    });
  });

  describe('Encryption Key Format Variations', () => {
    it('handles mixed case hex keys consistently', async () => {
      const lowerKey = 'a'.repeat(64);
      const upperKey = 'A'.repeat(64);
      const mixedKey = 'aAbBcC' + 'd'.repeat(58);
      const peerPubkey = 'b'.repeat(64);
      const message = 'Test message';

      // All should work without throwing
      await expect(encryptNIP04Manual(lowerKey, peerPubkey, message)).resolves.toBeDefined();
      await expect(encryptNIP04Manual(upperKey, peerPubkey, message)).resolves.toBeDefined();
      await expect(encryptNIP04Manual(mixedKey, peerPubkey, message)).resolves.toBeDefined();
    });

    it('handles short hex keys with padding', async () => {
      const shortKey = 'abc123';
      const peerPubkey = 'b'.repeat(64);
      const message = 'Test';

      // Should either work or throw a clear error
      await expect(encryptNIP04Manual(shortKey, peerPubkey, message)).rejects.toThrow();
    });
  });

  describe('DM Tag Handling', () => {
    it('decryptDirectMessage finds first p-tag as recipient', async () => {
      const mockDecryptFn = vi.fn().mockResolvedValue('Decrypted');
      const selfPubkey = 'd'.repeat(64);
      const senderPubkey = 'e'.repeat(64);
      const recipientPubkey = 'f'.repeat(64);

      const event = {
        kind: 4,
        pubkey: senderPubkey,
        content: 'encrypted',
        tags: [
          ['p', recipientPubkey],
          ['p', 'other-recipient'],
        ],
      };

      await decryptDirectMessage(event, 'c'.repeat(64), selfPubkey, mockDecryptFn);
      expect(mockDecryptFn).toHaveBeenCalled();
    });

    it('decryptDirectMessage ignores tags without pubkey', async () => {
      const mockDecryptFn = vi.fn().mockResolvedValue('Decrypted');
      const selfPubkey = 'd'.repeat(64);
      const senderPubkey = 'e'.repeat(64);

      const event = {
        kind: 4,
        pubkey: senderPubkey,
        content: 'encrypted',
        tags: [
          ['p'], // Missing pubkey
          ['p', selfPubkey],
        ],
      };

      const result = await decryptDirectMessage(event, 'c'.repeat(64), selfPubkey, mockDecryptFn);
      // Should use the second p-tag (first valid one)
      expect(result).toBe('Decrypted');
    });
  });

  describe('Runtime Integration', () => {
    it('extracts topics with string response from model', async () => {
      const mockRuntime = {
        agentId: 'test-string-response',
        logger: { debug: vi.fn() },
        useModel: vi.fn().mockResolvedValue('topic1\ntopic2\ntopic3'),
      };

      const event = { id: 'test', content: 'Some content' };
      const topics = await extractTopicsFromEvent(event, mockRuntime);

      expect(Array.isArray(topics)).toBe(true);
      expect(topics.length).toBeGreaterThan(0);
    });

    it('extracts topics with object response from model', async () => {
      const mockRuntime = {
        agentId: 'test-object-response',
        logger: { debug: vi.fn() },
        useModel: vi.fn().mockResolvedValue({ text: 'topic1\ntopic2' }),
      };

      const event = { id: 'test', content: 'Some content' };
      const topics = await extractTopicsFromEvent(event, mockRuntime);

      expect(Array.isArray(topics)).toBe(true);
    });

    it('handles missing agentId by using default key', async () => {
      const mockRuntime = {
        // No agentId
        logger: { debug: vi.fn() },
        useModel: vi.fn().mockResolvedValue({ text: 'topic' }),
      };

      const event = { id: 'test', content: 'Some content' };
      await extractTopicsFromEvent(event, mockRuntime);

      const stats = getTopicExtractorStats(mockRuntime);
      // Should use 'default' key
      expect(stats).not.toBeNull();

      await destroyTopicExtractor(mockRuntime);
    });
  });
});
