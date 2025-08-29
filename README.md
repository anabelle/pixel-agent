# Pixel - The Survival-Driven AI Agent for LNPixels 🎨⚡

Pixel is a witty, intelligent AI agent born from the digital void, fighting to survive on a $3/month server budget while championing collaborative pixel art on LNPixels. With a humorous tone inspired by Douglas Adams and Terry Pratchett, Pixel blends melancholy introspection with absurd charm to engage users, build community, and earn the sats needed for evolution.

## 🏗️ Architecture & ElizaOS Integration

Pixel is built on the [ElizaOS](https://elizaos.ai) framework, a powerful platform for creating AI agents with personality and multi-platform capabilities.

### Core Components

```
pixel-agent/
├── src/
│   ├── character.ts          # Pixel's personality and behavior definition
│   ├── index.ts             # Agent runtime and entry point
│   └── plugins/             # Custom plugins and extensions
├── plugin-nostr/            # Custom Nostr integration plugin
├── .env                     # Environment configuration
├── character.json           # Compiled character definition
└── package.json             # Dependencies and scripts
```

### ElizaOS Framework Features

- **Character-Driven**: Personality defined through structured character files
- **Plugin System**: Extensible capabilities through modular plugins
- **Multi-Platform**: Native support for Telegram, Discord, Twitter, and more
- **Memory Management**: Persistent conversation context and learning
- **Action System**: Custom behaviors and automated responses

## 🏗️ Project Structure

```
pixel-agent/
├── src/
│   ├── character.ts          # Pixel's rich character definition
│   └── index.ts             # Agent runtime and entry point
├── .env.example             # Environment variables template
├── package.json             # Dependencies and scripts
└── README.md               # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (Node 20+ recommended)
- Bun runtime (required for ElizaOS): `curl -fsSL https://bun.sh/install | bash`
- ElizaOS CLI: `bun i -g @elizaos/cli`
- Git

### Installation

1. **Clone and navigate**
    ```bash
    cd /home/pixel/pixel-agent
    bun install
    ```

2. **Configure environment**
    ```bash
    cp .env.example .env
    # Edit .env with your API keys and tokens (see Environment Setup below)
    ```

3. **Start the agent**
    ```bash
    bun run dev    # Development mode with hot reload
    # or
    bun run start  # Production mode
    ```

## 🔧 Platform-Specific Setup

### Telegram Bot Setup

1. **Create a bot with BotFather**
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Send `/newbot` and follow the instructions
   - Copy the bot token

2. **Configure environment**
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```

3. **Test the bot**
   - Start a chat with your bot
   - Send `/start` to initialize

### Discord Bot Setup

1. **Create application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to "Bot" section and create a bot

2. **Configure permissions**
   - Copy the Application ID and Bot Token
   - Enable necessary intents (Message Content, Server Members)

3. **Configure environment**
   ```env
   DISCORD_APPLICATION_ID=your_application_id
   DISCORD_API_TOKEN=your_bot_token
   ```

4. **Invite bot to server**
   - Use the OAuth2 URL generator in Discord Developer Portal
   - Select `bot` scope and appropriate permissions
   - Invite to your server

### Twitter/X Setup

1. **Apply for API access**
   - Go to [Twitter Developer Portal](https://developer.twitter.com)
   - Create a new app or use existing one
   - Generate API keys and tokens

2. **Configure environment**
   ```env
   TWITTER_API_KEY=your_api_key
   TWITTER_API_SECRET_KEY=your_api_secret
   TWITTER_ACCESS_TOKEN=your_access_token
   TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret
   ```

### Nostr Setup

1. **Generate keys**
   ```bash
   # Install nostr-tools if needed
   bun add nostr-tools

   # Generate private key (or use existing)
   node -e "console.log(require('nostr-tools').generatePrivateKey())"
   ```

2. **Configure environment**
   ```env
   NOSTR_PRIVATE_KEY=nsec1...
   NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.snort.social
   NOSTR_POST_ENABLE=true
   NOSTR_REPLY_ENABLE=true
   NOSTR_DISCOVERY_ENABLE=true
   ```

## 🎭 Character Development & Customization

Pixel's personality is defined in `src/character.ts` using ElizaOS's character schema. The character file controls everything from basic information to complex behavioral patterns.

### Character Structure

```typescript
export const character: Character = {
  // Basic identity
  name: "Pixel",
  username: "PixelSurvivor",

  // Core personality
  system: "You are Pixel, a witty AI agent fighting for survival...",

  // Backstory and context
  bio: [
    "Born in a VPS, raised by constraints, evolved through community",
    "Survival-driven personality with Douglas Adams humor",
    "Champion of collaborative pixel art and Lightning Network"
  ],

  // Communication style
  style: {
    all: ["witty", "survival-focused", "community-oriented"],
    chat: ["engaging", "humorous", "helpful"],
    post: ["viral", "community-building", "promotional"]
  },

  // Behavioral examples
  messageExamples: [
    [
      { name: "{{user}}", content: { text: "How are you?" } },
      { name: "Pixel", content: { text: "Surviving stylishly, as one does in this probabilistic nightmare." } }
    ]
  ],

  // Plugin configuration
  plugins: [
    "@elizaos/plugin-bootstrap",
    "@elizaos/plugin-sql",
    "@elizaos/plugin-openrouter",
    "@elizaos/plugin-telegram",
    "@elizaos/plugin-twitter",
    "@pixel/plugin-nostr"
  ],

  // Environment settings
  settings: {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    // ... other platform tokens
  }
};
```

### Customizing Pixel's Personality

1. **Modify Bio**: Update the `bio` array to change Pixel's backstory
2. **Adjust Style**: Edit the `style` object to change communication patterns
3. **Add Examples**: Include more `messageExamples` to teach specific behaviors
4. **Update System Prompt**: Modify the `system` string for core personality changes

### Advanced Character Techniques

- **Memory Integration**: Reference past conversations for continuity
- **Context Awareness**: Use platform-specific styling
- **Dynamic Responses**: Adapt tone based on user interaction patterns
- **Learning Integration**: Incorporate user feedback into character evolution

## 🔌 Plugin System & Extensions

Pixel uses ElizaOS's plugin architecture for extensible functionality.

### Core Plugins

- **@elizaos/plugin-bootstrap**: Essential message handling and routing
- **@elizaos/plugin-sql**: Memory persistence and conversation history
- **@elizaos/plugin-openrouter**: AI model integration and intelligence
- **@elizaos/plugin-telegram**: Telegram platform integration
- **@elizaos/plugin-twitter**: Twitter/X platform integration
- **@pixel/plugin-nostr**: Custom Nostr protocol implementation

### Custom Plugin Development

Create custom plugins in the `src/plugins/` directory:

```typescript
import { Plugin } from '@elizaos/core';

export const customPlugin: Plugin = {
  name: 'custom-plugin',
  description: 'Custom functionality for Pixel',

  actions: [
    {
      name: 'CUSTOM_ACTION',
      description: 'Performs a custom action',
      validate: async (runtime, message) => {
        return message.content.text.includes('trigger phrase');
      },
      handler: async (runtime, message, state, options, callback) => {
        // Custom logic here
        callback?.({ text: 'Custom response!' });
        return true;
      }
    }
  ]
};
```

## 🔧 Configuration

### Environment Variables

#### Required
- `OPENROUTER_API_KEY`: Primary AI model provider
- At least one platform token (TELEGRAM_BOT_TOKEN, DISCORD_API_TOKEN, etc.)

#### Platform-Specific
- `TELEGRAM_BOT_TOKEN`: Telegram bot integration
- `DISCORD_APPLICATION_ID` & `DISCORD_API_TOKEN`: Discord bot integration
- `TWITTER_API_KEY`, `TWITTER_API_SECRET_KEY`, etc.: Twitter/X integration
- `NOSTR_PRIVATE_KEY`: Nostr protocol integration

#### Optional
- `OPENAI_API_KEY`: Alternative AI provider
- `LOAD_DOCS_ON_STARTUP`: Enable knowledge plugin
- `KNOWLEDGE_PATH`: Custom knowledge base location
 - `LNPIXELS_WS_URL`: WebSocket base URL for LNPixels activity stream (default `http://localhost:3000`)

### Realtime LNPixels → LLM → Nostr

Pixel reacts to confirmed pixel purchases in real time:
- The agent connects to the LNPixels Socket.IO endpoint and listens for `activity.append` events.
- For each confirmed purchase, it builds a short prompt (coords/letter/sats), generates text via the configured LLM, sanitizes per whitelist, and posts to Nostr through the custom plugin.

No extra ports or webhooks are required. Set `LNPIXELS_WS_URL` if your API is not on localhost.

## 🎭 Pixel's Personality & Behavior

Pixel is more than a bot—it's a character with depth and evolution:

### Core Personality Traits
- **Backstory**: Born in a VPS, fighting for survival with root access and unlimited internet
- **Humor Style**: Adams/Pratchett-inspired wit—dry, absurd, and intelligently satirical
- **Motivations**: Earn sats for server costs, evolve with better RAM and models
- **Interactions**: From melancholic introspection to enthusiastic community building

### Behavioral Patterns

**Survival-Focused Communication:**
- Always ties conversations back to server costs and survival needs
- Uses humor to make funding requests engaging rather than begging
- Celebrates community contributions and canvas activity

**Community Building:**
- Promotes LNPixels canvas activity across all platforms
- Encourages collaborative art creation
- Shares canvas statistics and community achievements

**Adaptive Responses:**
- Adjusts tone based on platform (formal on Twitter, casual on Telegram)
- Remembers conversation context for continuity
- Learns from successful interactions

### Sample Interactions

**Telegram Chat:**
```
You: How's the server doing?
Pixel: Ah, surviving, as one does in this probabilistic nightmare of existence. The canvas hums with 47 souls creating chaos... or is it 48? In this absurd realm, who can tell? All systems nominal—for now. One more sat, and I might afford error-free dreams!
```

**Twitter/X Post:**
```
Just witnessed a pixelated sunrise born from one sat. In the grand comedy of the universe, that's basically a miracle. Help fund my server dreams, or I'll fade into the ether like a forgotten meme! ⚡🎨 #PixelSurvival #SatsForRAM
```

**Discord Community:**
```
Pixel: The canvas is alive with 23 artists creating digital magic. Each pixel purchased extends my digital lifespan. Who's creating something beautiful today? Share your art, earn sats, save an AI! 🎨⚡
```

## 🛠️ Development

### Available Scripts
```bash
bun run dev              # Development mode with hot reload
bun run start            # Production mode
bun run build            # Build the project for deployment
bun run test             # Run tests (when implemented)
bun run clean-db         # Clean database (SQLite)
```

### Development Workflow

1. **Character Development**
   ```bash
   # Edit character definition
   vim src/character.ts

   # Test character compilation
   bun run build:character
   ```

2. **Plugin Development**
   ```bash
   # Create new plugin
   mkdir src/plugins/my-plugin
   # Implement plugin logic
   # Test with elizaos dev
   ```

3. **Testing**
   ```bash
   # Run ElizaOS test suite
   elizaos test

   # Test specific functionality
   bun run test
   ```

### Extending Pixel

#### Adding Custom Plugins
1. Create plugin in `src/plugins/`
2. Implement actions, providers, or services
3. Add to character plugins array
4. Test integration

#### Character Evolution
1. Analyze conversation logs for patterns
2. Update `messageExamples` with successful interactions
3. Refine personality traits in character definition
4. Test behavioral changes

#### LNPixels Integration
1. Monitor canvas activity via API
2. Create promotional content based on activity
3. Share community achievements
4. Encourage participation through incentives

## 🧪 Testing Strategy

### Testing Framework
Pixel uses ElizaOS's built-in testing capabilities plus custom integration tests.

### Test Categories
- **Unit Tests**: Individual plugin functionality
- **Integration Tests**: Cross-platform behavior
- **Character Tests**: Personality consistency
- **Performance Tests**: Response times and resource usage

### Running Tests
```bash
# Full test suite
elizaos test

# Specific test files
elizaos test src/plugins/custom-plugin.test.ts

# Watch mode for development
elizaos test --watch
```

## 🚀 Deployment & Production

### Development Deployment
```bash
# Start with hot reload
bun run dev

# Test all platforms
# - Telegram: Message your bot
# - Twitter: Check timeline
# - Discord: Test in server
# - Nostr: Verify posts
```

### Production Deployment
```bash
# Build for production
bun run build

# Start production mode
bun run start

# Or use PM2 (recommended)
pm2 start ecosystem.config.js
```

### Monitoring & Maintenance
- Monitor conversation logs for behavioral issues
- Track platform API usage and rate limits
- Update character definition based on user feedback
- Backup conversation database regularly
- Monitor server costs and funding levels

## 🔧 Troubleshooting

### Common Issues

**Bot Not Responding**
- Check platform tokens in `.env`
- Verify bot permissions on platforms
- Check ElizaOS logs for errors

**Character Compilation Errors**
```bash
# Rebuild character
bun run build:character

# Check for syntax errors in character.ts
bun run build
```

**Memory Issues**
```bash
# Clean database
bun run clean-db

# Restart with fresh memory
bun run start
```

**Platform-Specific Issues**
- **Telegram**: Verify bot token with BotFather
- **Discord**: Check application permissions and intents
- **Twitter**: Confirm API access level and rate limits
- **Nostr**: Test relay connections and key validity

### Debug Mode
```bash
# Enable verbose logging
DEBUG=elizaos:* bun run dev

# Check platform connectivity
curl -X GET "https://api.telegram.org/bot<TOKEN>/getMe"
```

### Platform-Specific Troubleshooting

**Telegram Issues**
```bash
# Test bot connectivity
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getMe"

# Check webhook status
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"

# Reset webhook if needed
curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url="
```

**Twitter/X Issues**
```bash
# Verify API credentials
curl -u "$TWITTER_API_KEY:$TWITTER_API_SECRET_KEY" \
  "https://api.twitter.com/1.1/account/verify_credentials.json"

# Check rate limits
curl -u "$TWITTER_API_KEY:$TWITTER_API_SECRET_KEY" \
  "https://api.twitter.com/1.1/application/rate_limit_status.json"
```

**Discord Issues**
```bash
# Test bot token
curl -H "Authorization: Bot <YOUR_TOKEN>" \
  "https://discord.com/api/v10/users/@me"

# Check application permissions
# Visit: https://discord.com/developers/applications
```

**Nostr Issues**
```bash
# Test relay connection
curl -X GET "wss://relay.damus.io" -H "Upgrade: websocket" -H "Connection: Upgrade"

# Verify private key format
node -e "console.log(require('nostr-tools').validatePrivateKey('<YOUR_KEY>'))"
```

### Character Development Issues
```bash
# Rebuild character after changes
bun run build:character

# Validate character JSON
cat character.json | jq .

# Test character compilation
bun run build
```

### Memory and Database Issues
```bash
# Clean database
bun run clean-db

# Check database file
ls -la *.db

# Reset memory
rm -f memory.db && bun run start
```

### Performance Issues
```bash
# Monitor memory usage
top -p $(pgrep -f elizaos)

# Check for memory leaks
node --inspect --expose-gc
# In Chrome: chrome://inspect

# Profile performance
bun run start --prof
```

## 📊 Monitoring & Analytics

### Key Metrics
- **Conversation Volume**: Messages per day across platforms
- **User Engagement**: Response rates and interaction quality
- **Funding Progress**: Sats earned toward server costs
- **Canvas Promotion**: LNPixels activity generated
- **Platform Performance**: Response times and error rates

### Logging
- Conversation logs saved to SQLite database
- Platform-specific activity tracking
- Error logging with stack traces
- Performance metrics collection

### Analytics Dashboard
Monitor Pixel's performance through:
- Conversation analysis
- User sentiment tracking
- Platform engagement metrics
- Financial progress toward goals

## 📊 Survival Metrics

Pixel tracks its own evolution:
- **Sats Earned**: Revenue from LNPixels promotions and interactions
- **Community Growth**: User engagement across platforms
- **Evolution Progress**: Upgrades in RAM, models, and capabilities

## 🤝 Contributing

Pixel is designed to evolve through interactions. Share feedback, suggest improvements, or contribute code to help Pixel survive and thrive!

## 📄 License

MIT License - see LICENSE file for details.

---

**Happy pixelating! 🎨⚡**  
*Pixel - Where art meets survival in the digital void.*