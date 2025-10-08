export const settings = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TWITTER_API_KEY: process.env.TWITTER_API_KEY || "",
  TWITTER_API_SECRET_KEY: process.env.TWITTER_API_SECRET_KEY || "",
  TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || "",
  TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
  TWITTER_POST_ENABLE: process.env.TWITTER_POST_ENABLE || "true",
  TWITTER_POST_IMMEDIATELY: process.env.TWITTER_POST_IMMEDIATELY || "false",
  TWITTER_POST_INTERVAL_MIN: process.env.TWITTER_POST_INTERVAL_MIN || "120",
  TWITTER_POST_INTERVAL_MAX: process.env.TWITTER_POST_INTERVAL_MAX || "240",
  DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID || "",
  DISCORD_API_TOKEN: process.env.DISCORD_API_TOKEN || "",
   INSTAGRAM_USERNAME: process.env.INSTAGRAM_USERNAME || "",
   INSTAGRAM_PASSWORD: process.env.INSTAGRAM_PASSWORD || "",
   INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID || "",
   INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET || "",
   INSTAGRAM_USER_ID: process.env.INSTAGRAM_USER_ID || "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  IMAGE_DESCRIPTION:
    process.env.OPENROUTER_MODEL || "mistralai/mistral-medium-3.1",
     OPENROUTER_MODEL:
       process.env.OPENROUTER_MODEL || "tngtech/deepseek-r1t2-chimera:free",
   OPENROUTER_LARGE_MODEL:
     process.env.OPENROUTER_LARGE_MODEL || "mistralai/mistral-medium-3.1",
    OPENROUTER_SMALL_MODEL:
      process.env.OPENROUTER_SMALL_MODEL || "anthropic/claude-3-haiku",
  OPENROUTER_IMAGE_MODEL:
    process.env.OPENROUTER_IMAGE_MODEL || "mistralai/mistral-medium-3.1",
  OPENROUTER_BASE_URL:
    process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_IMAGE_DESCRIPTION_MODEL: "gpt-4o-mini",
  OPENAI_IMAGE_DESCRIPTION_MAX_TOKENS: "8192",
  GOOGLE_GENERATIVE_AI_API_KEY:
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  // Nostr
  NOSTR_PRIVATE_KEY: process.env.NOSTR_PRIVATE_KEY || "",
  NOSTR_RELAYS:
    process.env.NOSTR_RELAYS ||
    "wss://relay.damus.io,wss://nos.lol,wss://relay.snort.social",
  NOSTR_LISTEN_ENABLE: process.env.NOSTR_LISTEN_ENABLE || "true",
  NOSTR_POST_ENABLE: process.env.NOSTR_POST_ENABLE || "false",
  NOSTR_POST_INTERVAL_MIN: process.env.NOSTR_POST_INTERVAL_MIN || "7200",
  NOSTR_POST_INTERVAL_MAX: process.env.NOSTR_POST_INTERVAL_MAX || "21600",
  NOSTR_REPLY_ENABLE: process.env.NOSTR_REPLY_ENABLE || "true",
  NOSTR_REPLY_THROTTLE_SEC: process.env.NOSTR_REPLY_THROTTLE_SEC || "60",
  // Human-like reply delay (milliseconds)
  NOSTR_REPLY_INITIAL_DELAY_MIN_MS:
    process.env.NOSTR_REPLY_INITIAL_DELAY_MIN_MS || "800",
  NOSTR_REPLY_INITIAL_DELAY_MAX_MS:
    process.env.NOSTR_REPLY_INITIAL_DELAY_MAX_MS || "2500",
  // Discovery (for autonomous topic search/replies)
  NOSTR_DISCOVERY_ENABLE: process.env.NOSTR_DISCOVERY_ENABLE || "true",
  NOSTR_DISCOVERY_INTERVAL_MIN:
    process.env.NOSTR_DISCOVERY_INTERVAL_MIN || "1800",
  NOSTR_DISCOVERY_INTERVAL_MAX:
    process.env.NOSTR_DISCOVERY_INTERVAL_MAX || "3600",
  NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN:
    process.env.NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN || "1",
  NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN:
    process.env.NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN || "5",
  // Time-based filtering for old messages (ISO 8601 format)
  NOSTR_MESSAGE_CUTOFF_DATE:
    process.env.NOSTR_MESSAGE_CUTOFF_DATE || "2025-08-28T00:00:00Z",
  // DM (Direct Message) settings
  NOSTR_DM_ENABLE: process.env.NOSTR_DM_ENABLE || "true",
  NOSTR_DM_REPLY_ENABLE: process.env.NOSTR_DM_REPLY_ENABLE || "true",
  NOSTR_DM_THROTTLE_SEC: process.env.NOSTR_DM_THROTTLE_SEC || "60",
  // Home feed interaction chances (make rare to avoid spam)
  NOSTR_HOME_FEED_REPOST_CHANCE: process.env.NOSTR_HOME_FEED_REPOST_CHANCE || "0.005",
  NOSTR_HOME_FEED_QUOTE_CHANCE: process.env.NOSTR_HOME_FEED_QUOTE_CHANCE || "0.001",
  // LNPixels WS for activity stream
 LNPIXELS_WS_URL: process.env.LNPIXELS_WS_URL || "https://ln.pixel.xx.kg",
  // Shell plugin settings
  SHELL_ENABLED: process.env.SHELL_ENABLED || "true",
  SHELL_ALLOWED_DIRECTORY: process.env.SHELL_ALLOWED_DIRECTORY || "/home/pixel",
  SHELL_TIMEOUT: process.env.SHELL_TIMEOUT || "300000",
  SHELL_FORBIDDEN_COMMANDS: process.env.SHELL_FORBIDDEN_COMMANDS || "rm,mv,chmod,chown,shutdown",
};