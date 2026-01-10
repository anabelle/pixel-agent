// Slim index: export plugin with service from extracted core
const { NostrService } = require('./lib/service');
const { emitter } = require('./lib/bridge');

let ChannelType;
try {
  ({ ChannelType } = require('@elizaos/core'));
} catch {
  ChannelType = { GROUP: 'GROUP' };
}

const nostrPlugin = {
  name: "@pixel/plugin-nostr",
  description: "Minimal Nostr integration: autonomous posting and mention subscription",
  services: [NostrService],
  // Compatibility: Some @elizaos/plugin-bootstrap providers assume room.serverId
  // exists in GROUP contexts; in our current Postgres schema/runtime wiring, it
  // can be missing, which causes provider throws and breaks Telegram group chat
  // message handling. This override makes ROLES provider non-fatal.
  providers: [
    {
      name: 'ROLES',
      get: async (_runtime, _message, state) => {
        const room = state?.data?.room;
        if (room && room.type !== ChannelType.GROUP) {
          return { text: '', data: { roles: [], userRoles: [] } };
        }
        return { text: '', data: { roles: [], userRoles: [] } };
      },
    },
  ],
};

module.exports = nostrPlugin;
module.exports.nostrPlugin = nostrPlugin;
module.exports.default = nostrPlugin;
module.exports.nostrBridge = emitter;
