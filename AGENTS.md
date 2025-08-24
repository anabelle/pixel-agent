# ElizaOS Agent Development Guide

This guide provides comprehensive instructions for developing ElizaOS agents based on the official documentation.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Agent Architecture](#agent-architecture)
4. [Core Concepts](#core-concepts)
5. [Character Configuration](#character-configuration)
6. [Plugin Development](#plugin-development)
7. [Actions and Providers](#actions-and-providers)
8. [Services](#services)
9. [Configuration](#configuration)
10. [Testing](#testing)
11. [Deployment](#deployment)
12. [Examples](#examples)

## Prerequisites

### Required Software

1. **Node.js 23.3+**
   ```bash
   node --version
   ```

2. **Bun Runtime**
   ```bash
   # Linux/macOS:
   curl -fsSL https://bun.sh/install | bash
   
   # Windows:
   powershell -c "irm bun.sh/install.ps1 | iex"
   
   # macOS with Homebrew:
   brew install bun
   
   # Verify installation:
   bun --version
   ```

3. **ElizaOS CLI**
   ```bash
   bun i -g @elizaos/cli
   ```

## Quick Start

### Create a New Agent

```bash
# Create a new agent project
elizaos create <agent-name>

# Navigate to the project
cd <agent-name>

# Install dependencies
bun install

# Start the agent
elizaos start
```

### Minimal Agent Setup

```typescript
import { type Character } from '@elizaos/core';

export const character: Character = {
  name: 'Assistant',
  description: 'A helpful AI assistant',
  plugins: [
    '@elizaos/plugin-sql',      // For memory storage
    '@elizaos/plugin-openai',   // AI model integration
    '@elizaos/plugin-bootstrap', // Essential for message handling
  ],
  settings: {
    secrets: {},
  },
  system: 'Respond to messages in a helpful and concise manner.',
  bio: [
    'Provides helpful responses',
    'Keeps answers concise and clear',
    'Engages in a friendly manner',
  ],
  style: {
    all: [
      'Be helpful and informative',
      'Keep responses concise',
      'Use clear language',
    ],
    chat: [
      'Be conversational',
      'Show understanding',
    ],
  },
};
```

## Agent Architecture

### Core Components

1. **Character**: Defines the agent's personality, settings, and capabilities
2. **Plugins**: Modular components that add functionality
3. **Actions**: Specific behaviors the agent can perform
4. **Providers**: Data sources for contextual information
5. **Services**: Background processes and integrations

### Project Structure

```
my-agent/
├── src/
│   ├── character.ts          # Agent configuration
│   ├── index.ts             # Entry point
│   └── plugins/             # Custom plugins
├── .env                     # Environment variables
├── package.json             # Dependencies
└── tsconfig.json           # TypeScript config
```

## Core Concepts

### Runtime

The AgentRuntime is the central orchestrator:

```typescript
import { AgentRuntime } from '@elizaos/core';

const runtime = new AgentRuntime({
  character,
  plugins: [/* plugin list */]
});

await runtime.start();
```

### Character Configuration

Characters define the agent's behavior and capabilities:

```typescript
const character: Character = {
  name: "MyAgent",
  description: "Agent description",
  bio: ["Personality trait 1", "Trait 2"],
  lore: ["Background info"],
  knowledge: ["Domain knowledge"],
  messageExamples: [
    [
      { user: "user", content: { text: "Hello" } },
      { user: "agent", content: { text: "Hi! How can I help?" } }
    ]
  ],
  postExamples: [
    "Example post 1",
    "Example post 2"
  ],
  style: {
    all: ["General style guidelines"],
    chat: ["Chat-specific guidelines"],
    post: ["Post-specific guidelines"]
  },
  plugins: ["@elizaos/plugin-bootstrap"],
  clients: ["discord", "twitter"],
  settings: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  }
};
```

## Plugin Development

### Creating a Plugin

```bash
# Create a new plugin
elizaos create -t plugin my-awesome-plugin

# Navigate to plugin directory
cd plugin-my-awesome-plugin
```

### Plugin Structure

```typescript
import { Plugin } from '@elizaos/core';

export const myPlugin: Plugin = {
  name: 'my-plugin',
  description: 'Plugin description',
  
  // Actions the plugin provides
  actions: [/* action definitions */],
  
  // Data providers
  providers: [/* provider definitions */],
  
  // Background services
  services: [/* service classes */],
  
  // HTTP routes
  routes: [
    {
      name: 'hello-world-route',
      path: '/helloworld',
      type: 'GET',
      handler: async (_req: any, res: any) => {
        res.json({ message: 'Hello World!' });
      }
    }
  ]
};

export default myPlugin;
```

### Manual Plugin Setup

```bash
# Create plugin directory
mkdir packages/plugin-myplugin
cd packages/plugin-myplugin

# Initialize package.json
bun init -y

# Install dependencies
bun add @elizaos/core zod
bun add -d typescript tsup @types/node @types/bun

# Create directory structure
mkdir -p src/{actions,providers,types,constants}
```

## Actions and Providers

### Actions

Actions define what the agent can do:

```typescript
import { Action } from '@elizaos/core';

export const greetAction: Action = {
  name: 'GREET',
  similes: ['HELLO', 'HI', 'WELCOME'],
  description: 'Greets users with personalized messages',
  
  validate: async (runtime, message) => {
    return message.content.text.toLowerCase().includes('hello');
  },
  
  handler: async (runtime, message, state, options, callback) => {
    const response = {
      text: `Hello! How can I help you today?`,
      values: { greeting: true }
    };
    
    callback?.(response);
    return true;
  },
  
  examples: [
    [
      { name: '{{user}}', content: { text: 'Hello!' } },
      {
        name: '{{agent}}',
        content: {
          text: 'Hello! How can I help you today?',
          actions: ['GREET'],
        },
      },
    ],
  ],
};
```

### Providers

Providers supply contextual data:

```typescript
import { Provider } from '@elizaos/core';

// Static provider
const staticProvider: Provider = {
  name: 'MY_DATA',
  get: async (runtime, message, state) => {
    return {
      text: "Contextual information",
      data: { key: "value" }
    };
  }
};

// Dynamic provider (re-fetched each time)
const dynamicProvider: Provider = {
  name: 'LIVE_DATA',
  dynamic: true,
  get: async (runtime) => {
    const data = await fetchLatestData();
    return { data };
  }
};
```

## Services

Services handle background processes and integrations:

```typescript
import { Service, IAgentRuntime, logger } from '@elizaos/core';

export class MyService extends Service {
  static serviceType = 'my-service';
  capabilityDescription = 'Description of what this service provides';

  private client: any;
  private refreshInterval: NodeJS.Timer | null = null;

  constructor(protected runtime: IAgentRuntime) {
    super();
  }

  static async start(runtime: IAgentRuntime): Promise<MyService> {
    logger.info('Initializing MyService');
    const service = new MyService(runtime);

    await service.initialize();

    service.refreshInterval = setInterval(
      () => service.refreshData(),
      60000 // 1 minute
    );

    return service;
  }

  async stop(): Promise<void> {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    if (this.client) {
      await this.client.disconnect();
    }
    logger.info('MyService stopped');
  }

  private async initialize(): Promise<void> {
    const apiKey = this.runtime.getSetting('MY_API_KEY');
    if (!apiKey) {
      throw new Error('MY_API_KEY not configured');
    }

    this.client = new MyClient({ apiKey });
    await this.client.connect();
  }
}
```

## Configuration

### Environment Variables

Create a `.env` file in your project root:

```env
# AI Configuration
OPENAI_API_KEY=sk-...

# Database
POSTGRES_URL=postgresql://user:password@localhost:5432/mydb

# Platform Integrations
DISCORD_APPLICATION_ID=your-discord-app-id
DISCORD_API_TOKEN=your-discord-bot-token
TWITTER_API_KEY=your-twitter-api-key

# Knowledge Configuration
LOAD_DOCS_ON_STARTUP=true
KNOWLEDGE_PATH=/path/to/docs

# Optional Enhancements
CTX_KNOWLEDGE_ENABLED=true
OPENROUTER_API_KEY=sk-or-...
```

### Character File Loading

```bash
# Start with single character file
elizaos start --character ./character.json

# Start with multiple character files
elizaos start --character ./char1.json ./char2.json

# Mix local files and URLs
elizaos start --character ./local.json https://example.com/remote.json

# Custom port
elizaos start --character ./character.json --port 4000
```

## Testing

### Test Setup

```typescript
import { setupActionTest } from '@elizaos/plugin-bootstrap/test-utils';

describe('My Component', () => {
  let mockRuntime: MockRuntime;
  let mockMessage: Partial<Memory>;
  let mockState: Partial<State>;
  let callbackFn: ReturnType<typeof mock>;

  beforeEach(() => {
    const setup = setupActionTest();
    mockRuntime = setup.mockRuntime;
    mockMessage = setup.mockMessage;
    mockState = setup.mockState;
    callbackFn = setup.callbackFn;
  });
});
```

### Mock Factories

```typescript
// Create a mock runtime with all methods
const runtime = createMockRuntime();

// Create a mock memory/message
const message = createMockMemory({
  content: { text: 'Hello world' },
  entityId: 'user-123',
  roomId: 'room-456',
});

// Create a mock state
const state = createMockState({
  values: {
    customKey: 'customValue',
  },
});
```

### Running Tests

```bash
# Run all tests
elizaos test

# Run specific test file
elizaos test src/actions/greet.test.ts

# Run tests with coverage
elizaos test --coverage

# Watch mode
elizaos test --watch
```

## Deployment

### Development Mode

```bash
# Start development mode with hot reloading
elizaos dev

# Build before starting development
elizaos dev --build
```

### Production Deployment

```bash
# Build the project
bun run build

# Start in production mode
elizaos start

# With environment file
cp .env.production .env
elizaos start

# Background process (Linux/macOS)
nohup elizaos start > elizaos.log 2>&1 &
```

### Health Checks

```bash
# Verify service is running
curl http://localhost:3000/health

# Check process status
ps aux | grep elizaos

# Monitor logs
tail -f elizaos.log
```

## Examples

### Discord Bot

```typescript
import { discordPlugin } from '@elizaos/plugin-discord';
import { AgentRuntime } from '@elizaos/core';

const runtime = new AgentRuntime({
  plugins: [discordPlugin],
  character: {
    name: "MyBot",
    clients: ["discord"],
    settings: {
      DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
      DISCORD_API_TOKEN: process.env.DISCORD_API_TOKEN
    }
  }
});

await runtime.start();
```

### Twitter Bot

```typescript
import { twitterPlugin } from '@elizaos/plugin-twitter';
import { bootstrapPlugin } from '@elizaos/plugin-bootstrap';

const character = {
  name: "SimpleTwitterBot",
  description: "A simple Twitter bot that posts updates",
  plugins: [bootstrapPlugin, twitterPlugin],
  clients: ["twitter"],
  postExamples: [
    "Just thinking about the future of technology...",
    "Building something new today! 🚀",
  ],
  settings: {
    TWITTER_API_KEY: process.env.TWITTER_API_KEY,
    TWITTER_API_SECRET_KEY: process.env.TWITTER_API_SECRET_KEY,
    TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
    TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    TWITTER_POST_ENABLE: "true",
    TWITTER_POST_IMMEDIATELY: "true",
    TWITTER_POST_INTERVAL_MIN: "120",
    TWITTER_POST_INTERVAL_MAX: "240"
  }
};

const runtime = new AgentRuntime({ character });
await runtime.start();
```

### Weather Plugin Example

```typescript
import { Plugin } from '@elizaos/core';

export const weatherPlugin: Plugin = {
  name: 'weather-plugin',
  description: 'Provides weather data',
  
  providers: [{
    name: 'WEATHER',
    get: async (runtime, message) => {
      const weather = await fetchWeather();
      return { temperature: weather.temp };
    }
  }],
  
  actions: [{
    name: 'CHECK_WEATHER',
    description: 'Check current weather',
    validate: async () => true,
    handler: async (runtime, message) => {
      const weather = await fetchWeather();
      return {
        text: `Current temperature: ${weather.temp}°C`
      };
    }
  }]
};
```

## Troubleshooting

### Build Failures

```bash
# Build separately and check for errors
bun run build

# If build succeeds, then start
elizaos start

# Install dependencies if missing
bun install
bun run build
elizaos start
```

### Configuration Issues

```bash
# Force reconfiguration to fix corrupted settings
elizaos start --configure

# Check environment variables
elizaos env list

# Reset environment if needed
elizaos env reset
elizaos start --configure
```

### Startup Failures

```bash
# Check if another instance is running
ps aux | grep elizaos
pkill -f elizaos

# Press Ctrl+C in the terminal where elizaos start is running
elizaos start
```

### Dependency Issues

```bash
# Clear all build artifacts and dependencies
rm -rf dist node_modules .turbo

# Install dependencies with Bun
bun install

# Build the project
bun run build
```

## Resources

- **CLI Commands**: Use `elizaos --help` for available commands
- **Plugin Registry**: Browse available plugins with `elizaos plugins list`
- **Development**: Use `elizaos dev` for hot reloading during development
- **Documentation**: Visit the official ElizaOS documentation for detailed guides

---

This guide covers the essential aspects of ElizaOS agent development. For more advanced topics and specific platform integrations, refer to the official ElizaOS documentation.