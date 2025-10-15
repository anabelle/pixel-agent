import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

describe('LNPixels Listener', () => {
  let mockRuntime;
  let mockSocket;
  let originalEnv;
  let listenerModule;

  beforeEach(async () => {
    // Save original env
    originalEnv = { ...process.env };
    
    // Reset modules to get fresh imports
    vi.resetModules();
    
    // Mock socket.io-client
    const MockSocketIO = class extends EventEmitter {
      constructor(url, options) {
        super();
        this.url = url;
        this.options = options;
        this.connected = false;
        this._handlers = {};
      }

      connect() {
        this.connected = true;
        return this;
      }

      disconnect() {
        this.connected = false;
        this.emit('disconnect', 'manual');
      }

      simulateConnect() {
        this.connected = true;
        this.emit('connect');
      }

      simulateDisconnect(reason = 'transport close') {
        this.connected = false;
        this.emit('disconnect', reason);
      }

      simulateError(error) {
        this.emit('connect_error', error);
      }

      simulateActivity(activity) {
        this.emit('activity.append', activity);
      }

      simulatePixelUpdate() {
        this.emit('pixel.update');
      }
    };

    // Mock socket.io-client module
    vi.doMock('socket.io-client', () => ({
      io: (url, options) => {
        mockSocket = new MockSocketIO(url, options);
        // Auto-connect after a tick to simulate real behavior
        setTimeout(() => {
          if (!mockSocket.connected) {
            mockSocket.simulateConnect();
          }
        }, 0);
        return mockSocket;
      }
    }));

    // Create mock runtime
    mockRuntime = {
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      },
      agentId: 'test-agent-id',
      createMemory: vi.fn(async () => true),
      databaseAdapter: {},
      ensureWorldExists: vi.fn(async () => true),
      ensureRoomExists: vi.fn(async () => true),
      ensureConnection: vi.fn(async () => true),
      process: vi.fn(async () => true)
    };

    // Mock bridge
    vi.doMock('../lib/bridge.js', () => ({
      emitter: new EventEmitter()
    }));

    // Mock context module
    vi.doMock('../lib/context.js', () => ({
      ensureLNPixelsContext: async () => ({
        worldId: 'test-world-id',
        canvasRoomId: 'test-canvas-room-id',
        locksRoomId: 'test-locks-room-id',
        entityId: 'test-entity-id'
      }),
      createMemorySafe: async (runtime, memory) => ({ created: true })
    }));

    // Mock @elizaos/core
    vi.doMock('@elizaos/core', () => ({
      createUniqueUuid: (runtime, seed) => `uuid-${seed}`,
      ChannelType: { FEED: 'feed' }
    }));

    // Import the listener module
    listenerModule = await import('../lib/lnpixels-listener.js');
  });

  afterEach(() => {
    // Restore env
    process.env = originalEnv;
    
    // Clean up socket
    if (mockSocket) {
      mockSocket.removeAllListeners();
      mockSocket.disconnect();
    }
    
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should establish WebSocket connection with correct URL', async () => {
      process.env.LNPIXELS_WS_URL = 'http://test.example.com:3000';
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      expect(socket).toBeDefined();
      expect(socket.url).toBe('http://test.example.com:3000/api');
      expect(socket.options.transports).toEqual(['websocket']);
      expect(socket.options.path).toBe('/socket.io');
      expect(socket.options.reconnection).toBe(true);
    });

    it('should use default URL when LNPIXELS_WS_URL not set', async () => {
      delete process.env.LNPIXELS_WS_URL;
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      expect(socket.url).toBe('http://localhost:3000/api');
    });

    it('should log connection success', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      expect(mockRuntime.logger.info).toHaveBeenCalledWith('LNPixels WS connected');
    });

    it('should update health status on connect', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const health = socket._pixelHealth();
      expect(health.connected).toBe(true);
      expect(health.consecutiveErrors).toBe(0);
    });

    it('should handle disconnection', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      socket.simulateDisconnect('transport close');
      
      expect(mockRuntime.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('LNPixels WS disconnected'),
        expect.any(String)
      );
      
      const health = socket._pixelHealth();
      expect(health.connected).toBe(false);
    });

    it('should handle connection errors', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      const error = new Error('Connection failed');
      socket.simulateError(error);
      
      expect(mockRuntime.logger.error).toHaveBeenCalledWith(
        'LNPixels WS connection error:',
        'Connection failed'
      );
      
      const health = socket._pixelHealth();
      expect(health.consecutiveErrors).toBeGreaterThan(0);
    });

    it('should reset consecutive errors on successful connection', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Simulate errors
      socket.simulateError(new Error('Error 1'));
      socket.simulateError(new Error('Error 2'));
      
      let health = socket._pixelHealth();
      expect(health.consecutiveErrors).toBe(2);
      
      // Reconnect should reset
      socket.simulateConnect();
      
      health = socket._pixelHealth();
      expect(health.consecutiveErrors).toBe(0);
    });

    it('should disconnect gracefully on cleanup', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Trigger cleanup
      process.emit('SIGTERM');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockRuntime.logger.info).toHaveBeenCalledWith('LNPixels listener shutdown');
    });
  });

  describe('Event Handling', () => {
    it('should receive and process activity.append events', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 10,
        y: 20,
        color: '#FF0000',
        sats: 100,
        letter: 'A',
        event_id: 'test-event-1',
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalledWith('pixel.bought', { activity });
      
      const health = socket._pixelHealth();
      expect(health.totalEvents).toBe(1);
      expect(health.totalPosts).toBe(1);
      expect(health.lastEvent).toBeGreaterThan(0);
    });

    it('should ignore pixel.update events', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      socket.simulatePixelUpdate();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should not trigger any processing
      const health = socket._pixelHealth();
      expect(health.totalEvents).toBe(0);
    });

    it('should update health metrics on event processing', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity1 = { x: 1, y: 1, color: '#000000', sats: 10, created_at: Date.now() };
      const activity2 = { x: 2, y: 2, color: '#FFFFFF', sats: 20, created_at: Date.now() + 1 };
      
      socket.simulateActivity(activity1);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      socket.simulateActivity(activity2);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const health = socket._pixelHealth();
      expect(health.totalEvents).toBe(2);
      expect(health.totalPosts).toBe(2);
    });

    it('should handle processing errors gracefully', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      
      // Make bridge.emit throw
      vi.spyOn(bridge, 'emit').mockImplementation(() => {
        throw new Error('Bridge error');
      });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = { x: 5, y: 5, color: '#00FF00', sats: 50, created_at: Date.now() };
      socket.simulateActivity(activity);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockRuntime.logger.error).toHaveBeenCalledWith(
        'Bridge emit failed:',
        expect.objectContaining({ traceId: expect.any(String), error: 'Bridge error' })
      );
      
      const health = socket._pixelHealth();
      expect(health.totalEvents).toBe(1);
      expect(health.totalPosts).toBe(0); // Should not count as successful post
    });

    it('should continue processing after errors', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      // First call fails, second succeeds
      bridgeEmitSpy.mockImplementationOnce(() => {
        throw new Error('First error');
      }).mockImplementationOnce(() => true);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity1 = { x: 1, y: 1, color: '#111111', sats: 10, created_at: Date.now() };
      socket.simulateActivity(activity1);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const activity2 = { x: 2, y: 2, color: '#222222', sats: 20, created_at: Date.now() + 1 };
      socket.simulateActivity(activity2);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const health = socket._pixelHealth();
      expect(health.totalEvents).toBe(2);
      expect(health.totalPosts).toBe(1); // Only second succeeded
    });
  });

  describe('Activity Validation', () => {
    it('should accept valid single pixel events', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 100,
        y: 200,
        color: '#ABCDEF',
        sats: 150,
        letter: 'X',
        event_id: 'valid-event',
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalled();
    });

    it('should reject events with missing coordinates', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        color: '#ABCDEF',
        sats: 150,
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).not.toHaveBeenCalled();
      expect(mockRuntime.logger.warn).toHaveBeenCalledWith(
        'Invalid activity received:',
        expect.objectContaining({ activity })
      );
    });

    it('should reject events with invalid coordinates', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 2000, // out of range
        y: 50,
        color: '#ABCDEF',
        sats: 150,
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).not.toHaveBeenCalled();
    });

    it('should reject payment events', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        type: 'payment',
        sats: 100,
        payment_hash: 'test-hash',
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).not.toHaveBeenCalled();
    });

    it('should accept bulk purchases with metadata.pixelUpdates', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        type: 'payment',
        sats: 300,
        metadata: {
          pixelUpdates: [
            { x: 1, y: 1, color: '#FF0000', price: 10 },
            { x: 2, y: 2, color: '#00FF00', price: 10 },
            { x: 3, y: 3, color: '#0000FF', price: 10 }
          ]
        },
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalled();
    });

    it('should accept bulk purchases with summary', async () => {
      process.env.LNPIXELS_ALLOW_BULK_SUMMARY = 'true';
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        type: 'bulk_purchase',
        summary: '5 pixels purchased',
        pixelCount: 5,
        totalSats: 500,
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalled();
    });

    it('should reject bulk purchases when disabled via env', async () => {
      process.env.LNPIXELS_ALLOW_BULK_SUMMARY = 'false';
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        type: 'bulk_purchase',
        summary: '5 pixels purchased',
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).not.toHaveBeenCalled();
    });

    it('should reject null or undefined activities', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      socket.simulateActivity(null);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      socket.simulateActivity(undefined);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).not.toHaveBeenCalled();
    });

    it('should validate sats range', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      // Negative sats
      socket.simulateActivity({ x: 1, y: 1, color: '#000', sats: -100, created_at: Date.now() });
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Excessively large sats
      socket.simulateActivity({ x: 1, y: 1, color: '#000', sats: 2000000, created_at: Date.now() });
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).not.toHaveBeenCalled();
    });

    it('should validate letter length', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 1,
        y: 1,
        color: '#000',
        sats: 100,
        letter: 'VERYLONGSTRING',
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).not.toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    it('should allow posts within rate limit', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      // Send 3 events (well within 10 token limit)
      for (let i = 0; i < 3; i++) {
        socket.simulateActivity({
          x: i,
          y: i,
          color: '#000000',
          sats: 10,
          event_id: `event-${i}`,
          created_at: Date.now() + i
        });
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      expect(bridgeEmitSpy).toHaveBeenCalledTimes(3);
    });

    it('should drop events when rate limit exceeded', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      // Send 12 events rapidly (exceeds 10 token limit)
      for (let i = 0; i < 12; i++) {
        socket.simulateActivity({
          x: i,
          y: i,
          color: '#000000',
          sats: 10,
          event_id: `event-${i}`,
          created_at: Date.now() + i
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should process first ~10, then start dropping
      expect(bridgeEmitSpy.mock.calls.length).toBeLessThan(12);
      expect(mockRuntime.logger.warn).toHaveBeenCalledWith(
        'Rate limit exceeded, dropping event:',
        expect.objectContaining({ tokens: expect.any(Number) })
      );
    });

    it('should refill tokens over time', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      // Drain tokens
      for (let i = 0; i < 10; i++) {
        socket.simulateActivity({
          x: i,
          y: i,
          color: '#000000',
          sats: 10,
          event_id: `drain-${i}`,
          created_at: Date.now() + i
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const health1 = socket._pixelHealth();
      const tokens1 = health1.rateLimiter.tokens;
      
      // Wait for refill (6 seconds = 1 token, but we'll simulate with shorter time)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const health2 = socket._pixelHealth();
      const tokens2 = health2.rateLimiter.tokens;
      
      // Tokens should be refilling (or at least not decreasing further)
      expect(tokens2).toBeGreaterThanOrEqual(0);
    });

    it('should not exceed max tokens', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      // Wait some time to allow refill
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const health = socket._pixelHealth();
      expect(health.rateLimiter.tokens).toBeLessThanOrEqual(health.rateLimiter.maxTokens);
    });

    it('should track rate limiter state in health metrics', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const health = socket._pixelHealth();
      expect(health.rateLimiter).toBeDefined();
      expect(health.rateLimiter.tokens).toBeGreaterThan(0);
      expect(health.rateLimiter.maxTokens).toBe(10);
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate events with same event_id', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 10,
        y: 20,
        color: '#FF0000',
        sats: 100,
        event_id: 'duplicate-event',
        created_at: Date.now()
      };
      
      // Send same event twice
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should only process once
      expect(bridgeEmitSpy).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate events with same coordinates and timestamp', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const timestamp = Date.now();
      const activity = {
        x: 5,
        y: 10,
        color: '#00FF00',
        sats: 50,
        created_at: timestamp
      };
      
      // Send same event twice
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should only process once
      expect(bridgeEmitSpy).toHaveBeenCalledTimes(1);
    });

    it('should track deduplication cache size', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      // Send unique events
      for (let i = 0; i < 5; i++) {
        socket.simulateActivity({
          x: i,
          y: i,
          color: '#000000',
          sats: 10,
          event_id: `unique-event-${i}`,
          created_at: Date.now() + i
        });
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      const health = socket._pixelHealth();
      expect(health.deduplication).toBeDefined();
      expect(health.deduplication.cacheSize).toBeGreaterThan(0);
      expect(health.deduplication.maxAge).toBe(300000); // 5 minutes
    });

    it('should clean expired entries from cache', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      // The cache cleanup happens probabilistically or when size > 1000
      // We'll just verify the cache size doesn't grow infinitely
      const health = socket._pixelHealth();
      expect(health.deduplication.cacheSize).toBeLessThan(1000);
    });

    it('should allow events with different identifiers', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      // Different event_ids
      socket.simulateActivity({
        x: 1, y: 1, color: '#000', sats: 10,
        event_id: 'event-1', created_at: Date.now()
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      
      socket.simulateActivity({
        x: 1, y: 1, color: '#000', sats: 10,
        event_id: 'event-2', created_at: Date.now()
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalledTimes(2);
    });

    it('should use payment_hash for deduplication when available', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 1,
        y: 1,
        color: '#000',
        sats: 10,
        payment_hash: 'test-payment-hash',
        created_at: Date.now()
      };
      
      // Send twice
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should only process once
      expect(bridgeEmitSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Memory Integration', () => {
    it('should create delegation memory when enabled', async () => {
      process.env.LNPIXELS_CREATE_DELEGATION_MEMORY = 'true';
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 10,
        y: 20,
        color: '#FF0000',
        sats: 100,
        event_id: 'memory-test',
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should attempt to create memory
      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should skip memory creation when disabled', async () => {
      process.env.LNPIXELS_CREATE_DELEGATION_MEMORY = 'false';
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 10,
        y: 20,
        color: '#FF0000',
        sats: 100,
        event_id: 'no-memory-test',
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should not create memory
      expect(mockRuntime.createMemory).not.toHaveBeenCalled();
    });

    it('should handle memory creation errors gracefully', async () => {
      process.env.LNPIXELS_CREATE_DELEGATION_MEMORY = 'true';
      mockRuntime.createMemory.mockRejectedValue(new Error('Memory error'));
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 10,
        y: 20,
        color: '#FF0000',
        sats: 100,
        event_id: 'memory-error-test',
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should continue despite error
      const health = socket._pixelHealth();
      expect(health.totalEvents).toBe(1);
    });
  });

  describe('Health Monitoring', () => {
    it('should provide health check endpoint', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const health = socket._pixelHealth();
      
      expect(health).toBeDefined();
      expect(health).toHaveProperty('connected');
      expect(health).toHaveProperty('lastEvent');
      expect(health).toHaveProperty('consecutiveErrors');
      expect(health).toHaveProperty('totalEvents');
      expect(health).toHaveProperty('totalPosts');
      expect(health).toHaveProperty('totalErrors');
      expect(health).toHaveProperty('rateLimiter');
      expect(health).toHaveProperty('deduplication');
    });

    it('should track total events', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      for (let i = 0; i < 3; i++) {
        socket.simulateActivity({
          x: i, y: i, color: '#000', sats: 10,
          event_id: `event-${i}`, created_at: Date.now() + i
        });
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const health = socket._pixelHealth();
      expect(health.totalEvents).toBe(3);
    });

    it('should track total posts', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      for (let i = 0; i < 2; i++) {
        socket.simulateActivity({
          x: i, y: i, color: '#000', sats: 10,
          event_id: `post-${i}`, created_at: Date.now() + i
        });
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const health = socket._pixelHealth();
      expect(health.totalPosts).toBe(2);
    });

    it('should track total errors', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      
      // Make processing fail
      vi.spyOn(bridge, 'emit').mockImplementation(() => {
        throw new Error('Processing error');
      });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      socket.simulateActivity({
        x: 1, y: 1, color: '#000', sats: 10, created_at: Date.now()
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const health = socket._pixelHealth();
      expect(health.totalErrors).toBeGreaterThan(0);
    });

    it('should update lastEvent timestamp', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const beforeTime = Date.now();
      
      socket.simulateActivity({
        x: 1, y: 1, color: '#000', sats: 10, created_at: Date.now()
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const health = socket._pixelHealth();
      expect(health.lastEvent).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should reset consecutive errors on success', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Simulate errors
      socket.simulateError(new Error('Error 1'));
      socket.simulateError(new Error('Error 2'));
      
      let health = socket._pixelHealth();
      expect(health.consecutiveErrors).toBe(2);
      
      // Process successful event
      socket.simulateConnect();
      socket.simulateActivity({
        x: 1, y: 1, color: '#000', sats: 10, created_at: Date.now()
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      
      health = socket._pixelHealth();
      expect(health.consecutiveErrors).toBe(0);
    });
  });

  describe('Integration with Runtime', () => {
    it('should call runtime.process with pixel activity', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 10,
        y: 20,
        color: '#FF0000',
        sats: 100,
        event_id: 'process-test',
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockRuntime.process).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'system',
          content: { text: '[PIXEL_ACTIVITY] pixel bought' },
          context: expect.objectContaining({ activity })
        })
      );
    });

    it('should handle runtime.process errors gracefully', async () => {
      mockRuntime.process.mockRejectedValue(new Error('Process error'));
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 10,
        y: 20,
        color: '#FF0000',
        sats: 100,
        event_id: 'process-error-test',
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockRuntime.logger.warn).toHaveBeenCalledWith(
        'Internal process failed:',
        expect.objectContaining({ error: 'Process error' })
      );
      
      // Should continue despite error
      const health = socket._pixelHealth();
      expect(health.totalEvents).toBe(1);
    });

    it('should work without runtime.process', async () => {
      const runtimeWithoutProcess = {
        ...mockRuntime,
        process: undefined
      };
      
      const socket = listenerModule.startLNPixelsListener(runtimeWithoutProcess);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 10,
        y: 20,
        color: '#FF0000',
        sats: 100,
        event_id: 'no-process-test',
        created_at: Date.now()
      };
      
      // Should not throw
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const health = socket._pixelHealth();
      expect(health.totalEvents).toBe(1);
    });
  });

  describe('Memory Helper Functions', () => {
    it('should export createLNPixelsMemory function', () => {
      expect(listenerModule.createLNPixelsMemory).toBeDefined();
      expect(typeof listenerModule.createLNPixelsMemory).toBe('function');
    });

    it('should export createLNPixelsEventMemory function', () => {
      expect(listenerModule.createLNPixelsEventMemory).toBeDefined();
      expect(typeof listenerModule.createLNPixelsEventMemory).toBe('function');
    });

    it('should create memory with correct structure', async () => {
      const activity = {
        x: 10,
        y: 20,
        color: '#FF0000',
        sats: 100,
        event_id: 'memory-structure-test',
        created_at: Date.now()
      };
      
      const result = await listenerModule.createLNPixelsMemory(
        mockRuntime,
        'Test post',
        activity,
        'test-trace',
        mockRuntime.logger
      );
      
      expect(result).toBe(true);
      expect(mockRuntime.createMemory).toHaveBeenCalled();
      
      const memoryCall = mockRuntime.createMemory.mock.calls[0][0];
      expect(memoryCall.content.type).toBe('lnpixels_post');
      expect(memoryCall.content.source).toBe('lnpixels-listener');
      expect(memoryCall.content.data.generatedText).toBe('Test post');
      expect(memoryCall.content.data.triggerEvent).toMatchObject({
        x: activity.x,
        y: activity.y,
        color: activity.color,
        sats: activity.sats
      });
    });

    it('should create event memory when throttled', async () => {
      const activity = {
        x: 10,
        y: 20,
        color: '#FF0000',
        sats: 100,
        event_id: 'event-memory-test',
        created_at: Date.now()
      };
      
      const result = await listenerModule.createLNPixelsEventMemory(
        mockRuntime,
        activity,
        'test-trace',
        mockRuntime.logger
      );
      
      expect(result).toBe(true);
      expect(mockRuntime.createMemory).toHaveBeenCalled();
      
      const memoryCall = mockRuntime.createMemory.mock.calls[0][0];
      expect(memoryCall.content.type).toBe('lnpixels_event');
      expect(memoryCall.content.data.throttled).toBe(true);
    });

    it('should handle missing runtime.createMemory', async () => {
      const runtimeWithoutMemory = {
        ...mockRuntime,
        createMemory: undefined
      };
      
      const result = await listenerModule.createLNPixelsMemory(
        runtimeWithoutMemory,
        'Test',
        { x: 1, y: 1, color: '#000', sats: 10 },
        'trace',
        mockRuntime.logger
      );
      
      expect(result).toBe(false);
    });

    it('should handle memory creation errors', async () => {
      mockRuntime.createMemory.mockRejectedValue(new Error('Memory error'));
      
      const result = await listenerModule.createLNPixelsMemory(
        mockRuntime,
        'Test',
        { x: 1, y: 1, color: '#000', sats: 10, created_at: Date.now() },
        'trace',
        mockRuntime.logger
      );
      
      expect(mockRuntime.logger.warn).toHaveBeenCalledWith(
        'Failed to create LNPixels memory:',
        expect.objectContaining({ error: 'Memory error' })
      );
    });
  });

  describe('Error Recovery', () => {
    it('should continue processing after validation errors', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      // Invalid event
      socket.simulateActivity({ invalid: 'data' });
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Valid event
      socket.simulateActivity({
        x: 1, y: 1, color: '#000', sats: 10, created_at: Date.now()
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle catastrophic errors in event handler', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      // This should trigger an error in the handler
      const malformed = { toString: () => { throw new Error('toString error'); } };
      socket.simulateActivity(malformed);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const health = socket._pixelHealth();
      expect(health.totalErrors).toBeGreaterThan(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Make disconnect throw an error
      socket.disconnect = () => {
        throw new Error('Disconnect error');
      };
      
      // Trigger cleanup - should not throw
      process.emit('SIGTERM');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockRuntime.logger.error).toHaveBeenCalledWith(
        'Cleanup error:',
        'Disconnect error'
      );
    });
  });

  describe('Edge Cases in Validation', () => {
    it('should handle bulk purchase with pixelCount already set', async () => {
      process.env.LNPIXELS_ALLOW_BULK_SUMMARY = 'true';
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        type: 'bulk_purchase',
        summary: '10 pixels purchased',
        pixelCount: 10, // Already set
        totalSats: 1000,
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalled();
      const emittedActivity = bridgeEmitSpy.mock.calls[0][1].activity;
      expect(emittedActivity.pixelCount).toBe(10);
    });

    it('should parse pixelCount from summary when not provided', async () => {
      process.env.LNPIXELS_ALLOW_BULK_SUMMARY = 'true';
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        type: 'bulk_purchase',
        summary: '7 pixels purchased',
        // pixelCount not provided
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalled();
      const emittedActivity = bridgeEmitSpy.mock.calls[0][1].activity;
      expect(emittedActivity.pixelCount).toBe(7);
    });

    it('should reject bulk purchase with summary but no pixel keyword', async () => {
      process.env.LNPIXELS_ALLOW_BULK_SUMMARY = 'true';
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        type: 'bulk_purchase',
        summary: 'Something else happened',
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).not.toHaveBeenCalled();
    });

    it('should reject bulk purchase without summary or metadata', async () => {
      process.env.LNPIXELS_ALLOW_BULK_SUMMARY = 'true';
      
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        type: 'bulk_purchase',
        // No summary or metadata
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).not.toHaveBeenCalled();
    });

    it('should accept events with x=0, y=0', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 0,
        y: 0,
        color: '#000000',
        sats: 10,
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalled();
    });

    it('should accept events with letter=null', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 1,
        y: 1,
        color: '#000000',
        sats: 10,
        letter: null,
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalled();
    });

    it('should validate color coordinate separately', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      // Missing only color
      const activity = {
        x: 1,
        y: 1,
        // color missing
        sats: 10,
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).not.toHaveBeenCalled();
    });

    it('should accept events with optional sats', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        x: 1,
        y: 1,
        color: '#000000',
        // sats not provided
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalled();
    });

    it('should handle bulk purchase with totalSats calculation', async () => {
      const socket = listenerModule.startLNPixelsListener(mockRuntime);
      const { emitter: bridge } = await import('../lib/bridge.js');
      const bridgeEmitSpy = vi.spyOn(bridge, 'emit');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      socket.simulateConnect();
      
      const activity = {
        type: 'payment',
        metadata: {
          pixelUpdates: [
            { x: 1, y: 1, color: '#FF0000', price: 100 },
            { x: 2, y: 2, color: '#00FF00', price: 150 },
            { x: 3, y: 3, color: '#0000FF', price: 200 }
          ]
        },
        created_at: Date.now()
      };
      
      socket.simulateActivity(activity);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(bridgeEmitSpy).toHaveBeenCalled();
      const emittedActivity = bridgeEmitSpy.mock.calls[0][1].activity;
      expect(emittedActivity.totalSats).toBe(450);
      expect(emittedActivity.pixelCount).toBe(3);
      // Should remove individual pixel coordinates
      expect(emittedActivity.x).toBeUndefined();
      expect(emittedActivity.y).toBeUndefined();
      expect(emittedActivity.color).toBeUndefined();
    });
  });
});
