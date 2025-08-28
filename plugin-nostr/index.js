// Slim index: export plugin with service from extracted core
const { NostrService } = require('./lib/service');

const nostrPlugin = {
  name: "@pixel/plugin-nostr",
  description: "Minimal Nostr integration: autonomous posting and mention subscription",
  services: [NostrService],
};

module.exports = nostrPlugin;
module.exports.nostrPlugin = nostrPlugin;
module.exports.default = nostrPlugin;
