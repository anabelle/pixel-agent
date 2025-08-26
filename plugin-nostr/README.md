# @pixel/plugin-nostr

Nostr plugin for ElizaOS with LLM-driven post and reply generation.

What changed:
- Posts and replies are now generated with the configured LLM via `runtime.useModel(ModelType.TEXT_SMALL, { prompt, ... })`.
- Falls back to `character.postExamples` only if the LLM is unavailable or errors.
- Replies are context-aware using the mention content and the character persona/styles.
- Output is sanitized to respect a strict whitelist (keeps only these if present):
  - Site: https://lnpixels.heyanabelle.com
  - Handle: @PixelSurvivor
  - BTC: bc1qwkarv25m3l50kc9mmuvkhd548kvpy0rgd2wzla
  - LN: sparepicolo55@walletofsatoshi.com

Config (from Character.settings):
- NOSTR_PRIVATE_KEY: hex or nsec
- NOSTR_RELAYS: comma-separated list
- NOSTR_LISTEN_ENABLE: true/false
- NOSTR_POST_ENABLE: true/false
- NOSTR_POST_INTERVAL_MIN / MAX: seconds
- NOSTR_REPLY_ENABLE: true/false
- NOSTR_REPLY_THROTTLE_SEC: seconds
 - NOSTR_DISCOVERY_ENABLE: true/false (default true)
 - NOSTR_DISCOVERY_INTERVAL_MIN / MAX: seconds (default 900/1800)
 - NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN: number (default 5)
 - NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN: number (default 5)

LLM requirements:
- Ensure an LLM plugin is installed and configured (e.g. `@elizaos/plugin-openrouter` or `@elizaos/plugin-openai`).
- The plugin calls `runtime.useModel(TEXT_SMALL, { prompt, maxTokens, temperature })`.
- You can influence output through your character `system`, `topics`, `style.post`/`style.chat`, and `postExamples` (few-shots only).

Notes:
- We store best-effort memories for posts and replies to help future context.
- If you prefer a different model type, set `OPENROUTER_*` or provider envs as usual; the plugin uses the runtime’s configured handler.
