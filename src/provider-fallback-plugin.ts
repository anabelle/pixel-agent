/**
 * Provider Fallback Plugin
 *
 * Provides fallback implementations for providers that expect room information
 * but are called in contexts where rooms don't exist (like Twitter posting).
 */

import { Plugin, IAgentRuntime, Memory, State } from '@elizaos/core';

export const providerFallbackPlugin: Plugin = {
  name: 'provider-fallback',
  description: 'Fallback providers for missing room contexts',

  providers: [
    {
      name: 'ROLES',
      get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        // Return empty roles for non-room contexts like Twitter
        return {
          text: '',
          data: {
            roles: [],
            userRoles: []
          }
        };
      }
    },
    {
      name: 'channelState',
      get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        // Return empty channel state for non-room contexts
        return {
          text: '',
          data: {
            channel: null,
            members: [],
            isVoiceChannel: false
          }
        };
      }
    },
    {
      name: 'voiceState',
      get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        // Return empty voice state for non-room contexts
        return {
          text: '',
          data: {
            voiceStates: [],
            userVoiceState: null
          }
        };
      }
    }
  ]
};

export default providerFallbackPlugin;