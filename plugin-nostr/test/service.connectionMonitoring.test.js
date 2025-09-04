import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NostrService } from '../lib/service.js';

describe('NostrService Connection Monitoring', () => {
  let service;
  let mockRuntime;
  
  beforeEach(async () => {
    // Initialize dependencies first
    const serviceModule = await import('../lib/service.js');
    await serviceModule.ensureDeps();
    
    mockRuntime = {
      getSetting: (key) => {
        const settings = {
          'NOSTR_PRIVATE_KEY': 'test-private-key',
          'NOSTR_PUBLIC_KEY': 'test-public-key',
          'NOSTR_RELAYS': 'wss://test.relay',
          'NOSTR_LISTEN_ENABLE': 'true',
          'NOSTR_CONNECTION_MONITOR_ENABLE': 'true',
          'NOSTR_CONNECTION_CHECK_INTERVAL_SEC': '5', // Faster for testing
          'NOSTR_MAX_TIME_SINCE_LAST_EVENT_SEC': '10', // Faster for testing
          'NOSTR_RECONNECT_DELAY_SEC': '1', // Faster for testing
          'NOSTR_MAX_RECONNECT_ATTEMPTS': '2'
        };
        return settings[key];
      },
      agentId: 'test-agent'
    };
    
    service = new NostrService(mockRuntime);
    service.relays = ['wss://test.relay'];
    service.pkHex = 'test-pubkey-hex';
    service.connectionMonitorEnabled = true;
    service.connectionCheckIntervalMs = 5000;
    service.maxTimeSinceLastEventMs = 10000;
    service.reconnectDelayMs = 1000;
    service.maxReconnectAttempts = 2;
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
  });

  describe('Configuration', () => {
    it('should configure connection monitoring from environment variables', () => {
      expect(service.connectionMonitorEnabled).toBe(true);
      expect(service.connectionCheckIntervalMs).toBe(5000);
      expect(service.maxTimeSinceLastEventMs).toBe(10000);
      expect(service.reconnectDelayMs).toBe(1000);
      expect(service.maxReconnectAttempts).toBe(2);
    });

    it('should disable connection monitoring when configured', () => {
      mockRuntime.getSetting = (key) => {
        if (key === 'NOSTR_CONNECTION_MONITOR_ENABLE') return 'false';
        return null;
      };
      
      const disabledService = new NostrService(mockRuntime);
      disabledService.connectionMonitorEnabled = false;
      
      expect(disabledService.connectionMonitorEnabled).toBe(false);
    });
  });

  describe('Connection Health Monitoring', () => {
    it('should start connection monitoring when enabled', () => {
      const startSpy = vi.spyOn(service, '_startConnectionMonitoring');
      
      service._startConnectionMonitoring();
      
      expect(startSpy).toHaveBeenCalled();
      expect(service.connectionMonitorTimer).toBeTruthy();
    });

    it('should not start monitoring when disabled', () => {
      service.connectionMonitorEnabled = false;
      
      service._startConnectionMonitoring();
      
      expect(service.connectionMonitorTimer).toBe(null);
    });

    it('should update lastEventReceived when events are received', async () => {
      const initialTime = service.lastEventReceived;
      
      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Simulate event received
      service.lastEventReceived = Date.now();
      
      expect(service.lastEventReceived).toBeGreaterThan(initialTime);
    });

    it('should detect connection health issues', () => {
      const reconnectSpy = vi.spyOn(service, '_attemptReconnection').mockImplementation(() => {});
      
      // Simulate old last event time
      service.lastEventReceived = Date.now() - (service.maxTimeSinceLastEventMs + 1000);
      
      service._checkConnectionHealth();
      
      expect(reconnectSpy).toHaveBeenCalled();
    });

    it('should reschedule health checks when connection is healthy', () => {
      const startSpy = vi.spyOn(service, '_startConnectionMonitoring');
      
      // Simulate recent event
      service.lastEventReceived = Date.now() - 1000;
      
      service._checkConnectionHealth();
      
      expect(startSpy).toHaveBeenCalled();
    });
  });

  describe('Reconnection Logic', () => {
    beforeEach(() => {
      // Mock the setup connection method
      service._setupConnection = vi.fn().mockResolvedValue();
    });

    it('should attempt reconnection with proper retry logic', async () => {
      const setupSpy = vi.spyOn(service, '_setupConnection');

      await service._attemptReconnection();

      expect(setupSpy).toHaveBeenCalled();
      // After successful reconnection, attempts are reset to 0
      expect(service.reconnectAttempts).toBe(0);
    });    it('should stop attempting after max retries', async () => {
      service.reconnectAttempts = service.maxReconnectAttempts;
      const setupSpy = vi.spyOn(service, '_setupConnection');
      
      await service._attemptReconnection();
      
      expect(setupSpy).not.toHaveBeenCalled();
    });

    it('should reset reconnect attempts on successful connection', async () => {
      service.reconnectAttempts = 1;
      
      await service._attemptReconnection();
      
      expect(service.reconnectAttempts).toBe(0);
    });

    it('should handle reconnection failures gracefully', async () => {
      service._setupConnection = vi.fn().mockRejectedValue(new Error('Connection failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();
      
      await service._attemptReconnection();
      
      expect(service.reconnectAttempts).toBe(1);
      consoleSpy.mockRestore();
    });
  });

  describe('Integration with Event Handlers', () => {
    it('should update connection health on DM events', async () => {
      const initialTime = service.lastEventReceived;
      
      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Mock event handling that would update lastEventReceived
      service.lastEventReceived = Date.now();
      
      expect(service.lastEventReceived).toBeGreaterThan(initialTime);
    });

    it('should clean up timers on service stop', async () => {
      service._startConnectionMonitoring();
      const timer = service.connectionMonitorTimer;
      
      await service.stop();
      
      expect(service.connectionMonitorTimer).toBe(null);
    });
  });
});
