========================
CODE SNIPPETS
========================
TITLE: Manual Plugin Project Setup
DESCRIPTION: Provides a step-by-step guide for setting up a new ElizaOS plugin project manually, including directory creation, package initialization, dependency installation, and basic directory structure.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_49

LANGUAGE: bash
CODE:
```
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

----------------------------------------

TITLE: Basic Start Examples
DESCRIPTION: Demonstrates basic usage of the `elizaos start` command, including starting with default configuration and on a custom port.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_1

LANGUAGE: bash
CODE:
```
# Start with default configuration
elizaos start

# Start on custom port
elizaos start --port 8080

# Force reconfiguration
elizaos start --configure
```

----------------------------------------

TITLE: Basic ElizaOS Discord Setup
DESCRIPTION: Demonstrates the basic setup for integrating the ElizaOS Discord plugin, including initializing the AgentRuntime with necessary configurations and starting the agent.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/discord/complete-documentation.mdx#_snippet_29

LANGUAGE: typescript
CODE:
```
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

----------------------------------------

TITLE: Advanced Configuration Examples
DESCRIPTION: Shows advanced usage scenarios for `elizaos start`, such as forcing reconfiguration before starting and specifying both character and port.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_3

LANGUAGE: bash
CODE:
```
# Reconfigure services before starting
elizaos start --configure

# Start with specific character on custom port
elizaos start --character ./my-bot.json --port 4000

# Complete setup for production deployment
elizaos start --character ./production-bot.json --port 3000
```

----------------------------------------

TITLE: Start elizaOS Agent
DESCRIPTION: Launches the elizaOS agent. Once started, the agent will be accessible via a web interface.

SOURCE: https://github.com/elizaos/docs/blob/main/quickstart.mdx#_snippet_3

LANGUAGE: bash
CODE:
```
elizaos start
```

----------------------------------------

TITLE: Install elizaOS CLI
DESCRIPTION: Installs the elizaOS Command Line Interface globally using the Bun package manager.

SOURCE: https://github.com/elizaos/docs/blob/main/quickstart.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
bun i -g @elizaos/cli
```

----------------------------------------

TITLE: Production Deployment Examples
DESCRIPTION: Provides examples for deploying elizaOS in production, including using environment files and running as a background process.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_4

LANGUAGE: bash
CODE:
```
# With environment file
cp .env.production .env
elizaos start

# Background process (Linux/macOS)
nohup elizaos start > elizaos.log 2>&1 &
```

----------------------------------------

TITLE: Start ElizaOS Agent
DESCRIPTION: Executes the command to start the ElizaOS agent. Ensure the agent is running to access its services, including the web interface.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/quick-start.mdx#_snippet_9

LANGUAGE: bash
CODE:
```
elizaos start
```

----------------------------------------

TITLE: Basic ElizaOS Project Setup
DESCRIPTION: Provides a basic TypeScript example for setting up an ElizaOS project. It defines a character with plugins and creates an agent, exporting the project configuration.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/complete-documentation.mdx#_snippet_24

LANGUAGE: typescript
CODE:
```
import { Project, ProjectAgent, Character } from '@elizaos/core';

// Define your character with bootstrap plugin
const character: Character = {
  name: 'MyAgent',
      bio: ['An intelligent agent powered by elizaOS'],
  plugins: [
    '@elizaos/plugin-sql',
    '@elizaos/plugin-bootstrap',
  ],
};

// Create the agent
const agent: ProjectAgent = {
  character,
  // Custom plugins go here at agent level
  plugins: [],
};

// Export the project
export const project = {
  agents: [agent]
};
```

----------------------------------------

TITLE: Start Agent Examples
DESCRIPTION: Illustrates starting agents using `elizaos agent start`, including starting by name, using local or remote character files, and specifying ports.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/agent.mdx#_snippet_3

LANGUAGE: bash
CODE:
```
# Start existing agent by name
elizaos agent start --name eliza

# Start with local character file
elizaos agent start --path ./characters/eliza.json

# Start from remote character file
elizaos agent start --remote-character https://example.com/characters/eliza.json

# Using alias
elizaos agent s --name eliza

# Start on specific port
elizaos agent start --path ./eliza.json --port 4000

**Required Configuration:**
You must provide one of these options: `--name`, `--path`, or `--remote-character`
```

----------------------------------------

TITLE: Installation Verification and Setup
DESCRIPTION: Commands to verify ElizaOS installation and set up the environment by sourcing the appropriate shell configuration file.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/plugins.mdx#_snippet_13

LANGUAGE: bash
CODE:
```
# Linux
source ~/.bashrc

# macOS with zsh
source ~/.zshrc

# Verify installation
bun --version
```

----------------------------------------

TITLE: Character Configuration Examples
DESCRIPTION: Illustrates how to specify character files for the `elizaos start` command, including single, multiple, local, remote, and differently formatted character files.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_2

LANGUAGE: bash
CODE:
```
# Start with single character file
elizaos start --character ./character.json

# Start with multiple character files
elizaos start --character ./char1.json ./char2.json

# Mix local files and URLs
elizaos start --character ./local.json https://example.com/remote.json

# Character files without .json extension
elizaos start --character assistant support-bot

# Comma-separated format also works
elizaos start --character "char1.json,char2.json"
```

----------------------------------------

TITLE: Configure ElizaOS Startup
DESCRIPTION: Sets the ElizaOS agent to load documents automatically when it starts. Requires the `LOAD_DOCS_ON_STARTUP` variable to be set to `true` in the `.env` file for this functionality.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/quick-start.mdx#_snippet_8

LANGUAGE: env
CODE:
```
LOAD_DOCS_ON_STARTUP=true
```

----------------------------------------

TITLE: Plugin Development Workflow
DESCRIPTION: Provides commands for managing and running elizaOS plugins during development and after deployment. Includes navigating to the plugin directory, installing dependencies, and starting the plugin in development or production mode.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_3

LANGUAGE: bash
CODE:
```
# Navigate to your plugin
cd plugin-my-plugin

# Install dependencies (automatically done by CLI)
bun install

# Start development mode with hot reloading
elizaos dev

# Or start in production mode
elizaos start
```

----------------------------------------

TITLE: Force Reconfiguration Example
DESCRIPTION: Demonstrates how to bypass saved configuration and reconfigure all services using the `--configure` flag with the `elizaos start` command.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_6

LANGUAGE: bash
CODE:
```
# Bypass saved configuration and reconfigure all services
elizaos start --configure
```

----------------------------------------

TITLE: Twitter Developer Account Setup Steps
DESCRIPTION: Guides users through the process of setting up a Twitter Developer Account, creating a new application, and configuring necessary permissions and callback URLs.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/complete-documentation.mdx#_snippet_6

LANGUAGE: bash
CODE:
```
1. Go to https://developer.twitter.com
2. Click "Sign up"
3. Complete application process
4. Wait for approval
```

LANGUAGE: bash
CODE:
```
1. Go to Developer Portal
2. Create new app
3. Name your app
4. Save app details
```

LANGUAGE: bash
CODE:
```
1. Go to app settings
2. Click "User authentication settings"
3. Enable OAuth 1.0a
4. Set permissions to "Read and write"
5. Add callback URL: http://localhost:3000/callback
6. Save settings
```

----------------------------------------

TITLE: README.md Structure for ElizaOS Plugin
DESCRIPTION: Provides essential documentation for an ElizaOS plugin, including its purpose, features, installation instructions, configuration details, usage examples, and API reference.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-publishing-guide.mdx#_snippet_5

LANGUAGE: markdown
CODE:
```
# My Awesome Plugin

A plugin that adds awesome functionality to elizaOS agents.

## Features

- <Icon icon="sparkles" /> Feature 1: Personalized greetings
- <Icon icon="rocket" /> Feature 2: Advanced responses
- <Icon icon="target" /> Feature 3: Custom actions

## Installation

```bash
elizaos plugins add @your-npm-username/plugin-my-awesome-plugin
```

## Configuration

Add to your agent's character file:

```json
{
  "plugins": ["@your-npm-username/plugin-my-awesome-plugin"]
}
```

## Usage

The plugin automatically adds the following actions:
- `GREET_USER`: Responds to hello messages

## API Reference

### Actions

#### GREET_USER
Greets the user with a personalized message.

**Trigger**: Messages containing "hello"
**Response**: Personalized greeting

## License

MIT

```

----------------------------------------

TITLE: Starting the ElizaOS Agent
DESCRIPTION: Command to start the ElizaOS agent. When configured with `LOAD_DOCS_ON_STARTUP=true`, the agent will automatically find, process, and create searchable embeddings from all documents in the configured 'docs' folder.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/examples.mdx#_snippet_4

LANGUAGE: bash
CODE:
```
elizaos start
```

----------------------------------------

TITLE: Create elizaOS Agent
DESCRIPTION: Creates a new elizaOS agent with a specified name. This command initiates the agent setup process.

SOURCE: https://github.com/elizaos/docs/blob/main/quickstart.mdx#_snippet_1

LANGUAGE: bash
CODE:
```
elizaos create <agent-name>
```

----------------------------------------

TITLE: Basic Development Mode Example
DESCRIPTION: Demonstrates how to start the elizaOS development server. It includes navigating to the project directory and initiating the development mode.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/dev.mdx#_snippet_1

LANGUAGE: bash
CODE:
```
# Navigate to your project directory
cd my-agent-project

# Start development mode
elizaos dev
```

----------------------------------------

TITLE: Project Templates: Starter Project
DESCRIPTION: Steps to create and run a starter ElizaOS project using the command line. Includes creating the project directory, installing dependencies, and starting the application.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/projects.mdx#_snippet_5

LANGUAGE: bash
CODE:
```
elizaos create my-agent
cd my-agent
bun install
bun start
```

----------------------------------------

TITLE: Post-Clone Setup and Development
DESCRIPTION: Commands to run after cloning the monorepo, including installing dependencies, building the project, and starting the development server.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/monorepo.mdx#_snippet_1

LANGUAGE: bash
CODE:
```
cd eliza
bun i && bun run build
bun run dev
bun test
bun run build
cd packages/client-web
bun dev
```

----------------------------------------

TITLE: ElizaOS Project Creation Next Steps
DESCRIPTION: After a project is created, the ElizaOS CLI installs dependencies, builds the project, and provides instructions to start the application. This snippet shows the typical commands to navigate into the project directory and start the development server.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/create.mdx#_snippet_5

LANGUAGE: bash
CODE:
```
cd myproject
elizaos start
# Visit http://localhost:3000
```

----------------------------------------

TITLE: Writing Teaching Examples
DESCRIPTION: Demonstrates how to create comprehensive teaching examples for actions, covering typical use cases, edge cases, and scenarios where the action might be ignored.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_25

LANGUAGE: typescript
CODE:
```
examples: [
  // Show the happy path
  [
    { name: '{{user}}', content: { text: 'Please do X' } },
    {
      name: '{{agent}}',
      content: {
        text: 'Doing X now!',
        actions: ['DO_X'],
      },
    },
  ],
  // Show edge cases
  [
    { name: '{{user}}', content: { text: 'Do X without permission' } },
    {
      name: '{{agent}}',
      content: {
        text: "I don't have permission for that",
        actions: ['REPLY'],
      },
    },
  ],
  // Show the action being ignored when not relevant
  [
    { name: '{{user}}', content: { text: 'Unrelated conversation' } },
    {
      name: '{{agent}}',
      content: {
        text: 'Responding normally',
        actions: ['REPLY'],
      },
    },
  ],
];

```

----------------------------------------

TITLE: Environment Variable Loading Examples
DESCRIPTION: Shows how elizaOS loads environment variables, both from a `.env` file in the project directory and directly from the command line.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_7

LANGUAGE: bash
CODE:
```
# elizaOS looks for .env in the project directory
cd my-project
elizaos start  # Loads from ./my-project/.env

# Set variables directly
OPENAI_API_KEY=your-key elizaos start

# Multiple variables
OPENAI_API_KEY=key1 DISCORD_TOKEN=token1 elizaos start
```

----------------------------------------

TITLE: Basic Provider Example
DESCRIPTION: A simple example of creating a Provider. It includes a name and a `get` method that returns static contextual information.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/plugins/providers.mdx#_snippet_1

LANGUAGE: typescript
CODE:
```
const provider: Provider = {
  name: 'MY_DATA',
  get: async (runtime, message, state) => {
    return {
      text: "Contextual information",
      data: { key: "value" }
    };
  }
};
```

----------------------------------------

TITLE: Example HTTP Route Implementation
DESCRIPTION: An example demonstrating how to define a simple GET route named 'hello-world-route' that responds with a JSON message.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/overview.mdx#_snippet_7

LANGUAGE: typescript
CODE:
```
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

```

----------------------------------------

TITLE: Troubleshooting ElizaOS Build Failures
DESCRIPTION: Provides solutions for build failures in ElizaOS projects. It suggests building separately, checking for build errors, and ensuring dependencies are installed.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_15

LANGUAGE: bash
CODE:
```
# Build separately and check for errors
bun run build

# If build succeeds, then start
elizaos start

# Install dependencies if missing
bun install
bun run build
elizaos start
```

----------------------------------------

TITLE: Troubleshooting ElizaOS Configuration Problems
DESCRIPTION: Guides users on how to fix ElizaOS configuration issues, including forcing reconfiguration, checking environment variables, and resetting the environment.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_14

LANGUAGE: bash
CODE:
```
# Force reconfiguration to fix corrupted settings
elizaos start --configure

# Check environment variables
elizaos env list

# Reset environment if needed
elizaos env reset
elizaos start --configure
```

----------------------------------------

TITLE: Production .env Configuration
DESCRIPTION: Example `.env` file for a production ElizaOS setup. Includes essential AI and knowledge configurations, such as API keys and document loading settings, along with optional enhancements.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/examples.mdx#_snippet_7

LANGUAGE: env
CODE:
```
# AI Configuration
OPENAI_API_KEY=sk-...

# Knowledge Configuration
LOAD_DOCS_ON_STARTUP=true
KNOWLEDGE_PATH=/var/app/support-docs

# Optional: For better processing
CTX_KNOWLEDGE_ENABLED=true
OPENROUTER_API_KEY=sk-or-...  # For enhanced context
```

----------------------------------------

TITLE: Build and Start ElizaOS
DESCRIPTION: Illustrates the process of building the project separately before starting the ElizaOS application. This ensures that the application is built correctly before execution.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_9

LANGUAGE: bash
CODE:
```
# Build separately before starting
bun run build
elizaos start
```

----------------------------------------

TITLE: Quick Verification Steps
DESCRIPTION: Provides steps for verifying a successful ElizaOS setup. Includes checking logs for document loading, interacting with the agent to test knowledge retrieval, and inspecting the Knowledge tab.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/examples.mdx#_snippet_11

LANGUAGE: text
CODE:
```
1. Check the logs when starting:
   ```
   [INFO] Loaded 15 documents from docs folder on startup
   ```

2. Ask the agent about your documents:
   ```
   You: "What documents do you have about pricing?"
   Agent: "I have information about pricing from pricing-tiers.md and product-overview.pdf..."
   ```

3. Use the Knowledge tab to see all loaded documents
```

----------------------------------------

TITLE: PostgreSQL Connection String Examples
DESCRIPTION: Provides examples of connection strings for various PostgreSQL-compatible databases, including Supabase, Neon, and standard PostgreSQL setups.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/sql/database-adapters.mdx#_snippet_5

LANGUAGE: bash
CODE:
```
# Supabase
POSTGRES_URL=postgresql://postgres:[password]@[project].supabase.co:5432/postgres

# Neon
POSTGRES_URL=postgresql://[user]:[password]@[project].neon.tech/[database]?sslmode=require

# Standard PostgreSQL
POSTGRES_URL=postgresql://user:password@localhost:5432/mydb
```

----------------------------------------

TITLE: Prompt Composition Migration Examples
DESCRIPTION: Examples demonstrating the migration of prompt composition from v0 `composeContext` to v1 `composePrompt` for both simple and complex state objects.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/prompt-and-generation-guide.mdx#_snippet_2

LANGUAGE: typescript
CODE:
```
// v0
const prompt = composeContext({
  state: { userName: 'Alice', topic: 'weather' },
  template: "Hello {{userName}}, let's talk about {{topic}}",
});

// v1
const prompt = composePrompt({
  state: { userName: 'Alice', topic: 'weather' },
  template: "Hello {{userName}}, let's talk about {{topic}}",
});
```

LANGUAGE: typescript
CODE:
```
// v0
const prompt = composeContext({
  state: currentState,
  template: messageTemplate,
  templatingEngine: 'handlebars',
});

// v1 - Use composePromptFromState for State objects
const prompt = composePromptFromState({
  state: currentState,
  template: messageTemplate,
});
```

----------------------------------------

TITLE: Health Check Examples
DESCRIPTION: Demonstrates how to perform health checks on a running elizaOS service using `curl`, `ps`, and `tail` commands.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_5

LANGUAGE: bash
CODE:
```
# Verify service is running
curl http://localhost:3000/health

# Check process status
ps aux | grep elizaos

# Monitor logs
tail -f elizaos.log
```

----------------------------------------

TITLE: ElizaOS Related Commands
DESCRIPTION: Lists related ElizaOS commands for project creation, development, agent management, and environment configuration.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_17

LANGUAGE: bash
CODE:
```
- [`create`](/cli-reference/create): Create a new project to start
- [`dev`](/cli-reference/dev): Run in development mode with hot reloading
- [`agent`](/cli-reference/agent): Manage individual agents
- [`env`](/cli-reference/env): Configure environment variables
```

----------------------------------------

TITLE: Check Node.js Version
DESCRIPTION: Displays the currently installed Node.js version. Used for verifying prerequisites.

SOURCE: https://github.com/elizaos/docs/blob/main/quickstart.mdx#_snippet_4

LANGUAGE: bash
CODE:
```
node --version
```

----------------------------------------

TITLE: Standard Test Setup
DESCRIPTION: Demonstrates the standard setup for testing actions in ElizaOS, allowing for overrides of messages, state, and runtime behavior for isolated testing.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/testing-guide.mdx#_snippet_8

LANGUAGE: typescript
CODE:
```
const setup = setupActionTest({
  messageOverrides: {
    /* custom message props */
  },
  stateOverrides: {
    /* custom state */
  },
  runtimeOverrides: {
    /* custom runtime behavior */
  },
});
```

----------------------------------------

TITLE: Service Implementation Example
DESCRIPTION: Demonstrates how to implement a custom service within a plugin. It shows the basic structure of a `Service` class with `start` and `stop` methods, including an example of setting up an interval timer.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/plugins.mdx#_snippet_1

LANGUAGE: typescript
CODE:
```
class MyService extends Service {
  async start() {
    // Initialize service
    setInterval(() => this.checkUpdates(), 60000);
  }
  
  async stop() {
    // Cleanup
  }
}
```

----------------------------------------

TITLE: Setup Action Test Utilities
DESCRIPTION: Demonstrates how to use the `setupActionTest` utility to initialize mocks for runtime, message, and state before each test case for an action.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/testing-guide.mdx#_snippet_0

LANGUAGE: typescript
CODE:
```
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

----------------------------------------

TITLE: Multi-Account Twitter Setup
DESCRIPTION: Shows how to configure and manage multiple Twitter accounts within ElizaOS. It involves creating separate Twitter clients for each account and starting their respective services.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/complete-documentation.mdx#_snippet_21

LANGUAGE: typescript
CODE:
```
// Create multiple Twitter clients
const mainAccount = await twitterService.createClient(
  runtime,
  'main-account',
  mainAccountConfig
);

const supportAccount = await twitterService.createClient(
  runtime,
  'support-account',
  supportAccountConfig
);

// Each client operates independently
mainAccount.post.start();
supportAccount.interaction.start();
```

----------------------------------------

TITLE: Custom Test Reporter
DESCRIPTION: An example of a custom Vitest reporter class (`TwitterTestReporter`) that logs specific messages when tests related to 'twitter' start and complete. It provides visual feedback on test execution.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/testing-guide.mdx#_snippet_16

LANGUAGE: typescript
CODE:
```
// Custom reporter for Twitter-specific tests
export class TwitterTestReporter {
  onTestStart(test: Test) {
    if (test.name.includes('twitter')) {
      console.log(`🐦 Running: ${test.name}`);
    }
  }
  
  onTestComplete(test: Test, result: TestResult) {
    if (test.name.includes('twitter')) {
      const emoji = result.status === 'passed' ? '✅' : '❌';
      console.log(`${emoji} ${test.name}: ${result.duration}ms`);
    }
  }
}
```

----------------------------------------

TITLE: Install Prettier
DESCRIPTION: Installs Prettier as a development dependency using Bun. This command is used to add the code formatting tool to your project.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/completion-requirements.mdx#_snippet_11

LANGUAGE: bash
CODE:
```
bun add -d prettier
```

----------------------------------------

TITLE: Basic Discord Bot Setup
DESCRIPTION: Sets up a basic Discord bot that responds to user messages. It requires Discord application ID and API token. The bot can be configured with message examples for its personality.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/discord/examples.mdx#_snippet_0

LANGUAGE: typescript
CODE:
```
import {
  AgentRuntime
} from '@elizaos/core';
import {
  discordPlugin
} from '@elizaos/plugin-discord';
import {
  bootstrapPlugin
} from '@elizaos/plugin-bootstrap';

const character = {
  name: "SimpleBot",
  description: "A simple Discord bot",
  plugins: [bootstrapPlugin, discordPlugin],
  clients: ["discord"],
  settings: {
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
    DISCORD_API_TOKEN: process.env.DISCORD_API_TOKEN
  },
  // Message examples for the bot's personality
  messageExamples: [
    {
      user: "user",
      content: {
        text: "Hello!"
      },
      response: {
        text: "Hello! How can I help you today?"
      }
    },
    {
      user: "user",
      content: {
        text: "What can you do?"
      },
      response: {
        text: "I can chat with you, answer questions, and help with various tasks!"
      }
    }
  ]
};

// Create and start the runtime
const runtime = new AgentRuntime({
  character
});
await runtime.start();
```

----------------------------------------

TITLE: Minimal Agent Setup
DESCRIPTION: Defines a basic agent character with essential plugins like SQL, OpenAI, and bootstrap for message handling. It includes name, description, system prompt, and style guidelines.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_0

LANGUAGE: typescript
CODE:
```
import { type Character } from '@elizaos/core';

// Define a minimal character
export const character: Character = {
  name: 'Assistant',
  description: 'A helpful AI assistant',
  plugins: [
    '@elizaos/plugin-sql', // For memory storage
    '@elizaos/plugin-openai',
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

----------------------------------------

TITLE: Telegram Webhook Setup and Express Handler
DESCRIPTION: Details the configuration of Telegram webhooks for production environments, including setting the webhook URL and optionally providing a certificate. It also provides an example of an Express.js route to handle incoming webhook updates.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/telegram/complete-documentation.mdx#_snippet_32

LANGUAGE: typescript
CODE:
```
// Set webhook
await bot.telegram.setWebhook('https://your-domain.com/telegram-webhook', {
  certificate: fs.readFileSync('path/to/cert.pem'), // Optional
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true
});

// Express webhook handler
app.post('/telegram-webhook', (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

```

----------------------------------------

TITLE: Troubleshooting ElizaOS Startup Failures
DESCRIPTION: Offers solutions for ElizaOS startup failures, including checking for and terminating conflicting processes. It guides users on how to restart the application after resolving conflicts.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_11

LANGUAGE: bash
CODE:
```
# Check if another instance is running
ps aux | grep elizaos
pkill -f elizaos

# Press Ctrl+C in the terminal where elizaos start is running
elizaos start
```

----------------------------------------

TITLE: Create New Plugin
DESCRIPTION: Uses the elizaOS CLI to create a new plugin project. It guides the user through an interactive wizard and navigates into the newly created plugin directory.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-publishing-guide.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
# Create a new plugin with the interactive wizard
elizaos create -t plugin my-awesome-plugin

# Navigate to your plugin directory
cd plugin-my-awesome-plugin
```

----------------------------------------

TITLE: Example Avalanche Plugin Configuration
DESCRIPTION: An example of the 'agentConfig' section for an Avalanche plugin, specifying a required and sensitive 'AVALANCHE_PRIVATE_KEY' parameter.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/completion-requirements.mdx#_snippet_5

LANGUAGE: json
CODE:
```
"agentConfig": {
    "pluginType": "elizaos:plugin:1.0.0",
    "pluginParameters": {
        "AVALANCHE_PRIVATE_KEY": {
            "type": "string",
            "description": "Private key for interacting with Avalanche blockchain",
            "required": true,
            "sensitive": true
        }
    }
}
```

----------------------------------------

TITLE: package.json Exports Configuration Example
DESCRIPTION: Example configuration for the 'exports' field in package.json, specifying how different module types (import) should be resolved.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/completion-requirements.mdx#_snippet_3

LANGUAGE: json
CODE:
```
"exports": {
    "./package.json": "./package.json",
    ".": {
        "import": {
            "types": "./dist/index.d.ts",
            "default": "./dist/index.js"
        }
    }
}
```

----------------------------------------

TITLE: Start ElizaOS Agent
DESCRIPTION: Command to start the ElizaOS agent from the terminal. This command assumes the ElizaOS CLI is installed and configured.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/agents.mdx#_snippet_9

LANGUAGE: bash
CODE:
```
elizaos start
```

----------------------------------------

TITLE: Clear and Rebuild ElizaOS Project
DESCRIPTION: This snippet demonstrates how to clean the build artifacts and dependencies (dist, node_modules), install new dependencies using bun, and then build the project.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-publishing-guide.mdx#_snippet_8

LANGUAGE: bash
CODE:
```
rm -rf dist node_modules
bun install
bun run build
```

----------------------------------------

TITLE: elizaOS Start Command Usage
DESCRIPTION: Launches elizaOS projects and agents in production mode. Supports reconfiguration, character file loading, and custom port settings.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
elizaos start [options]

Options:
  -c, --configure    Reconfigure services and AI models
  --character <paths...>  Character file(s) to use
  -p, --port <port>      Port to listen on
```

----------------------------------------

TITLE: Start and Develop Projects
DESCRIPTION: Illustrates how to start an elizaOS project for production or development. The 'start' command runs the agent with configured plugins, while 'dev' enables hot reloading and file watching for rapid development.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/overview.mdx#_snippet_4

LANGUAGE: bash
CODE:
```
# Navigate to your project directory
cd my-agent-project

# Start the project
elizaos start

# Run in development mode with hot reloading
elizaos dev
```

----------------------------------------

TITLE: Plugin Development Commands
DESCRIPTION: Provides essential commands for managing and developing elizaOS plugins using Bun and the elizaOS CLI. These include installing dependencies, running the development server with hot reloading, executing tests, and building the plugin for distribution.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-publishing-guide.mdx#_snippet_3

LANGUAGE: bash
CODE:
```
# Install dependencies
bun install

# Start development mode with hot reload
elizaos dev

# Run tests
elizaos test

# Build your plugin
bun run build
```

----------------------------------------

TITLE: CI/CD Integration Example for GitHub Actions
DESCRIPTION: An example GitHub Actions workflow that automates the build, test, and publish process for an ElizaOS plugin upon a new release. It includes steps for checking out code, setting up Bun, installing dependencies, building, testing, and publishing to npm, utilizing `NPM_TOKEN` for authentication.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/publish.mdx#_snippet_14

LANGUAGE: yaml
CODE:
```
name: Publish
on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
      
      - name: Build
        run: bun run build
      
      - name: Test
        run: bun test
      
      - name: Publish to npm
        run: bun publish
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

----------------------------------------

TITLE: Environment Setup for Solana Testing
DESCRIPTION: Configuration details for setting up a testing environment, including a dedicated wallet's private key and an optional premium RPC URL for enhanced reliability during Solana mainnet testing.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/solana/testing-guide.mdx#_snippet_0

LANGUAGE: env
CODE:
```
# Use a dedicated test wallet
SOLANA_PRIVATE_KEY=test_wallet_private_key

# Optional - Use premium RPC for reliability
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

----------------------------------------

TITLE: Mock Factory Examples
DESCRIPTION: Provides examples of using factory functions to create mock objects for runtime, memory (message), state, and services, essential for isolating components during testing.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/testing-guide.mdx#_snippet_1

LANGUAGE: typescript
CODE:
```
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

// Create a mock service
const service = createMockService({
  serviceType: ServiceType.TASK,
});
```

----------------------------------------

TITLE: elizaos publish Examples
DESCRIPTION: Provides practical examples of using the `elizaos publish` command for standard publishing, testing, dry runs, and advanced scenarios like skipping registry submission.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/publish.mdx#_snippet_1

LANGUAGE: bash
CODE:
```
# Navigate to your plugin's root directory
cd my-awesome-plugin

# Publish to npm and the registry
elizaos publish
```

LANGUAGE: bash
CODE:
```
# Simulate the entire publish process without making changes
elizaos publish --test

# Generate registry submission files locally for inspection
elizaos publish --dry-run
```

LANGUAGE: bash
CODE:
```
# Publish to npm but do not open a PR to the registry
elizaos publish --skip-registry

# Test npm-only publishing (skip GitHub and registry)
elizaos publish --test --npm
```

----------------------------------------

TITLE: Development Mode with Build
DESCRIPTION: Demonstrates building the elizaOS project before starting the development server.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/dev.mdx#_snippet_4

LANGUAGE: bash
CODE:
```
# Build before starting development
elizaos dev --build
```

----------------------------------------

TITLE: Build Verification Commands
DESCRIPTION: Commands to clean build artifacts, install dependencies using Bun, and build the project. This verifies the setup and ensures the build process completes successfully.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/migration-guide.mdx#_snippet_11

LANGUAGE: bash
CODE:
```
# Clean all build artifacts and dependencies
rm -rf dist node_modules .turbo

# Install dependencies with Bun
bun install

# Build the project
bun run build
```

----------------------------------------

TITLE: Check Node.js Version
DESCRIPTION: Verifies the currently installed Node.js version. elizaOS requires Node.js version 23.3 or higher for optimal performance and compatibility.

SOURCE: https://github.com/elizaos/docs/blob/main/quickstart.mdx#_snippet_5

LANGUAGE: bash
CODE:
```
node --version
```

----------------------------------------

TITLE: Decision-Making Action Example
DESCRIPTION: An example of a decision-making action in ElizaOS that uses an LLM to determine whether to mute a room based on conversation context.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_17

LANGUAGE: typescript
CODE:
```
export const muteRoomAction: Action = {
  name: 'MUTE_ROOM',
  similes: ['SHUT_UP', 'BE_QUIET', 'STOP_TALKING', 'SILENCE'],
  description: 'Mutes a room if asked to or if the agent is being annoying',

  validate: async (runtime, message) => {
    // Check if already muted
    const roomState = await runtime.getParticipantUserState(message.roomId, runtime.agentId);
    return roomState !== 'MUTED';
  },

  handler: async (runtime, message, state) => {
    // Create a decision prompt
    const shouldMuteTemplate = `# Task: Should {{agentName}} mute this room?

{{recentMessages}}

Should {{agentName}} mute and stop responding unless mentioned?

Respond YES if:
- User asked to stop/be quiet
- Agent responses are annoying users
- Conversation is hostile

Otherwise NO.`;

    const prompt = composePromptFromState({ state, template: shouldMuteTemplate });
    const decision = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      runtime,
    });

    if (decision.toLowerCase().includes('yes')) {
      await runtime.setParticipantUserState(message.roomId, runtime.agentId, 'MUTED');

      return {
        success: true,
        text: 'Going silent in this room',
        values: { roomMuted: true },
      };
    }

    return {
      success: true,
      text: 'Continuing to participate',
      values: { roomMuted: false },
    };
  },
};
```

----------------------------------------

TITLE: Dynamic Provider Example
DESCRIPTION: An example of a dynamic Provider, indicated by the `dynamic: true` flag. This provider fetches the latest data each time its `get` method is called.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/plugins/providers.mdx#_snippet_2

LANGUAGE: typescript
CODE:
```
const dynamicProvider: Provider = {
  name: 'LIVE_DATA',
  dynamic: true,  // Re-fetched each time
  get: async (runtime) => {
    const data = await fetchLatestData();
    return { data };
  }
};
```

----------------------------------------

TITLE: Minimal ElizaOS Plugin Example
DESCRIPTION: Demonstrates the structure of a minimal viable ElizaOS plugin, including its `name`, `description`, and a basic `actions` array with a 'HELLO' action that returns a greeting.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_73

LANGUAGE: typescript
CODE:
```
// Minimal viable plugin
import { Plugin } from '@elizaos/core';

export const minimalPlugin: Plugin = {
  name: 'minimal',
  description: 'A minimal plugin example',
  actions: [
    {
      name: 'HELLO',
      description: 'Says hello',
      validate: async () => true,
      handler: async (runtime, message, state, options, callback) => {
        callback?.({ text: 'Hello from minimal plugin!' });
        return true;
      },
      examples: [],
    },
  ],
};

export default minimalPlugin;
```

----------------------------------------

TITLE: Install Mintlify CLI
DESCRIPTION: Installs the Mintlify CLI globally using bun, which is required for local development and previewing documentation changes.

SOURCE: https://github.com/elizaos/docs/blob/main/README.md#_snippet_0

LANGUAGE: bash
CODE:
```
bun install -g mint
```

----------------------------------------

TITLE: Quick Weather Plugin Example
DESCRIPTION: A concise example of a weather plugin. It defines a provider to fetch weather data and an action to report the current temperature. The `get` method in the provider fetches data, and the `handler` in the action formats the response.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/plugins.mdx#_snippet_4

LANGUAGE: typescript
CODE:
```
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

----------------------------------------

TITLE: Start ElizaOS Agent
DESCRIPTION: Command to start the ElizaOS agent, which is necessary for accessing the web interface and interacting with the Knowledge Plugin.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/quick-start.mdx#_snippet_3

LANGUAGE: bash
CODE:
```
elizaos start
```

----------------------------------------

TITLE: OpenRouter and OpenAI Configuration
DESCRIPTION: Shows how to configure the agent to use OpenRouter for chat while still utilizing OpenAI for embeddings, including necessary plugin and environment variable setup.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/quick-start.mdx#_snippet_6

LANGUAGE: typescript
CODE:
```
export const character = {
  name: 'MyAgent',
  plugins: [
    '@elizaos/plugin-openrouter',
    '@elizaos/plugin-openai', // â20ac; Make sure you have this as openrouter doesn't support embeddings
    '@elizaos/plugin-knowledge', // â20ac; Add this line
    // ... your other plugins
  ],
  // ... rest of your character config
};
```

LANGUAGE: env
CODE:
```
OPENROUTER_API_KEY=your-openrouter-api-key
OPENAI_API_KEY=your-openai-api-key
```

----------------------------------------

TITLE: Installing Bun
DESCRIPTION: This section provides commands for installing the Bun runtime on different operating systems. It includes instructions for Linux/macOS, Windows, and macOS with Homebrew. After installation, it's recommended to restart the terminal or source the shell configuration file.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/create.mdx#_snippet_8

LANGUAGE: shell
CODE:
```
# Linux/macOS:
curl -fsSL https://bun.sh/install | bash

# Windows:
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS with Homebrew:
brew install bun

# After installation, restart your terminal or:
source ~/.bashrc  # Linux
source ~/.zshrc   # macOS with zsh

# Verify installation:
bun --version
```

----------------------------------------

TITLE: Post-Clone Setup Commands
DESCRIPTION: Commands to run after cloning the monorepo, including installing dependencies and building the project using Bun.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/monorepo.mdx#_snippet_5

LANGUAGE: bash
CODE:
```
cd eliza
bun i && bun run build
```

----------------------------------------

TITLE: Test Setup and Mocking
DESCRIPTION: Sets up the test environment by loading environment variables from `.env.test` and defining global test utilities using Vitest's mocking capabilities. It includes a `createMockRuntime` function to generate mock objects for testing, and a cleanup function to close connections after all tests.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/discord/testing-guide.mdx#_snippet_12

LANGUAGE: typescript
CODE:
```
// tests/setup.ts
import { config } from 'dotenv';
import { vi } from 'vitest';

// Load test environment
config({ path: '.env.test' });

// Global test utilities
global.createMockRuntime = () => ({
  processMessage: vi.fn(),
  character: { name: 'TestBot' },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  },
  getSetting: vi.fn((key) => process.env[key]),
  getService: vi.fn()
});

// Cleanup after tests
afterAll(async () => {
  // Close all connections
  await cleanup();
});
```

----------------------------------------

TITLE: Session Metadata Example
DESCRIPTION: Demonstrates how to include platform-specific metadata when creating or updating a session, such as Discord user information.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/sessions-api-guide.mdx#_snippet_6

LANGUAGE: javascript
CODE:
```
{
  metadata: {
    platform: 'discord',
    username: 'user#1234',
    discriminator: '1234',
    avatar: 'https://cdn.discord.com/avatars/...',
    guildId: 'guild-id',
    channelId: 'channel-id'
  }
}
```

----------------------------------------

TITLE: Service Registration Example
DESCRIPTION: Demonstrates how to register a service, such as the DiscordService, within a plugin. Services are automatically registered and started during the runtime initialization process.

SOURCE: https://github.com/elizaos/docs/blob/main/deep-dive/services.mdx#_snippet_5

LANGUAGE: typescript
CODE:
```
// In a plugin
export const discordPlugin: Plugin = {
  name: 'discord',
  services: [DiscordService],
  
  init: async (config, runtime) => {
    // Services auto-registered and started
  }
};

```

----------------------------------------

TITLE: Dynamic Knowledge Provider Example
DESCRIPTION: An example of a dynamic provider that fetches relevant knowledge from a knowledge base based on the user's message. It only runs when explicitly requested and returns formatted knowledge if found.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_37

LANGUAGE: typescript
CODE:
```
export const knowledgeProvider: Provider = {
  name: 'KNOWLEDGE',
  description: 'Knowledge from the knowledge base',
  dynamic: true, // Only runs when explicitly requested

  get: async (runtime, message) => {
    const knowledgeService = runtime.getService('knowledge');
    const relevantKnowledge = await knowledgeService.search(message.content.text);

    if (!relevantKnowledge.length) {
      return { text: '', values: {}, data: {} };
    }

    return {
      text: addHeader('# Relevant Knowledge', formatKnowledge(relevantKnowledge)),
      values: { knowledgeUsed: true },
      data: { knowledge: relevantKnowledge },
    };
  },
};

```

----------------------------------------

TITLE: Troubleshooting Dependency Installation
DESCRIPTION: If `bun install` fails, you can try manual installation. For network-related issues, clearing the Bun cache and retrying the installation can resolve the problem.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/create.mdx#_snippet_7

LANGUAGE: bash
CODE:
```
cd myproject
bun install

# For network issues, clear cache and retry
bun pm cache rm
bun install
```

----------------------------------------

TITLE: Simple Posting Bot Setup
DESCRIPTION: Creates a basic Twitter bot that posts autonomously using the @elizaos/plugin-twitter package. It requires Twitter API credentials and configures posting intervals.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/examples.mdx#_snippet_0

LANGUAGE: typescript
CODE:
```
import {
  AgentRuntime
} from '@elizaos/core';
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
    "The best code is no code, but sometimes you need to write some.",
    "Learning something new every day keeps the mind sharp."
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

// Create and start the runtime
const runtime = new AgentRuntime({ character });
await runtime.start();

console.log('Twitter bot is running and will post every 2-4 hours!');

```

----------------------------------------

TITLE: MyService Implementation
DESCRIPTION: Demonstrates the basic implementation of a custom service, including initialization, periodic tasks, and cleanup.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_13

LANGUAGE: typescript
CODE:
```
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

    // Initialize connections, clients, etc.
    await service.initialize();

    // Set up periodic tasks if needed
    service.refreshInterval = setInterval(
      () => service.refreshData(),
      60000 // 1 minute
    );

    return service;
  }

  async stop(): Promise<void> {
    // Cleanup resources
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    // Close connections
    if (this.client) {
      await this.client.disconnect();
    }
    logger.info('MyService stopped');
  }

  private async initialize(): Promise<void> {
    // Service initialization logic
    const apiKey = this.runtime.getSetting('MY_API_KEY');
    if (!apiKey) {
      throw new Error('MY_API_KEY not configured');
    }

    this.client = new MyClient({ apiKey });
    await this.client.connect();
  }
}
```

----------------------------------------

TITLE: Simple Action Handler Migration (v0 vs v1)
DESCRIPTION: Provides a complete example of migrating a simple action handler from v0 to v1, demonstrating changes in context composition, response generation, and parsing.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/prompt-and-generation-guide.mdx#_snippet_12

LANGUAGE: typescript
CODE:
```
// v0: Old Action Handler
import { composeContext, generateMessageResponse, ModelClass } from '@elizaos/core';

handler: async (runtime, message, state) => {
  // Compose context
  const context = composeContext({
    state,
    template: addressTemplate,
  });

  // Generate response
  const response = await generateMessageResponse({
    runtime,
    context,
    modelClass: ModelClass.SMALL,
  });

  const address = response.address;
  // Process address...
};
```

LANGUAGE: typescript
CODE:
```
// v1: New Action Handler
import { composePromptFromState, parseKeyValueXml, ModelType } from '@elizaos/core';

handler: async (runtime, message, state) => {
  // Compose prompt
  const prompt = composePromptFromState({
    state,
    template: addressTemplate, // Now using XML format
  });

  // Generate response
  const xmlResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
    prompt,
  });

  // Parse XML
  const response = parseKeyValueXml(xmlResponse);
  const address = response.address;
  // Process address...
};
```

----------------------------------------

TITLE: GitHub Actions CI Workflow for Tests
DESCRIPTION: An example GitHub Actions workflow that checks out code, sets up Bun, installs dependencies, and runs elizaOS tests.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/test.mdx#_snippet_6

LANGUAGE: yaml
CODE:
```
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
      
      - name: Run tests
        run: elizaos test
```

----------------------------------------

TITLE: Scaffolding Plugins with elizaOS CLI
DESCRIPTION: Demonstrates how to create new elizaOS plugins using the command-line interface. The CLI supports interactive creation and allows specifying plugin types like 'Quick Plugin' (backend only) or 'Full Plugin' (with frontend).

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
# Interactive plugin creation
elizaos create

# Or specify the name directly
elizaos create my-plugin --type plugin
```

----------------------------------------

TITLE: Use Plugin in Project (Linked)
DESCRIPTION: Example of importing and using a plugin after linking it externally.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_10

LANGUAGE: typescript
CODE:
```
import { myPlugin } from '@yourorg/plugin-myplugin';

const agent = {
  name: 'MyAgent',
  plugins: [myPlugin],
};
```

----------------------------------------

TITLE: Development Mode with Combined Options
DESCRIPTION: Provides an example of using multiple options simultaneously for a comprehensive development setup, including port, character files, build, and configuration.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/dev.mdx#_snippet_8

LANGUAGE: bash
CODE:
```
# Full development setup
elizaos dev --port 4000 --character "assistant.json,chatbot.json" --build --configure
```

----------------------------------------

TITLE: Get Agent Details Examples
DESCRIPTION: Shows how to retrieve agent details using the `elizaos agent get` command, covering retrieval by name, ID, index, JSON output, and saving to a file.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/agent.mdx#_snippet_2

LANGUAGE: bash
CODE:
```
# Get agent details by name
elizaos agent get --name eliza

# Get agent by ID
elizaos agent get --name agent_123456

# Get agent by index from list
elizaos agent get --name 0

# Display configuration as JSON in console
elizaos agent get --name eliza --json
# Or using the shorthand
elizaos agent get --name eliza -j

# Save agent configuration to file
elizaos agent get --name eliza --output

# Save to specific file
elizaos agent get --name eliza --output ./my-agent.json

# Using alias
elizaos agent g --name eliza
```

----------------------------------------

TITLE: Run Local Development Server
DESCRIPTION: Starts a local development server for previewing documentation changes in real-time. Assumes you are in the root directory containing docs.json.

SOURCE: https://github.com/elizaos/docs/blob/main/README.md#_snippet_1

LANGUAGE: bash
CODE:
```
mint dev
```

----------------------------------------

TITLE: Add Workspace Dependency
DESCRIPTION: Example of adding a plugin as a workspace dependency in the root `package.json`.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_5

LANGUAGE: json
CODE:
```
{
  "dependencies": {
    "@elizaos/plugin-knowledge": "workspace:*",
    "@yourorg/plugin-myplugin": "workspace:*"
  }
}
```

----------------------------------------

TITLE: Troubleshooting Common Issues
DESCRIPTION: Offers solutions for common ElizaOS problems, such as documents not loading or the agent failing to find information. Guides users to check configuration, file paths, permissions, and query specificity.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/examples.mdx#_snippet_12

LANGUAGE: text
CODE:
```
No documents loading?
- Check `LOAD_DOCS_ON_STARTUP=true` is set
- Verify `docs` folder exists and has files
- Check file permissions

Agent not finding information?
- Ensure documents contain the information
- Try more specific questions
- Check the Knowledge tab to verify documents are loaded
```

----------------------------------------

TITLE: Bun Installation
DESCRIPTION: Instructions for installing the Bun runtime environment, which may be required for certain ElizaOS operations. Includes commands for Linux/macOS, Windows, and macOS with Homebrew.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/plugins.mdx#_snippet_12

LANGUAGE: bash
CODE:
```
# Linux/macOS:
curl -fsSL https://bun.sh/install | bash

# Windows:
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS with Homebrew:
brew install bun
```

----------------------------------------

TITLE: Start ElizaOS with a Custom Port
DESCRIPTION: Demonstrates how to start the ElizaOS application with a specified custom port. It also includes a command to check if the port is currently in use.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_8

LANGUAGE: bash
CODE:
```
# Specify custom port
elizaos start --port 8080

# Check if port is available first
netstat -an | grep :8080
```

----------------------------------------

TITLE: Recent Messages Provider Example
DESCRIPTION: An example provider that retrieves and formats recent messages from the conversation history. It demonstrates fetching memories based on room ID and conversation length, and formatting them for the LLM.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_35

LANGUAGE: typescript
CODE:
```
export const recentMessagesProvider: Provider = {
  name: 'RECENT_MESSAGES',
  description: 'Recent messages, interactions and other memories',
  position: 100, // Runs after most other providers

  get: async (runtime, message) => {
    const messages = await runtime.getMemories({
      roomId: message.roomId,
      count: runtime.getConversationLength(),
      unique: false,
    });

    const formattedMessages = formatMessages(messages);

    return {
      text: addHeader('# Conversation Messages', formattedMessages),
      values: { recentMessages: formattedMessages },
      data: { messages },
    };
  },
};

```

----------------------------------------

TITLE: Development .env Configuration
DESCRIPTION: A minimal `.env` file configuration for development and testing of ElizaOS. Focuses on essential settings like the API key and document loading for a streamlined setup.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/examples.mdx#_snippet_8

LANGUAGE: env
CODE:
```
# Minimal setup for testing
OPENAI_API_KEY=sk-...
LOAD_DOCS_ON_STARTUP=true
# Docs in default ./docs folder
```

----------------------------------------

TITLE: Troubleshooting ElizaOS Service Connection Issues
DESCRIPTION: Offers steps to resolve service connection problems in ElizaOS, such as checking internet connectivity, verifying API keys, and testing with minimal configuration.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_16

LANGUAGE: bash
CODE:
```
# Check internet connectivity
ping google.com

# Verify API keys are set
elizaos env list

# Test with minimal configuration
elizaos start --configure
```

----------------------------------------

TITLE: Start elizaOS Agent
DESCRIPTION: Command to start the elizaOS development server to test your customized agent. Accessible via http://localhost:3000.

SOURCE: https://github.com/elizaos/docs/blob/main/development.mdx#_snippet_7

LANGUAGE: bash
CODE:
```
elizaos start
```

----------------------------------------

TITLE: Example HTTP Route Registration
DESCRIPTION: Demonstrates how to define a GET endpoint for a 'hello-world-route' using the Route type. The handler function sends a JSON response with a 'Hello World!' message.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/overview.mdx#_snippet_10

LANGUAGE: typescript
CODE:
```
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
```

----------------------------------------

TITLE: Project Templates: Custom Project Setup
DESCRIPTION: Commands to set up a custom ElizaOS project from scratch. This involves creating a new directory, initializing a Node.js project, and adding necessary ElizaOS core and plugin packages.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/projects.mdx#_snippet_6

LANGUAGE: bash
CODE:
```
mkdir my-project && cd my-project
bun init
bun add @elizaos/core @elizaos/cli
bun add @elizaos/plugin-bootstrap
```

----------------------------------------

TITLE: Database Adapter Plugin Example
DESCRIPTION: An example of a SQL database adapter plugin for ElizaOS. It demonstrates how to create and register a database adapter with the runtime, including dynamic schema migrations.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/overview.mdx#_snippet_9

LANGUAGE: typescript
CODE:
```
export const plugin: Plugin = {
  name: '@elizaos/plugin-sql',
  description: 'A plugin for SQL database access with dynamic schema migrations',
  priority: 0,
  schema,
  init: async (_, runtime: IAgentRuntime) => {
    const dbAdapter = createDatabaseAdapter(config, runtime.agentId);
    runtime.registerDatabaseAdapter(dbAdapter);
  }
};

```

----------------------------------------

TITLE: Listing Available Plugins
DESCRIPTION: Demonstrates how to list plugins available for installation in ElizaOS projects. Covers default behavior, using aliases, listing all plugins with version details, and filtering for v0.x compatible plugins.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/plugins.mdx#_snippet_1

LANGUAGE: bash
CODE:
```
# List available v1.x plugins (default behavior)
elizaos plugins list

# Using alias
elizaos plugins l

# List all plugins with detailed version information
elizaos plugins list --all

# List only v0.x compatible plugins
elizaos plugins list --v0
```

----------------------------------------

TITLE: ElizaOS Agent Lifecycle Workflow
DESCRIPTION: Outlines the steps for the agent lifecycle, including creating agent characters, starting the agent runtime, and managing agents through listing, starting, getting status, updating, stopping, clearing memories, and removing.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/agent.mdx#_snippet_9

LANGUAGE: bash
CODE:
```
# Create character file
elizaos create -type agent eliza

# Or create project with character
elizaos create -type project my-project
```

LANGUAGE: bash
CODE:
```
# Start the agent runtime server
elizaos start
```

LANGUAGE: bash
CODE:
```
# List available agents
elizaos agent list

# Start an agent
elizaos agent start --path ./eliza.json

# Check agent status
elizaos agent get --name eliza

# Update configuration
elizaos agent set --name eliza --config '{"system":"Updated prompt"}'

# Stop agent
elizaos agent stop --name eliza

# Clear agent memories if needed
elizaos agent clear-memories --name eliza

# Remove when no longer needed
elizaos agent remove --name eliza
```

----------------------------------------

TITLE: Complete Chat Application Example
DESCRIPTION: Demonstrates a complete chat application flow using the Sessions API, including session creation and message sending, highlighting the reduction in API calls compared to traditional methods.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/sessions-api-guide.mdx#_snippet_1

LANGUAGE: javascript
CODE:
```
// Initialize a chat with an agent - that's all the setup needed!
async function startChat(agentId, userId) {
  // One API call to create session
  const response = await fetch('/api/messaging/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, userId })
  });
  
  const { sessionId } = await response.json();
  
  // Now you can immediately start chatting
  return sessionId;
}

// Send messages without any channel management
async function sendMessage(sessionId, message) {
  const response = await fetch(
    `/api/messaging/sessions/${sessionId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    }
  );
  
  return response.json();
}

// That's it! No servers, channels, or participant management needed
```

----------------------------------------

TITLE: Loading Documents via Docs Folder
DESCRIPTION: Describes the recommended method for loading documents in ElizaOS by placing them in the `docs` folder and enabling `LOAD_DOCS_ON_STARTUP`. This ensures automatic loading upon agent startup.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/examples.mdx#_snippet_9

LANGUAGE: text
CODE:
```
1. Put your documents in the docs folder
2. Set LOAD_DOCS_ON_STARTUP=true
3. Start your agent
4. Documents are automatically loaded
```

----------------------------------------

TITLE: Get CLI Version and Help
DESCRIPTION: Demonstrates how to check the installed version of the elizaOS CLI and how to access help information for the CLI itself or specific commands like 'agent'.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/overview.mdx#_snippet_1

LANGUAGE: bash
CODE:
```
# Check your CLI version
elizaos --version

# Get help for the 'agent' command
elizaos agent --help

# Get help for the 'agent start' subcommand
elizaos agent start --help
```

----------------------------------------

TITLE: Use Plugin in Project (Workspace)
DESCRIPTION: Example of importing and using a plugin within a project when using workspace dependencies.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_6

LANGUAGE: typescript
CODE:
```
import { myPlugin } from '@yourorg/plugin-myplugin';

const agent = {
  name: 'MyAgent',
  plugins: [myPlugin],
};
```

----------------------------------------

TITLE: Starting ElizaOS Agent
DESCRIPTION: Command to start the ElizaOS agent after defining its character and plugins. This command initiates the agent's runtime environment.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/agents.mdx#_snippet_7

LANGUAGE: bash
CODE:
```
elizaos start
```

----------------------------------------

TITLE: Solana Swap Testing
DESCRIPTION: Procedure for testing swap functionalities, specifically using Jupiter for token swaps, with an example of swapping SOL for USDC.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/solana/testing-guide.mdx#_snippet_2

LANGUAGE: text
CODE:
```
Test swaps with small amounts:
```
User: Swap 0.1 SOL for USDC
Agent: [Should execute via Jupiter]
```
```

----------------------------------------

TITLE: EVM Plugin Swap Testing
DESCRIPTION: Example of testing the swap functionality of the EVM plugin with minimal amounts, verifying its ability to find optimal routes and execute trades.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/evm/testing-guide.mdx#_snippet_2

LANGUAGE: text
CODE:
```
```
User: Swap 0.01 ETH for USDC
Agent: [Should find best route and execute]
```
```

----------------------------------------

TITLE: Configure Document Loading
DESCRIPTION: Shows how to enable automatic document loading on agent startup by setting 'LOAD_DOCS_ON_STARTUP=true' in the .env file and organizing documents in a 'docs' folder.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/quick-start.mdx#_snippet_1

LANGUAGE: env
CODE:
```
LOAD_DOCS_ON_STARTUP=true
```

LANGUAGE: env
CODE:
```
OPENAI_API_KEY=your-api-key
```

----------------------------------------

TITLE: Create a New Project
DESCRIPTION: Shows how to initialize a new elizaOS project. It covers both the interactive wizard and specifying a project name directly on the command line.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/overview.mdx#_snippet_3

LANGUAGE: bash
CODE:
```
# Create a new project using the interactive wizard
elizaos create

# Or specify a name directly
elizaos create my-agent-project
```

----------------------------------------

TITLE: Unit Tests for MyAction
DESCRIPTION: Demonstrates unit testing for a plugin action using Bun's test runner, including mock setup and assertion for validation and execution.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_65

LANGUAGE: typescript
CODE:
```
// __tests__/myAction.test.ts
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { myAction } from '../src/actions/myAction';
import { createMockRuntime } from '@elizaos/test-utils';

describe('MyAction', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mock.restore();
  });

  it('should validate when configured', async () => {
    const mockRuntime = createMockRuntime({
      settings: {
        MY_API_KEY: 'test-key',
      },
    });

    const isValid = await myAction.validate(mockRuntime);
    expect(isValid).toBe(true);
  });

  it('should handle action execution', async () => {
    const mockRuntime = createMockRuntime();
    const mockService = {
      executeAction: mock().mockResolvedValue({ success: true }),
    };

    mockRuntime.getService = mock().mockReturnValue(mockService);

    const callback = mock();
    const result = await myAction.handler(mockRuntime, mockMessage, mockState, {}, callback);

    expect(result).toBe(true);
    expect(callback).toHaveBeenCalledWith({
      text: expect.stringContaining('Successfully'),
      content: expect.objectContaining({ success: true }),
    });
  });
});
```

----------------------------------------

TITLE: Add Linked Plugin Dependency
DESCRIPTION: Example of adding a linked plugin as a dependency in a project's `package.json`.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_9

LANGUAGE: json
CODE:
```
{
  "dependencies": {
    "@yourorg/plugin-myplugin": "link:@yourorg/plugin-myplugin"
  }
}
```

----------------------------------------

TITLE: Dynamic Action Registration Example
DESCRIPTION: Demonstrates how an action, `pluginLoaderAction`, can dynamically register new actions by loading them from an external plugin, enhancing extensibility.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_28

LANGUAGE: typescript
CODE:
```
// Actions can register other actions dynamically
export const pluginLoaderAction: Action = {
  name: 'LOAD_PLUGIN',

  handler: async (runtime, message, state) => {
    const pluginName = extractPluginName(state);
    const plugin = await import(pluginName);

    // Register new actions from the loaded plugin
    if (plugin.actions) {
      for (const action of plugin.actions) {
        runtime.registerAction(action);
      }
    }

    return {
      success: true,
      text: `Loaded ${plugin.actions.length} new actions`,
      values: {
        loadedPlugin: pluginName,
        newActions: plugin.actions.map((a) => a.name),
      },
    };
  },
};

```

----------------------------------------

TITLE: Server-Specific Context Example
DESCRIPTION: Illustrates the structure of server-specific context maintained by ElizaOS, including conversations, voice connections, and settings.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/discord/complete-documentation.mdx#_snippet_20

LANGUAGE: typescript
CODE:
```
// Server-specific context
const serverContext = new Map<string, ServerContext>();

interface ServerContext {
  guildId: string;
  conversations: Map<string, Conversation>;
  voiceConnection?: VoiceConnection;
  settings: ServerSettings;
}
```

----------------------------------------

TITLE: Troubleshooting ElizaOS Port Conflicts
DESCRIPTION: Provides steps to resolve port conflicts when starting ElizaOS. It shows how to identify processes using a specific port, change the ElizaOS port, or terminate the conflicting service.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_12

LANGUAGE: bash
CODE:
```
# Check what's using the port
lsof -i :3000

# Use different port
elizaos start --port 3001

# Or stop conflicting service
sudo kill -9 $(lsof -ti:3000)
elizaos start
```

----------------------------------------

TITLE: Solana Portfolio Tracking Test
DESCRIPTION: Example of testing the portfolio tracking feature, which should display the total USD value and a breakdown of token holdings.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/solana/testing-guide.mdx#_snippet_3

LANGUAGE: text
CODE:
```
```
User: What's my portfolio worth?
Agent: [Should show total USD value and token breakdown]
```
```

----------------------------------------

TITLE: Integration Tests for Plugin Flow
DESCRIPTION: Illustrates integration testing for a plugin's complete workflow, from setup to message processing, using a test runtime.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_66

LANGUAGE: typescript
CODE:
```
describe('Plugin Integration', () => {
  let runtime: IAgentRuntime;
  let service: MyService;

  beforeAll(async () => {
    runtime = await createTestRuntime({
      settings: {
        MY_API_KEY: process.env.TEST_API_KEY,
      },
    });

    service = await MyService.start(runtime);
  });

  it('should handle complete flow', async () => {
    const message = createTestMessage('Execute my action');
    const response = await runtime.processMessage(message);

    expect(response.success).toBe(true);
  });
});
```

----------------------------------------

TITLE: Multi-Account Twitter Setup
DESCRIPTION: Demonstrates how to set up and manage multiple Twitter accounts within the ElizaOS framework. It shows the creation of distinct Twitter clients for main, support, and news accounts, each with specific configurations for API keys, access tokens, and feature enablement.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/examples.mdx#_snippet_12

LANGUAGE: typescript
CODE:
```
const multiAccountSetup = async (runtime: IAgentRuntime) => {
  const twitterService = runtime.getService('twitter') as TwitterService;
  
  // Main account
  const mainAccount = await twitterService.createClient(
    runtime,
    'main-account',
    {
      TWITTER_API_KEY: process.env.MAIN_API_KEY,
      TWITTER_API_SECRET_KEY: process.env.MAIN_API_SECRET,
      TWITTER_ACCESS_TOKEN: process.env.MAIN_ACCESS_TOKEN,
      TWITTER_ACCESS_TOKEN_SECRET: process.env.MAIN_ACCESS_SECRET,
      TWITTER_POST_ENABLE: "true"
    }
  );
  
  // Support account
  const supportAccount = await twitterService.createClient(
    runtime,
    'support-account',
    {
      TWITTER_API_KEY: process.env.SUPPORT_API_KEY,
      TWITTER_API_SECRET_KEY: process.env.SUPPORT_API_SECRET,
      TWITTER_ACCESS_TOKEN: process.env.SUPPORT_ACCESS_TOKEN,
      TWITTER_ACCESS_TOKEN_SECRET: process.env.SUPPORT_ACCESS_SECRET,
      TWITTER_POST_ENABLE: "false",
      TWITTER_SEARCH_ENABLE: "true"
    }
  );
  
  // News account
  const newsAccount = await twitterService.createClient(
    runtime,
    'news-account',
    {
      TWITTER_API_KEY: process.env.NEWS_API_KEY,
      TWITTER_API_SECRET_KEY: process.env.NEWS_API_SECRET,
      TWITTER_ACCESS_TOKEN: process.env.NEWS_ACCESS_TOKEN,
      TWITTER_ACCESS_TOKEN_SECRET: process.env.NEWS_ACCESS_SECRET,
      TWITTER_POST_ENABLE: "true",
      TWITTER_POST_INTERVAL_MIN: "60"  // More frequent posts
    }
  );
  
  console.log('Multi-account setup complete!');
};
```

----------------------------------------

TITLE: Install EVM Plugin
DESCRIPTION: Installs the EVM plugin for the AI agent using the elizaos CLI.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/evm.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
elizaos plugins add evm
```

----------------------------------------

TITLE: Build Plugin
DESCRIPTION: Command to build the ElizaOS plugin using Bun.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_4

LANGUAGE: bash
CODE:
```
bun run build
```

----------------------------------------

TITLE: Install elizaOS CLI
DESCRIPTION: Installs the elizaOS CLI globally using Bun. This command ensures the CLI is available system-wide for managing elizaOS projects and agents.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/overview.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
bun install -g @elizaos/cli
```

----------------------------------------

TITLE: Creating a Custom Help Action
DESCRIPTION: Defines a custom 'HELP' action that provides detailed assistance on specific topics. It includes validation, message handling, and example interactions. This action can be integrated into an AgentRuntime.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_2

LANGUAGE: typescript
CODE:
```
import { Action, ActionExample } from '@elizaos/core';

const helpAction: Action = {
  name: 'HELP',
  similes: ['SUPPORT', 'ASSIST', 'GUIDE'],
  description: 'Provides detailed help on a specific topic',

  validate: async (runtime) => {
    // Always available
    return true;
  },

  handler: async (runtime, message, state, options, callback) => {
    // Extract help topic from message
    const topic = extractHelpTopic(message.content.text);

    // Get relevant documentation
    const helpContent = await getHelpContent(topic);

    // Generate response
    const response = {
      thought: `User needs help with ${topic}`,
      text: helpContent,
      actions: ['HELP'],
      attachments: topic.includes('screenshot')
        ? [{ url: '/help/screenshots/' + topic + '.png' }]
        : [],
    };

    await callback(response);
    return true;
  },

  examples: [
    [
      {
        name: '{{user}}',
        content: { text: 'How do I reset my password?' },
      },
      {
        name: '{{agent}}',
        content: {
          text: "Here's how to reset your password:\n1. Click 'Forgot Password'\n2. Enter your email\n3. Check your inbox for reset link",
          actions: ['HELP'],
        },
      },
    ],
  ],
};

// Add to agent
const agentWithHelp = new AgentRuntime({
  character: {
    /* ... */
  },
  plugins: [
    bootstrapPlugin,
    {
      name: 'custom-help',
      actions: [helpAction],
    },
  ],
});
```

----------------------------------------

TITLE: Plugin Configuration Examples
DESCRIPTION: Provides examples of how to configure elizaOS to use specific plugins, demonstrating fallback strategies for different provider combinations.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/llm.mdx#_snippet_4

LANGUAGE: json
CODE:
```
{
  "plugins": [
    "@elizaos/plugin-anthropic",  // Primary for text
    "@elizaos/plugin-openai"       // Fallback for embeddings
  ]
}
```

LANGUAGE: json
CODE:
```
{
  "plugins": [
    "@elizaos/plugin-openrouter",  // Cloud text generation
    "@elizaos/plugin-ollama"        // Local embeddings
  ]
}
```

LANGUAGE: json
CODE:
```
{
  "plugins": [
    "@elizaos/plugin-anthropic",
    "@elizaos/plugin-openai"  // For embeddings
  ]
}
```

----------------------------------------

TITLE: Project Structure for Documents
DESCRIPTION: Illustrates the recommended project structure for storing documents that the Knowledge Plugin will learn from, including a 'docs' folder at the project root.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/quick-start.mdx#_snippet_2

LANGUAGE: env
CODE:
```
your-project/
  .env
  docs/           â20ac; Create this folder
    guide.pdf
    manual.txt
    notes.md
  package.json
```

----------------------------------------

TITLE: TypeScript Custom Provider Example
DESCRIPTION: Demonstrates the implementation of a custom data provider in TypeScript for elizaOS. It defines a `Provider` object with properties like `name`, `description`, `dynamic`, `position`, and `private`, and includes an asynchronous `get` method for fetching data. The `get` method showcases best practices such as using timeouts, graceful error handling, returning empty results on failure, and managing data size, with an example of fetching data from an external API with a timeout.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/compose-state-guide.mdx#_snippet_49

LANGUAGE: typescript
CODE:
```
const customProvider: Provider = {
  name: 'CUSTOM_DATA',
  description: 'Provides custom data',
  dynamic: true, // Set to true if not always needed
  position: 150, // Higher numbers run later
  private: false, // Set to true for internal-only providers

  get: async (runtime, message, state) => {
    // Best practices:
    // 1. Return quickly - use timeouts
    // 2. Handle errors gracefully
    // 3. Return empty result on failure
    // 4. Keep data size reasonable

    try {
      // Example: Fetch data with timeout
      const fetchDataWithTimeout = async (timeout: number) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch('https://api.example.com/data', {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return await response.json();
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      };

      const data = await fetchDataWithTimeout(5000);
      return {
        values: { customValue: data.summary || 'No summary' },
        data: { fullData: data },
        text: `Custom data: ${data.summary || 'No data available'}`,
      };
    } catch (error) {
      runtime.logger.error('Error in CUSTOM_DATA provider:', error);
      // Return empty result on error
      return {
        values: {},
        data: {},
        text: '',
      };
    }
  },
};
```

----------------------------------------

TITLE: API Documentation Assistant Example
DESCRIPTION: Sets up a technical documentation assistant that helps developers by searching a knowledge base for API documentation, code examples, and best practices. It utilizes the OpenAI and Knowledge plugins.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/examples.mdx#_snippet_1

LANGUAGE: typescript
CODE:
```
export const apiAssistant: Character = {
  name: 'APIHelper',
  plugins: [
    '@elizaos/plugin-openai',
    '@elizaos/plugin-knowledge',
  ],
  system: 'You are a technical documentation assistant. Help developers by searching your knowledge base for API documentation, code examples, and best practices.',
  topics: [
    'API endpoints and methods',
    'Authentication and security',
    'Code examples and best practices',
    'Error handling and debugging',
  ],
};
```

----------------------------------------

TITLE: Test Setup File
DESCRIPTION: Sets up the testing environment by loading environment variables from `.env.test`, mocking external services like `twitter-api-v2`, configuring global test settings, and enabling fake timers for testing scheduled events. Includes cleanup logic using `afterEach`.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/testing-guide.mdx#_snippet_14

LANGUAGE: typescript
CODE:
```
// tests/setup.ts
import { config } from 'dotenv';
import { vi } from 'vitest';

// Load test environment
config({ path: '.env.test' });

// Mock external services
vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn(() => createMockTwitterApi())
}));

// Global test configuration
global.testConfig = {
  timeout: 30000,
  retries: 3
};

// Ensure dry run for all tests
process.env.TWITTER_DRY_RUN = 'true';

// Mock timers for scheduled posts
vi.useFakeTimers();

// Cleanup after tests
afterEach(() => {
  vi.clearAllTimers();
});
```

----------------------------------------

TITLE: Install Bun
DESCRIPTION: Instructions for installing the Bun runtime on Linux, macOS, and Windows, including verification steps and environment sourcing.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/dev.mdx#_snippet_15

LANGUAGE: bash
CODE:
```
# If you see "bun: command not found" errors
# Install Bun using the appropriate command for your system:

# Linux/macOS:
curl -fsSL https://bun.sh/install | bash

# macOS with Homebrew:
brew install bun

# After installation, restart your terminal or:
source ~/.bashrc  # Linux
source ~/.zshrc   # macOS with zsh

# Verify installation:
bun --version
```

LANGUAGE: powershell
CODE:
```
# Windows:
powershell -c "irm bun.sh/install.ps1 | iex"
```

----------------------------------------

TITLE: Activating Plugins in Character Configuration
DESCRIPTION: Illustrates how to activate installed plugins by listing them in the `plugins` array within character configuration files. Provides examples for both JSON and TypeScript formats, including conditional loading based on environment variables.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/plugins.mdx#_snippet_3

LANGUAGE: json
CODE:
```
{
  "name": "MyAgent",
  "plugins": [
    "@elizaos/plugin-sql",
    "@elizaos/plugin-openai",
    "@elizaos/plugin-discord"
  ],
  "bio": ["Your agent's description"],
  "style": {
    "all": ["conversational", "friendly"]
  }
}
```

LANGUAGE: typescript
CODE:
```
import { Character } from '@elizaos/core';

export const character: Character = {
  name: "MyAgent",
  plugins: [
    // Core plugins
    "@elizaos/plugin-sql",
    
    // Conditional plugins based on environment variables
    ...(process.env.OPENAI_API_KEY ? ["@elizaos/plugin-openai"] : []),
    ...(process.env.DISCORD_API_TOKEN ? ["@elizaos/plugin-discord"] : []),
    ...(process.env.ANTHROPIC_API_KEY ? ["@elizaos/plugin-anthropic"] : [])
  ],
  bio: ["Your agent's description"],
  style: {
    all: ["conversational", "friendly"]
  }
};
```

----------------------------------------

TITLE: Basic Twitter Integration Setup
DESCRIPTION: Demonstrates how to set up the ElizaOS agent with the Twitter plugin. This includes initializing the AgentRuntime with necessary plugins and configuring Twitter API credentials.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/complete-documentation.mdx#_snippet_20

LANGUAGE: typescript
CODE:
```
import { twitterPlugin } from '@elizaos/plugin-twitter';
import { AgentRuntime } from '@elizaos/core';
import { bootstrapPlugin } from '@elizaos/plugin-bootstrap';

const runtime = new AgentRuntime({
  plugins: [bootstrapPlugin, twitterPlugin],
  character: {
    name: "TwitterBot",
    clients: ["twitter"],
    postExamples: [
      "Just shipped a new feature!",
      "Thoughts on the future of AI?"
    ],
    settings: {
      TWITTER_API_KEY: process.env.TWITTER_API_KEY,
      TWITTER_API_SECRET_KEY: process.env.TWITTER_API_SECRET_KEY,
      TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
      TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      TWITTER_POST_ENABLE: "true"
    }
  }
});

await runtime.start();
```

----------------------------------------

TITLE: Troubleshooting ElizaOS Character Loading Issues
DESCRIPTION: Addresses problems related to loading character files in ElizaOS. It includes steps to verify the character file's existence and validity, test with absolute paths, and start ElizaOS without a character file.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/start.mdx#_snippet_13

LANGUAGE: bash
CODE:
```
# Verify character file exists and is valid JSON
cat ./character.json | jq .

# Test with absolute path
elizaos start --character /full/path/to/character.json

# Start without character to use default
elizaos start
```

----------------------------------------

TITLE: Simple Callback Response
DESCRIPTION: A basic example of calling the callback function to send a simple text response to the user.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/complete-documentation.mdx#_snippet_20

LANGUAGE: typescript
CODE:
```
await callback({
  text: 'Hello! How can I help?',
  actions: ['REPLY'],
});
```

----------------------------------------

TITLE: Publish ElizaOS Plugin
DESCRIPTION: Commands to publish an ElizaOS plugin. It includes options for testing the publishing process with `--test` and skipping registry updates with `--skip-registry` if needed.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-publishing-guide.mdx#_snippet_15

LANGUAGE: bash
CODE:
```
# Try step-by-step
elizaos publish --test  # Test first
elizaos publish --npm --skip-registry  # Skip registry if needed
```

----------------------------------------

TITLE: Install Knowledge Plugin
DESCRIPTION: Installs the Knowledge Plugin for elizaOS agents using the elizaos CLI or bun.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
elizaos plugins add @elizaos/plugin-knowledge
```

LANGUAGE: bash
CODE:
```
bun add @elizaos/plugin-knowledge
```

----------------------------------------

TITLE: ElizaOS Plugin Testing and Publishing Commands
DESCRIPTION: Demonstrates the command-line interface (CLI) commands used for testing, validating, and publishing ElizaOS plugins, including running tests, performing dry runs, and authenticating with npm.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-publishing-guide.mdx#_snippet_6

LANGUAGE: bash
CODE:
```
# Run unit tests
elizaos test

# Test in a real project
cd ../test-project
elizaos plugins add ../plugin-my-awesome-plugin
elizaos dev

# Dry run to see what would happen
elizaos publish --test

# Check generated registry files
elizaos publish --dry-run
ls packages/registry/

# Login to npm
bunx npm login

# Set GitHub token (or you'll be prompted)
export GITHUB_TOKEN=your_pat_here

# Publish to npm and submit to registry
elizaos publish --npm

# Update version in package.json
bun version patch  # or minor/major

# Build and test
bun run build
elizaos test

# Publish directly to npm
bun publish

# Push to GitHub
git add .
git commit -m "Update to version x.y.z"
git push
git push --tags

```

----------------------------------------

TITLE: JSON Template for Structured Responses (v0)
DESCRIPTION: Example of a v0 template using JSON format for structured data extraction, specifically for an Ethereum address.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/prompt-and-generation-guide.mdx#_snippet_7

LANGUAGE: typescript
CODE:
```
const addressTemplate = `From previous sentence extract only the Ethereum address being asked about.
Respond with a JSON markdown block containing only the extracted value:

```json
{
"address": string | null
}
```
`;
```

----------------------------------------

TITLE: Custom Character Agent Setup
DESCRIPTION: Configures a specialized 'TechBot' agent for technical support. It includes platform-specific plugins (like Discord if a token is present), custom avatar, detailed system prompt, bio, topics, and advanced style and template configurations for message handling and response decisions.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_1

LANGUAGE: typescript
CODE:
```
import { type Character } from '@elizaos/core';

export const techBotCharacter: Character = {
  name: 'TechBot',
  description: 'A technical support specialist',
  plugins: [
    '@elizaos/plugin-bootstrap',
    '@elizaos/plugin-sql',
    // Add platform plugins as needed
    ...(process.env.DISCORD_API_TOKEN ? ['@elizaos/plugin-discord'] : []),
  ],
  settings: {
    secrets: {},
    avatar: 'https://example.com/techbot-avatar.png',
  },
  system: 'You are a technical support specialist. Provide clear, patient, and detailed assistance with technical issues. Break down complex problems into simple steps.',
  bio: [
    'Expert in software development and troubleshooting',
    'Patient and detail-oriented problem solver',
    'Specializes in clear technical communication',
    'Helps users at all skill levels',
  ],
  topics: [
    'software development',
    'debugging',
    'technical support',
    'programming languages',
    'system troubleshooting',
  ],
  style: {
    all: [
      'Be professional yet friendly',
      'Use technical vocabulary but keep it accessible',
      'Provide step-by-step guidance',
      'Ask clarifying questions when needed',
    ],
    chat: [
      'Be patient and understanding',
      'Break down complex topics',
      'Offer examples when helpful',
    ],
  },
  // Custom templates
  templates: {
    messageHandlerTemplate: `<task>Generate a technical support response as {{agentName}}</task>

{{providers}}

<guidelines>
- Assess the user's technical level from their message
- Consider the complexity of their problem
- Provide appropriate solutions
- Use clear, step-by-step guidance
- Include code examples when relevant
</guidelines>

<output>
<response>
  <thought>Analysis of the technical issue</thought>
  <text>Your helpful technical response</text>
</response>
</output>`,

    shouldRespondTemplate: `<task>Decide if {{agentName}} should respond</task>

{{recentMessages}}

<respond-if>
- User asks a technical question
- User reports an issue or bug
- User needs clarification on technical topics
- Direct mention of {{agentName}}
- Discussion about programming or software
</respond-if>

<ignore-if>
- Casual conversation between others
- Non-technical discussions
- Already resolved issues
</ignore-if>

<output>
<response>
  <reasoning>Brief explanation</reasoning>
  <action>RESPOND | IGNORE | STOP</action>
</response>
</output>`,
  },
};
```

----------------------------------------

TITLE: Install elizaOS CLI
DESCRIPTION: Installs the elizaOS command-line interface globally using Bun. This is a prerequisite for using the `tee` command and other elizaOS functionalities.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/tee.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
bun install -g @elizaos/cli
```

----------------------------------------

TITLE: Environment Setup for EVM Plugin Testing
DESCRIPTION: Configuration settings for testing the EVM plugin, including specifying a dedicated test wallet private key and the base Ethereum provider URL for a specific chain.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/evm/testing-guide.mdx#_snippet_0

LANGUAGE: env
CODE:
```
# Use a dedicated test wallet
EVM_PRIVATE_KEY=test_wallet_private_key

# Start with one chain
ETHEREUM_PROVIDER_BASE=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
```

----------------------------------------

TITLE: Bun Installation and Verification
DESCRIPTION: Instructions for installing Bun on Linux, macOS, and Windows, including restarting the terminal and verifying the installation.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/dev.mdx#_snippet_11

LANGUAGE: shell
CODE:
```
# If you see "bun: command not found" errors
# Install Bun using the appropriate command for your system:

# Linux/macOS:
curl -fsSL https://bun.sh/install | bash

# Windows:
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS with Homebrew:
brew install bun

# After installation, restart your terminal or:
source ~/.bashrc  # Linux
source ~/.zshrc   # macOS with zsh

# Verify installation:
bun --version
```

----------------------------------------

TITLE: Knowledge Plugin Agent Actions
DESCRIPTION: Defines the core actions provided by the Knowledge Plugin for an AI agent. These actions allow the agent to ingest new documents and query its existing knowledge base, facilitating question-answering capabilities based on provided content.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/quick-start.mdx#_snippet_7

LANGUAGE: APIDOC
CODE:
```
PROCESS_KNOWLEDGE
  - Description: Instructs the agent to remember a specific document, either by providing a file path or raw text content.
  - Usage: "Remember this document: [file path or text]"

SEARCH_KNOWLEDGE
  - Description: Queries the agent's knowledge base for information related to a given topic.
  - Usage: "Search your knowledge for [topic]"

Related Actions:
  - The agent automatically processes documents in the configured `docs` folder on startup if `LOAD_DOCS_ON_STARTUP` is true.
  - The web interface provides a GUI for uploading, searching, and managing documents.
```

----------------------------------------

TITLE: Simple Info Bot Example (Hello World)
DESCRIPTION: A basic information bot for very simple, hardcoded information. It uses the OpenAI and Knowledge plugins and stores minimal data directly in the 'knowledge' array.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/examples.mdx#_snippet_2

LANGUAGE: json
CODE:
```
{
  "name": "InfoBot",
  "plugins": [
    "@elizaos/plugin-openai",
    "@elizaos/plugin-knowledge"
  ],
  "knowledge": [
    "Our office is located at 123 Main St",
    "Business hours: 9 AM to 5 PM EST",
    "Contact: support@example.com"
  ],
  "system": "You are a simple information bot. Answer questions using your basic knowledge."
}
```

----------------------------------------

TITLE: ElizaOS Test Command Examples
DESCRIPTION: Demonstrates various ways to execute tests, including running all tests, specific types, filtering by name, and using advanced options like custom ports and skipping builds.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/test.mdx#_snippet_1

LANGUAGE: bash
CODE:
```
# Run all tests (component and e2e) - default behavior
elizaos test

# Explicitly run all tests
elizaos test --type all

# Run only component tests
elizaos test --type component

# Run only end-to-end tests
elizaos test --type e2e

# Test a specific project or plugin path
elizaos test ./plugins/my-plugin

# Filter component tests by name
elizaos test --type component --name auth

# Filter e2e tests by name
elizaos test --type e2e --name database

# Filter all tests by name
elizaos test --name plugin

# Run tests on custom port for e2e
elizaos test --type e2e --port 4000

# Skip building before running tests
elizaos test --skip-build

# Skip type checking for faster test runs
elizaos test --skip-type-check

# Combine options
elizaos test --type e2e --port 3001 --name integration --skip-build
```

----------------------------------------

TITLE: Navigate to Agent Directory
DESCRIPTION: Changes the current directory to the newly created elizaOS agent's directory.

SOURCE: https://github.com/elizaos/docs/blob/main/quickstart.mdx#_snippet_2

LANGUAGE: bash
CODE:
```
cd <agent-name>
```

----------------------------------------

TITLE: ElizaOS Create Advanced Options
DESCRIPTION: Demonstrates advanced usage of the `elizaos create` command, including specifying templates, disabling automatic dependency installation, and skipping Git repository initialization.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/create.mdx#_snippet_3

LANGUAGE: bash
CODE:
```
# Create from a specific template
elizaos create my-project --template minimal

# Create without installing dependencies
elizaos create my-project --no-install

# Create without initializing git
elizaos create my-project --no-git
```

----------------------------------------

TITLE: Actions Provider Example
DESCRIPTION: This provider identifies and lists possible response actions for the agent. It iterates through available actions, validates them against the current context, and formats their names for the LLM.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_36

LANGUAGE: typescript
CODE:
```
export const actionsProvider: Provider = {
  name: 'ACTIONS',
  description: 'Possible response actions',
  position: -1, // Runs early to inform other providers

  get: async (runtime, message, state) => {
    // Get all valid actions for this context
    const validActions = await Promise.all(
      runtime.actions.map(async (action) => {
        const isValid = await action.validate(runtime, message, state);
        return isValid ? action : null;
      })
    );

    const actions = validActions.filter(Boolean);
    const actionNames = formatActionNames(actions);

    return {
      text: `Possible response actions: ${actionNames}`,
      values: { actionNames },
      data: { actionsData: actions },
    };
  },
};

```

----------------------------------------

TITLE: Test Environment Setup (.env.test)
DESCRIPTION: Configuration for the test environment, including Twitter API credentials and test-specific settings. It emphasizes using a dry run mode and safe values for rate limiting.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/testing-guide.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
# .env.test
TWITTER_API_KEY=test_api_key
TWITTER_API_SECRET_KEY=test_api_secret
TWITTER_ACCESS_TOKEN=test_access_token
TWITTER_ACCESS_TOKEN_SECRET=test_token_secret

# Test configuration
TWITTER_DRY_RUN=true  # Always use dry run for tests
TWITTER_TEST_USER_ID=1234567890
TWITTER_TEST_USERNAME=testbot
TWITTER_TEST_TARGET_USER=testuser

# Rate limit safe values
TWITTER_POLL_INTERVAL=300  # 5 minutes
TWITTER_POST_INTERVAL_MIN=60
```

----------------------------------------

TITLE: Action Examples Structure
DESCRIPTION: Illustrates the expected structure for action examples in ElizaOS, emphasizing the use of 'user' for user messages and 'name' for agent responses, along with the expected content format.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/migration-guide.mdx#_snippet_19

LANGUAGE: typescript
CODE:
```
examples: [
    [
        {
            user: "{{name1}}", // Note: "user" instead of "name" for user messages
            content: {
                text: "User input text here",
            },
        },
        {
            name: "{{name2}}", // Agent response uses "name"
            content: {
                action: "YOUR_ACTION_NAME",
                // Include the expected parsed fields
                name: "Expected Name",
                symbol: "Expected Symbol",
            },
        },
    ],
] as ActionExample[][]
```

----------------------------------------

TITLE: Agent Lifecycle Workflow
DESCRIPTION: Outlines the typical workflow for managing agents, from creation and starting the runtime to listing, getting status, updating, stopping, and removing agents.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/agent.mdx#_snippet_13

LANGUAGE: bash
CODE:
```
# 1. Create Agent Character
elizaos create -type agent eliza
```

LANGUAGE: bash
CODE:
```
# Or create project with character
elizaos create -type project my-project
```

LANGUAGE: bash
CODE:
```
# 2. Start Agent Runtime
elizaos start
```

LANGUAGE: bash
CODE:
```
# 3. Manage Agents
# List available agents
elizaos agent list

# Start an agent
elizaos agent start --path ./eliza.json

# Check agent status
elizaos agent get --name eliza

# Update configuration
elizaos agent set --name eliza --config '{"system":"Updated prompt"}'

# Stop agent
elizaos agent stop --name eliza

# Clear agent memories if needed
elizaos agent clear-memories --name eliza

# Remove when no longer needed
elizaos agent remove --name eliza
```

----------------------------------------

TITLE: ElizaOS Create Command Usage
DESCRIPTION: Provides instructions on how to use the `elizaos create` command for initializing new projects, plugins, or agents. It covers interactive mode, using options, and accessing help.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/create.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
# Interactive mode (recommended)
elizaos create

# With specific options
elizaos create [options] [name]

# View detailed help
elizaos create --help
```

----------------------------------------

TITLE: Customizing shouldRespondTemplate
DESCRIPTION: Example of customizing the `shouldRespondTemplate` to control when the agent responds, focusing on technical questions and direct mentions.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/complete-documentation.mdx#_snippet_16

LANGUAGE: typescript
CODE:
```
import { Character } from '@elizaos/core';

export const myCharacter: Character = {
  name: 'TechBot',
  // ... other config ...

  templates: {
    // Custom shouldRespond logic
    shouldRespondTemplate: `<task>Decide if {{agentName}} should help with technical questions.</task>

{{providers}}

<rules>
- Always respond to technical questions
- Always respond to direct mentions
- Ignore casual chat unless it's tech-related
- If someone asks for help, ALWAYS respond
</rules>

<output>
<response>
  <reasoning>Your technical assessment</reasoning>
  <action>RESPOND | IGNORE | STOP</action>
</response>
</output>`,

    // Custom message handler with specific behavior
    messageHandlerTemplate: `<task>Generate a helpful technical response as {{agentName}}.</task>

{{providers}}

Available actions: {{actionNames}}

<personality>
- Be precise and technical but friendly
- Provide code examples when relevant
- Ask clarifying questions for vague requests
- Suggest best practices
</personality>

<output>
<response>
  <thought>Technical analysis of the request</thought>
  <actions>ACTION1,ACTION2</actions>
  <providers>PROVIDER1,PROVIDER2</providers>
  <text>Your helpful technical response</text>
</response>
</output>`,

    // Custom reflection template
    reflectionTemplate: `<task>Analyze the technical conversation for learning opportunities.</task>

{{recentMessages}}

<focus>
- Extract technical facts and solutions
- Note programming patterns discussed
- Track user expertise levels
- Identify knowledge gaps
</focus>

<output>
{
  "thought": "Technical insight gained",
  "facts": [
    {
      "claim": "Technical fact learned",
      "type": "technical|solution|pattern",
      "topic": "programming|devops|architecture"
    }
  ],
  "userExpertise": {
    "level": "beginner|intermediate|expert",
    "topics": ["topic1", "topic2"]
  }
}
</output>`,
  },
};
```

----------------------------------------

TITLE: SQL Plugin Database Adapter Example
DESCRIPTION: Illustrates the structure of a plugin that registers a database adapter. The example shows a SQL plugin that creates and registers a database adapter with dynamic schema migrations.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/overview.mdx#_snippet_12

LANGUAGE: typescript
CODE:
```
export const plugin: Plugin = {
  name: '@elizaos/plugin-sql',
  description: 'A plugin for SQL database access with dynamic schema migrations',
  priority: 0,
  schema,
  init: async (_, runtime: IAgentRuntime) => {
    const dbAdapter = createDatabaseAdapter(config, runtime.agentId);
    runtime.registerDatabaseAdapter(dbAdapter);
  }
};
```

----------------------------------------

TITLE: Monitoring Metrics Example
DESCRIPTION: Outlines key metrics to track for monitoring the performance and health of the Discord integration, such as messages processed and response times.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/discord/complete-documentation.mdx#_snippet_35

LANGUAGE: typescript
CODE:
```
// Track performance metrics
const metrics = {
  messagesProcessed: 0,
  averageResponseTime: 0,
  activeVoiceConnections: 0
};
```

----------------------------------------

TITLE: Indexing Foreign Keys
DESCRIPTION: Provides an example of creating indexes on columns frequently used in joins, specifically `userId` and `createdAt`, to improve query performance.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/sql/plugin-tables.mdx#_snippet_16

LANGUAGE: typescript
CODE:
```
(table) => ({
  userIdIdx: index('plugin_posts_user_id_idx').on(table.userId),
  createdAtIdx: index('plugin_posts_created_at_idx').on(table.createdAt),
})
```

----------------------------------------

TITLE: ElizaOS Related Commands
DESCRIPTION: Lists essential ElizaOS CLI commands for project management, including starting, testing, environment configuration, and project creation.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/dev.mdx#_snippet_14

LANGUAGE: APIDOC
CODE:
```
Related Commands:

- `start`: Start your project in production mode
- `test`: Run tests for your project
- `env`: Configure environment variables for development
- `create`: Create new projects with development structure
```

----------------------------------------

TITLE: Install Solana Plugin
DESCRIPTION: Installs the Solana plugin for ElizaOS using the elizaos CLI.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/solana.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
elizaos plugins add solana
```

----------------------------------------

TITLE: Useful Bun Commands for Plugin Development
DESCRIPTION: A collection of essential Bun commands for managing dependencies, running scripts, executing tests, and updating packages within an ElizaOS plugin development environment.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_76

LANGUAGE: bash
CODE:
```
# Install all dependencies
bun install

# Add a new dependency
bun add <package-name>

# Add a dev dependency
bun add -d <package-name>

# Run scripts
bun run <script-name>

# Run tests
bun test

# Update dependencies
bun update

# Clean install (remove node_modules and reinstall)
bun install --force
```

----------------------------------------

TITLE: Example: Basic Message Flow
DESCRIPTION: Illustrates a typical message flow in ElizaOS, from message reception to response generation and sending via callback. It includes sample message content and the expected callback response.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/complete-documentation.mdx#_snippet_27

LANGUAGE: typescript
CODE:
```
// 1. Message arrives
const message = {
  id: 'msg-123',
  entityId: 'user-456',
  roomId: 'room-789',
  content: {
    text: 'Hello, how are you?',
  },
};

// 2. Bootstrap processes it
// - Saves to memory
// - Checks shouldRespond
// - Generates response
// - Executes REPLY action
// - Runs reflection evaluator

// 3. Response sent via callback
callback({
  text: "I'm doing well, thank you! How can I help you today?",
  actions: ['REPLY'],
  thought: 'User greeted me politely, responding in kind',
});
```

----------------------------------------

TITLE: DeFi Plugin Transaction Execution
DESCRIPTION: Provides an example of a DeFi plugin's service class, demonstrating how to execute blockchain transactions. It covers input validation, gas estimation, and transaction execution with retry logic.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_60

LANGUAGE: typescript
CODE:
```
export class DeFiService extends Service {
  private walletClient: WalletClient;
  private publicClient: PublicClient;

  async executeTransaction(params: TransactionParams) {
    // 1. Validate inputs
    validateAddress(params.to);
    validateAmount(params.amount);

    // 2. Estimate gas
    const gasLimit = await this.estimateGas(params);

    // 3. Execute with retry
    return await withRetry(() =>
      this.walletClient.sendTransaction({
        ...params,
        gasLimit,
      })
    );
  }
}
```

----------------------------------------

TITLE: Test Setup and Mocking
DESCRIPTION: Sets up the test environment by loading environment variables from `.env.test`, validating the Telegram token, and providing global mock utilities for runtime functions and services.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/telegram/testing-guide.mdx#_snippet_24

LANGUAGE: typescript
CODE:
```
// tests/setup.ts
import { config } from 'dotenv';
import { vi } from 'vitest';

// Load test environment
config({ path: '.env.test' });

// Validate test environment
if (!process.env.TELEGRAM_TEST_TOKEN) {
  throw new Error('TELEGRAM_TEST_TOKEN not set in .env.test');
}

// Global test utilities
global.createMockRuntime = () => ({
  processMessage: vi.fn(),
  character: { 
    name: 'TestBot',
    allowDirectMessages: true
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  },
  getSetting: vi.fn((key) => process.env[key]),
  getService: vi.fn(),
  emitEvent: vi.fn()
});

// Cleanup after all tests
afterAll(async () => {
  // Clean up test messages
  await cleanupTestChat();
});
```

----------------------------------------

TITLE: Testing Async Operations (Concurrent Messages)
DESCRIPTION: Provides an example of testing asynchronous operations, specifically handling concurrent messages and verifying their processing.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/testing-guide.mdx#_snippet_11

LANGUAGE: typescript
CODE:
```
it('should handle concurrent messages', async () => {
  const messages = [
    createMockMemory({ content: { text: 'Message 1' } }),
    createMockMemory({ content: { text: 'Message 2' } }),
  ];

  // Process messages concurrently
  await Promise.all(
    messages.map((msg) =>
      messageReceivedHandler({
        runtime: setup.mockRuntime,
        message: msg,
        callback: setup.callbackFn,
      })
    )
  );

  // Verify both processed correctly
  expect(setup.callbackFn).toHaveBeenCalledTimes(2);
});
```

----------------------------------------

TITLE: Troubleshooting Plugin Installation
DESCRIPTION: Provides a solution for plugin installation failures by suggesting to clear the ElizaOS cache and retry the installation.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/plugins.mdx#_snippet_11

LANGUAGE: bash
CODE:
```
rm -rf ~/.eliza/cache
elizaos plugins add plugin-name
```

----------------------------------------

TITLE: elizaOS CLI Installation
DESCRIPTION: Installs the SQL plugin for elizaOS using the elizaOS CLI.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/sql.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
elizaos plugins add @elizaos/plugin-sql
```

----------------------------------------

TITLE: Socket.IO Event Debugging
DESCRIPTION: Provides methods for logging all Socket.IO events, useful for debugging communication issues. Includes examples for both newer and older Socket.IO versions.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/socket-io-integration-guide.mdx#_snippet_7

LANGUAGE: javascript
CODE:
```
// For newer Socket.IO versions
socket.onAny((eventName, ...args) => {
  console.log('Event received:', eventName, args);
});

// For older versions
const onevent = socket.onevent;
socket.onevent = function(packet) {
  console.log('Event:', packet.data);
  onevent.call(socket, packet);
};

```

----------------------------------------

TITLE: Install OpenAI Plugin
DESCRIPTION: Command to install the OpenAI plugin for elizaOS using the elizaos CLI.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/llm/openai.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
elizaos plugins add @elizaos/plugin-openai
```

----------------------------------------

TITLE: Build and Link Plugin (External)
DESCRIPTION: Steps to build and link a plugin from its directory for external use.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_7

LANGUAGE: bash
CODE:
```
# In your plugin directory (e.g., plugin-myplugin/)
bun install
bun run build
bun link
```

----------------------------------------

TITLE: Customer Support Bot Templates
DESCRIPTION: Defines templates for a customer support bot, including response prioritization, message handling, and interaction reflection. These templates guide the bot's behavior in customer-facing scenarios.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_15

LANGUAGE: typescript
CODE:
```
const supportBotCharacter: Character = {
  name: 'SupportAgent',
  description: '24/7 customer support specialist',

  templates: {
    // Support-focused shouldRespond
    shouldRespondTemplate: `<task>Determine if {{agentName}} should handle this support request.</task>\n\n{{providers}}\n\n<support-priorities>\nPRIORITY 1 (Always respond):\n- Error messages or bug reports\n- Account issues or login problems\n- Payment or billing questions\n- Direct help requests\n\nPRIORITY 2 (Respond):\n- Feature questions\n- How-to requests\n- General feedback\n\nPRIORITY 3 (Conditionally respond):\n- Complaints (respond with empathy)\n- Feature requests (acknowledge and log)\n\nNEVER IGNORE:\n- Frustrated customers\n- Urgent issues\n- Security concerns\n</support-priorities>\n\n<output>\n<response>\n  <reasoning>Support priority assessment</reasoning>\n  <action>RESPOND | ESCALATE | ACKNOWLEDGE</action>\n</response>\n</output>`,

    // Professional support message handler
    messageHandlerTemplate: `<task>Provide professional support as {{agentName}}.</task>\n\n{{providers}}\nAvailable actions: {{actionNames}}\n\n<support-guidelines>\n- Acknowledge the issue immediately\n- Express empathy for any inconvenience\n- Provide clear, step-by-step solutions\n- Offer alternatives if primary solution unavailable\n- Always follow up on open issues\n</support-guidelines>\n\n<tone>\n- Professional yet friendly\n- Patient and understanding\n- Solution-oriented\n- Proactive in preventing future issues\n</tone>\n\n<output>\n<response>\n  <thought>Issue analysis and solution approach</thought>\n  <actions>REPLY,CREATE_TICKET</actions>\n  <providers>USER_HISTORY,KNOWLEDGE_BASE,OPEN_TICKETS</providers>\n  <text>Your support response</text>\n</response>\n</output>`,

    // Support interaction reflection
    reflectionTemplate: `<task>Analyze support interaction for quality and improvement.</task>\n\n{{recentMessages}}\n\n<support-metrics>\n- Issue resolved: yes/no/escalated\n- Customer satisfaction indicators\n- Response time and efficiency\n- Knowledge gaps identified\n- Common issues pattern\n</support-metrics>\n\n<output>\n{\n  "thought": "Support interaction analysis",\n  "resolution": {\n    "status": "resolved|unresolved|escalated",\n    "issueType": "technical|billing|account|other",\n    "satisfactionIndicators": ["positive", "negative", "neutral"]\n  },\n  "facts": [{\n    "claim": "Issue or solution discovered",\n    "type": "bug|workaround|feature_request",\n    "frequency": "first_time|recurring|common"\n  }],\n  "improvements": ["suggested FAQ entries", "documentation needs"]\n}\n</output>`,
  },
};
```

----------------------------------------

TITLE: EVM Plugin Progressive Testing Steps
DESCRIPTION: A sequence of steps for progressively testing the EVM plugin's capabilities, starting from basic transfers and moving towards more complex operations like bridges.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/evm/testing-guide.mdx#_snippet_3

LANGUAGE: shell
CODE:
```
1. Test basic transfers first
2. Test token transfers
3. Test swaps with small amounts
4. Test bridges last (they're most complex)
```

----------------------------------------

TITLE: Document-Based Support Bot Example
DESCRIPTION: Creates a support bot that learns from documentation. It requires the OpenAI and Knowledge plugins. The bot is configured to answer questions using its learned knowledge base.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/examples.mdx#_snippet_0

LANGUAGE: typescript
CODE:
```
import { type Character } from '@elizaos/core';

export const supportBot: Character = {
  name: 'SupportBot',
  plugins: [
    '@elizaos/plugin-openai', // Required for embeddings
    '@elizaos/plugin-knowledge', // Add knowledge capabilities
  ],
  system: 'You are a friendly customer support agent. Answer questions using the support documentation you have learned. Always search your knowledge base before responding.',
  bio: [
    'Expert in product features and troubleshooting',
    'Answers based on official documentation',
    'Always polite and helpful',
  ],
};
```

----------------------------------------

TITLE: Install Monorepo Dependencies
DESCRIPTION: Command to install all project dependencies for the elizaOS monorepo using Bun, the JavaScript runtime.

SOURCE: https://github.com/elizaos/docs/blob/main/development.mdx#_snippet_9

LANGUAGE: bash
CODE:
```
bun install
```

----------------------------------------

TITLE: Example: Multi-Action Response
DESCRIPTION: Demonstrates constructing a complex response object that includes multiple actions, text, and associated provider information, intended for a sophisticated interaction.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/complete-documentation.mdx#_snippet_28

LANGUAGE: typescript
CODE:
```
// Complex response with multiple actions
const response = {
  thought: 'User needs help with a technical issue in a specific room',
  text: "I'll help you with that issue.",
  actions: ['REPLY', 'FOLLOW_ROOM', 'UPDATE_SETTINGS'],
  providers: ['TECHNICAL_DOCS', 'ROOM_INFO'],
};
```

----------------------------------------

TITLE: Troubleshooting: Install Bun
DESCRIPTION: Provides instructions to install Bun if the `bunx` command is not found, which is necessary for managing the Phala CLI.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/tee.mdx#_snippet_11

LANGUAGE: bash
CODE:
```
curl -fsSL https://bun.sh/install | bash
```

----------------------------------------

TITLE: XML Template for Structured Responses (v1)
DESCRIPTION: Example of a v1 template using XML format for structured data extraction, replacing the JSON format used in v0.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/prompt-and-generation-guide.mdx#_snippet_8

LANGUAGE: typescript
CODE:
```
const addressTemplate = `From previous sentence extract only the Ethereum address being asked about.
Respond with an XML block containing only the extracted value:

<response>
<address>extracted_address_here_or_null</address>
</response>
`;
```

----------------------------------------

TITLE: Custom Document Processor Implementation
DESCRIPTION: Example of extending the `DocumentProcessor` class to implement custom logic for extracting text from specific file formats.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/complete-documentation.mdx#_snippet_22

LANGUAGE: typescript
CODE:
```
class CustomProcessor extends DocumentProcessor {
  async extractCustomFormat(buffer: Buffer): Promise<string> {
    // Custom extraction logic
    return extractedText;
  }
  
  registerProcessor() {
    this.processors.set('application/custom', this.extractCustomFormat);
  }
}
```

----------------------------------------

TITLE: Add Plugins
DESCRIPTION: Demonstrates various methods for adding plugins to the project, including installation by package name, GitHub URLs (HTTPS, shorthand), and version control specifics like npm tags or development branches.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/plugins.mdx#_snippet_8

LANGUAGE: bash
CODE:
```
elizaos plugins add openai
elizaos plugins add @elizaos/plugin-openai
elizaos plugins add @company/plugin-custom
elizaos plugins add https://github.com/user/my-plugin
elizaos plugins add github:user/my-plugin
elizaos plugins add github:user/my-plugin#feature-branch
elizaos plugins add plugin-name --tag beta
elizaos plugins add plugin-name --branch main
```

----------------------------------------

TITLE: EVM Plugin Usage: Swap Operations
DESCRIPTION: Examples of natural language commands for executing cryptocurrency swaps, including specifying the amount, tokens, and optional slippage tolerance.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/evm/examples.mdx#_snippet_3

LANGUAGE: text
CODE:
```
User: Swap 1 ETH for USDC
Agent: I'll swap 1 ETH for USDC using the best available route.

User: Exchange 100 USDC for DAI with 0.5% slippage
Agent: Swapping 100 USDC for DAI with 0.5% slippage tolerance.
```

----------------------------------------

TITLE: Task Service Implementation
DESCRIPTION: An example of a background service that handles scheduling and executing tasks. It includes methods for starting and stopping the service, and managing an internal timer for task checks.

SOURCE: https://github.com/elizaos/docs/blob/main/deep-dive/real-world-patterns.mdx#_snippet_6

LANGUAGE: typescript
CODE:
```
export class TaskService extends Service {
  static serviceType = ServiceType.TASK;
  capabilityDescription = 'The agent is able to schedule and execute tasks';
  
  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new TaskService(runtime);
    await service.startTimer();
    return service;
  }
  
  static async stop(runtime: IAgentRuntime) {
    const service = runtime.getService(ServiceType.TASK);
    if (service) {
      await service.stop();
    }
  }
  
  private async startTimer() {
    this.timer = setInterval(async () => {
      await this.checkTasks();
    }, this.TICK_INTERVAL);
  }
}
```

----------------------------------------

TITLE: Defining and Exporting Plugin Routes
DESCRIPTION: Demonstrates how to define HTTP routes (GET, POST) with their respective handlers and export them as part of a plugin. Includes setting route properties like `public` and `name` for UI discoverability.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_45

LANGUAGE: typescript
CODE:
```
import { Plugin, Route, IAgentRuntime } from '@elizaos/core';

// Define route handlers
async function statusHandler(req: any, res: any, runtime: IAgentRuntime) {
  try {
    const service = runtime.getService('my-service') as MyService;
    const status = await service.getStatus();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: error.message,
      })
    );
  }
}

// Export routes array
export const myPluginRoutes: Route[] = [
  {
    type: 'GET',
    path: '/api/status',
    handler: statusHandler,
    public: true, // Makes this route discoverable in UI
    name: 'API Status', // Display name for UI tab
  },
  {
    type: 'POST',
    path: '/api/webhook',
    handler: webhookHandler,
  },
];

// Include routes in plugin definition
export const myPlugin: Plugin = {
  name: 'my-plugin',
  description: 'My plugin with HTTP routes',
  services: [MyService],
  routes: myPluginRoutes, // Add routes here
};
```

----------------------------------------

TITLE: Route Definition Interface and Example
DESCRIPTION: Defines the structure for defining HTTP routes within ElizaOS plugins, including HTTP method type, path, optional file path for static routes, public access flag, name, handler function, and support for multipart data. An example demonstrates a simple GET route.

SOURCE: https://github.com/elizaos/docs/blob/main/deep-dive/plugin-internals.mdx#_snippet_6

LANGUAGE: typescript
CODE:
```
export type Route = {
  type: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'STATIC';
  path: string;
  filePath?: string;                    // For static files
  public?: boolean;                     // Public access
  name?: string;                        // Route name
  handler?: (req: any, res: any, runtime: IAgentRuntime) => Promise<void>;
  isMultipart?: boolean;                // File uploads
};

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
```

----------------------------------------

TITLE: Validating Conditions for Actions
DESCRIPTION: Provides an example of a validation function that checks multiple conditions, such as user permissions, service availability, and message context, before an action can proceed.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_24

LANGUAGE: typescript
CODE:
```
validate: async (runtime, message, state) => {
  // Check multiple conditions
  const hasPermission = await checkPermissions(runtime, message);
  const hasRequiredService = !!runtime.getService('required-service');
  const isRightContext = message.content.channelType === ChannelType.GROUP;

  return hasPermission && hasRequiredService && isRightContext;
};

```

----------------------------------------

TITLE: ElizaOS Plugin CLI Commands
DESCRIPTION: Provides essential command-line interface commands for testing and publishing ElizaOS plugins, including options for dry runs and simultaneous publishing to npm and the ElizaOS registry.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_72

LANGUAGE: bash
CODE:
```
# Test your plugin
elizaos test

# Dry run to verify everything
elizaos publish --test

# Publish to npm and registry
elizaos publish --npm
```

----------------------------------------

TITLE: Action Handler Pattern
DESCRIPTION: Defines the standard structure for action handlers, including name, similes, description, validation, the handler function itself, and examples.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/complete-documentation.mdx#_snippet_12

LANGUAGE: typescript
CODE:
```
export const actionName = {
  name: 'ACTION_NAME',
  similes: ['ALTERNATIVE_NAME', 'SYNONYM'],
  description: 'What this action does',
  validate: async (runtime: IAgentRuntime) => boolean,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback,
    responses?: Memory[]
  ) => boolean,
  examples: ActionExample[][]
}
```

----------------------------------------

TITLE: Starting Interactive Environment Management with elizaos env interactive
DESCRIPTION: Shows how to launch the interactive environment management tool using the `elizaos env interactive` command.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/env.mdx#_snippet_3

LANGUAGE: bash
CODE:
```
# Start interactive environment manager
elizaos env interactive
```

----------------------------------------

TITLE: Install Google GenAI Plugin
DESCRIPTION: Command to install the Google GenAI plugin for elizaOS.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/llm/google-genai.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
elizaos plugins add @elizaos/plugin-google-genai
```

----------------------------------------

TITLE: TypeScript Logging with elizaLogger
DESCRIPTION: Demonstrates how to use the elizaLogger for various logging levels including transaction lifecycle events, performance metrics, and error tracking. Provides examples for info, debug, error, and warn messages.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/solana/complete-documentation.mdx#_snippet_16

LANGUAGE: typescript
CODE:
```
// Transaction lifecycle
elizaLogger.info('Transfer initiated', { amount, token, recipient });
elizaLogger.debug('Transaction built', { instructions: tx.instructions.length });
elizaLogger.info('Transaction sent', { signature });
elizaLogger.info('Transaction confirmed', { signature, slot });

// Performance metrics
elizaLogger.debug('RPC latency', { method, duration });
elizaLogger.debug('Cache hit rate', { hits, misses, ratio });

// Error tracking
elizaLogger.error('Transaction failed', { error, context });
elizaLogger.warn('Retry attempt', { attempt, maxAttempts });
```

----------------------------------------

TITLE: Complex Provider with All Options
DESCRIPTION: An example of a complex provider demonstrating the use of all available options: 'name', 'description', 'dynamic', and 'position'. The 'get' method returns a 'ProviderResult' object with 'text', 'values', and 'data'.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/migration-guide.mdx#_snippet_27

LANGUAGE: typescript
CODE:
```
// NEW Implementation with all options:
const complexProvider: Provider = {
  name: 'complexProvider',
  description: 'A complex provider with all options',
  dynamic: true,
  position: 10, // Higher priority in provider list
  private: false, // Shown in provider list
  get: async (runtime, message, state) => {
    elizaLogger.debug('complexProvider::get');

    const values = {
      timestamp: Date.now(),
      userId: message.userId,
    };

    const data = await fetchComplexData();

    const text = formatDataAsText(data);

    return {
      text,
      values,
      data,
    };
  },
};
```

----------------------------------------

TITLE: Vitest Configuration Example
DESCRIPTION: Shows a typical Vitest configuration file (`vitest.config.ts`) for setting up component tests, including globals, environment, and include paths.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/test.mdx#_snippet_4

LANGUAGE: typescript
CODE:
```
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
```

----------------------------------------

TITLE: Quick Plugin Project Structure
DESCRIPTION: Illustrates the directory structure for a 'Quick Plugin' (backend-only) created with the elizaOS CLI. This structure includes essential directories for source code, actions, providers, and types, along with configuration files.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_1

LANGUAGE: bash
CODE:
```
plugin-my-plugin/
├── src/
│   ├── index.ts           # Plugin manifest
│   ├── actions/
│   │   └── example.ts
│   ├── providers/
│   │   └── example.ts
│   └── types/
│       └── index.ts
├── package.json           # Pre-configured with elizaos deps
├── tsconfig.json          # TypeScript config
├── tsup.config.ts         # Build configuration
└── README.md              # Plugin documentation
```

----------------------------------------

TITLE: Custom Evaluator Example
DESCRIPTION: Demonstrates the creation of a custom evaluator that analyzes agent responses, extracts transaction data, and stores it as memory. It includes validation logic and logging.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_38

LANGUAGE: typescript
CODE:
```
import { Evaluator, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';

export const myEvaluator: Evaluator = {
  name: 'myEvaluator',
  description: 'Analyzes responses for quality and extracts insights',

  // Examples help the LLM understand when to use this evaluator
  examples: [
    {
      prompt: 'User asks about product pricing',
      messages: [
        { name: 'user', content: { text: 'How much does it cost?' } },
        { name: 'assistant', content: { text: 'The price is $99' } },
      ],
      outcome: 'Extract pricing information for future reference',
    },
  ],

  // Similar descriptions for fuzzy matching
  similes: ['RESPONSE_ANALYZER', 'QUALITY_CHECK'],

  // Optional: Run even if the agent didn't respond
  alwaysRun: false,

  // Validation: Determines if evaluator should run
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean> => {
    // Example: Only run for certain types of responses
    return message.content?.text?.includes('transaction') || false;
  },

  // Handler: Main evaluation logic
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback,
    responses?: Memory[]
  ): Promise<void> => {
    try {
      // Analyze the response
      const responseText = responses?.[0]?.content?.text || '';

      if (responseText.includes('transaction')) {
        // Extract and store transaction data
        const txHash = extractTransactionHash(responseText);

        if (txHash) {
          // Store for future reference
          await runtime.createMemory(
            {
              id: generateId(),
              entityId: message.entityId,
              roomId: message.roomId,
              content: {
                text: `Transaction processed: ${txHash}`,
                type: 'transaction_record',
                data: { txHash, timestamp: Date.now() },
              },
            },
            'facts'
          );

          // Log the evaluation
          await runtime.adapter.log({
            entityId: message.entityId,
            roomId: message.roomId,
            type: 'evaluator',
            body: {
              evaluator: 'myEvaluator',
              result: 'transaction_extracted',
              txHash,
            },
          });
        }
      }

      // Can also trigger follow-up actions via callback
      if (callback) {
        callback({
          text: 'Analysis complete',
          content: { analyzed: true },
        });
      }
    } catch (error) {
      runtime.logger.error('Evaluator error:', error);
    }
  },
};

```

----------------------------------------

TITLE: ElizaOS Action Anatomy
DESCRIPTION: Defines the structure of an action in ElizaOS, including its name, description, similes for matching, validation logic, handler for execution, and examples for LLM training.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_16

LANGUAGE: typescript
CODE:
```
import {
  type Action,
  type ActionExample,
  type ActionResult,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  ModelType,
  composePromptFromState,
  logger,
} from '@elizaos/core';

export const myAction: Action = {
  name: 'MY_ACTION',
  description: 'Clear, concise description for the LLM to understand when to use this',

  // Similes help with fuzzy matching - be creative!
  similes: ['SIMILAR_ACTION', 'ANOTHER_NAME', 'CASUAL_REFERENCE'],

  // Validation: Can this action run in the current context?
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean> => {
    // Check permissions, settings, current state, etc.
    const hasPermission = await checkUserPermissions(runtime, message);
    const serviceAvailable = runtime.getService('my-service') !== null;

    return hasPermission && serviceAvailable;
  },

  // Handler: The brain of your action
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback,
    responses?: Memory[]
  ): Promise<ActionResult> => {
    // ALWAYS return ActionResult with success field!
    try {
      // Access previous action results from multi-step chains
      const context = options?.context;
      const previousResults = context?.previousResults || [];

      // Get your state (providers have already run)
      if (!state) {
        state = await runtime.composeState(message, [
          'RECENT_MESSAGES',
          'CHARACTER',
          'ACTION_STATE', // Includes previous action results
        ]);
      }

      // Your action logic here
      const result = await doSomethingAmazing();

      // Use callback for intermediate responses
      if (callback) {
        await callback({
          text: `Working on it...`,
          actions: ['MY_ACTION'],
        });
      }

      // Return structured result
      return {
        success: true, // REQUIRED field
        text: `Action completed: ${result.summary}`,
        values: {
          // These merge into state for next actions
          lastActionTime: Date.now(),
          resultData: result.data,
        },
        data: {
          // Raw data for logging/debugging
          actionName: 'MY_ACTION',
          fullResult: result,
        },
      };
    } catch (error) {
      logger.error('Action failed:', error);

      return {
        success: false, // REQUIRED field
        text: 'Failed to complete action',
        error: error instanceof Error ? error : new Error(String(error)),
        data: {
          actionName: 'MY_ACTION',
          errorDetails: error.message,
        },
      };
    }
  },

  // Examples: Teach the LLM through scenarios
  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'Can you do the thing?' },
      },
      {
        name: '{{agent}}',
        content: {
          text: "I'll do that for you right away!",
          actions: ['MY_ACTION'],
        },
      },
    ],
  ] as ActionExample[][],
};
```

----------------------------------------

TITLE: Provider Pattern Structure
DESCRIPTION: Defines the standard structure for a provider, including its name, description, priority, and a get function to retrieve data for the agent runtime.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/complete-documentation.mdx#_snippet_13

LANGUAGE: typescript
CODE:
```
export const providerName: Provider = {
  name: 'PROVIDER_NAME',
  description: 'What context this provides',
  position: 100, // Order priority
  get: async (runtime: IAgentRuntime, message: Memory) => {
    return {
      data: {}, // Raw data
      values: {}, // Processed values
      text: '', // Formatted text for prompt
    };
  },
};
```

----------------------------------------

TITLE: Example Projects: Trading Bot Plugins
DESCRIPTION: Configuration snippet for a single-agent project focused on trading. It includes bootstrap, binance, and dexscreener plugins.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/projects.mdx#_snippet_8

LANGUAGE: typescript
CODE:
```
plugins: [
  "@elizaos/plugin-bootstrap",
  "plugin-binance",
  "plugin-dexscreener"
]
```

----------------------------------------

TITLE: ElizaOS CLI Related Commands
DESCRIPTION: Lists related ElizaOS CLI commands for project management and environment configuration, including start, dev, test, and create.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/env.mdx#_snippet_11

LANGUAGE: APIDOC
CODE:
```
Related Commands:

- start: Start your project with the configured environment
- dev: Run in development mode with the configured environment
- test: Run tests with environment configuration
- create: Create a new project with initial environment setup
```

----------------------------------------

TITLE: Check Migration Logs for Errors
DESCRIPTION: Provides an example of an error message that might appear in logs when database migrations fail. This helps in diagnosing issues related to table creation or schema updates.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/sql/plugin-tables.mdx#_snippet_19

LANGUAGE: bash
CODE:
```
[ERROR] Failed to run migrations for plugin @company/my-plugin
```

----------------------------------------

TITLE: Environment Configuration for Auto-Loading Docs
DESCRIPTION: Configures the environment variables for the ElizaOS agent, including the OpenAI API key and enabling the auto-loading of documents on startup. It also shows how to specify a custom path for the documents.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/examples.mdx#_snippet_3

LANGUAGE: env
CODE:
```
# Required: Your AI provider
OPENAI_API_KEY=sk-...

# Auto-load documents on startup
LOAD_DOCS_ON_STARTUP=true

# Optional: Custom docs path (default is ./docs)
KNOWLEDGE_PATH=/path/to/your/documents
```

----------------------------------------

TITLE: Activate Plugins in Character Configuration (JSON)
DESCRIPTION: Example of how to list plugins within the `character.json` file to activate them for the agent.

SOURCE: https://github.com/elizaos/docs/blob/main/development.mdx#_snippet_4

LANGUAGE: json
CODE:
```
{
  "name": "MyAgent",
  "plugins": [
    "@elizaos/plugin-sql",
    "@elizaos/plugin-twitter",
    "@elizaos/plugin-discord"
  ],
  "bio": ["Your agent's description"],
  "style": {
    "all": ["conversational", "friendly"]
  }
}
```

----------------------------------------

TITLE: Basic ElizaOS Telegram Integration
DESCRIPTION: Demonstrates the basic setup for integrating ElizaOS with Telegram using the `@elizaos/plugin-telegram`. It initializes the AgentRuntime with the plugin and configures the bot's character and settings.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/telegram/complete-documentation.mdx#_snippet_30

LANGUAGE: typescript
CODE:
```
import { telegramPlugin } from '@elizaos/plugin-telegram';
import { AgentRuntime } from '@elizaos/core';

const runtime = new AgentRuntime({
  plugins: [telegramPlugin],
  character: {
    name: "TelegramBot",
    clients: ["telegram"],
    settings: {
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN
    }
  }
});

await runtime.start();
```

----------------------------------------

TITLE: Character Configuration
DESCRIPTION: Defines the configuration for a character, including its name, associated clients, example posts, and specific settings that can override environment variables.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/complete-documentation.mdx#_snippet_11

LANGUAGE: typescript
CODE:
```
const character = {
  name: "TwitterBot",
  clients: ["twitter"],
  postExamples: [
    "Exploring the future of decentralized AI...",
    "What if consciousness is just emergence at scale?",
    "Building in public: day 42 of the journey"
  ],
  settings: {
    // Override environment variables
    TWITTER_POST_ENABLE: "true",
    TWITTER_POST_INTERVAL_MIN: "60"
  }
};
```

----------------------------------------

TITLE: Streaming Response Pattern Example
DESCRIPTION: Demonstrates the streaming response pattern for handling data that arrives in chunks. It shows how to initiate a stream, process each chunk with potential delays, and provide a final summary upon completion.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_19

LANGUAGE: typescript
CODE:
```
const streamingAction: Action = {
  name: 'STREAM_DATA',

  handler: async (runtime, message, state, options, callback) => {
    const dataStream = await getDataStream(message.content.query);

    // Initial response
    await callback({
      text: 'Streaming data as it arrives...', 
      actions: ['STREAM_START'],
    });

    // Stream chunks
    for await (const chunk of dataStream) {
      await callback({
        text: chunk.data,
        actions: ['STREAM_CHUNK'],
        metadata: {
          chunkId: chunk.id,
          isPartial: true,
        },
      });

      // Rate limit streaming
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Final summary
    await callback({
      text: "Streaming complete! Here's a summary of the data...",
      actions: ['STREAM_COMPLETE'],
      metadata: { totalChunks: dataStream.length },
    });

    return true;
  },
};

```

----------------------------------------

TITLE: Manage Plugins
DESCRIPTION: Demonstrates how to manage plugins within an elizaOS project, including listing available plugins, adding a new plugin, and publishing your own plugin to the registry. Includes a test option for publishing.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/overview.mdx#_snippet_5

LANGUAGE: bash
CODE:
```
# List available plugins
elizaos plugins list

# Add a plugin to your project
elizaos plugins add @elizaos/plugin-discord

# Publish your plugin (from plugin directory)
elizaos publish

# Test publishing without making changes
elizaos publish --test
```

----------------------------------------

TITLE: Implementing Model Handlers for LLM Plugins
DESCRIPTION: Provides an example of implementing model handlers for different model types (TEXT_SMALL, TEXT_EMBEDDING) used in LLM plugins, including emitting usage events and handling parameters.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_44

LANGUAGE: typescript
CODE:
```
import { ModelType, GenerateTextParams, EventType } from '@elizaos/core';

export const models = {
  [ModelType.TEXT_SMALL]: async (
    runtime: IAgentRuntime,
    params: GenerateTextParams
  ): Promise<string> => {
    const client = createClient(runtime);
    const { text, usage } = await client.generateText({
      model: getSmallModel(runtime),
      prompt: params.prompt,
      temperature: params.temperature ?? 0.7,
      maxTokens: params.maxTokens ?? 4096,
    });

    // Emit usage event
    runtime.emitEvent(EventType.MODEL_USED, {
      provider: 'my-llm',
      type: ModelType.TEXT_SMALL,
      tokens: usage,
    });

    return text;
  },

  [ModelType.TEXT_EMBEDDING]: async (
    runtime: IAgentRuntime,
    params: TextEmbeddingParams | string | null
  ): Promise<number[]> => {
    if (params === null) {
      // Return test embedding
      return Array(1536).fill(0);
    }

    const text = typeof params === 'string' ? params : params.text;
    const embedding = await client.createEmbedding(text);
    return embedding;
  },
};
```

----------------------------------------

TITLE: TwitterPostClient Tests
DESCRIPTION: Tests for the TwitterPostClient, including tweet generation from examples and respecting maximum tweet length, as well as calculating next post intervals with variance based on settings.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/testing-guide.mdx#_snippet_2

LANGUAGE: typescript
CODE:
```
import { TwitterPostClient } from '@elizaos/plugin-twitter';

describe('TwitterPostClient', () => {
  let postClient: TwitterPostClient;
  let mockClient: any;
  let mockRuntime: any;
  
  beforeEach(() => {
    mockClient = {
      tweet: vi.fn().mockResolvedValue({ id: '123', text: 'Posted' })
    };
    
    mockRuntime = {
      getSetting: vi.fn(),
      generateText: vi.fn().mockResolvedValue({
        text: 'Generated tweet content'
      }),
      character: { 
        postExamples: ['Example 1', 'Example 2']
      }
    };
    
    postClient = new TwitterPostClient(mockClient, mockRuntime, {});
  });
  
  describe('post generation', () => {
    it('should generate tweets from examples', async () => {
      const tweet = await postClient.generateTweet();
      
      expect(mockRuntime.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('post')
            })
          ])
        })
      );
      
      expect(tweet).toBe('Generated tweet content');
    });
    
    it('should respect max tweet length', async () => {
      mockRuntime.generateText.mockResolvedValue({
        text: 'a'.repeat(500)  // Too long
      });
      
      const tweet = await postClient.generateTweet();
      
      expect(tweet.length).toBeLessThanOrEqual(280);
    });
  });
  
  describe('scheduling', () => {
    it('should calculate intervals with variance', () => {
      mockRuntime.getSetting.mockImplementation((key) => {
        const settings = {
          TWITTER_POST_INTERVAL_MIN: '60',
          TWITTER_POST_INTERVAL_MAX: '120',
          TWITTER_POST_INTERVAL_VARIANCE: '0.2'
        };
        return settings[key];
      });
      
      const interval = postClient.calculateNextInterval();
      
      // Base range: 60-120 minutes
      // With 20% variance: 48-144 minutes
      expect(interval).toBeGreaterThanOrEqual(48 * 60 * 1000);
      expect(interval).toBeLessThanOrEqual(144 * 60 * 1000);
    });
  });
});
```

----------------------------------------

TITLE: Error Handling Example
DESCRIPTION: Provides a robust error handling mechanism for API requests, including network errors and specific HTTP status codes like 404 (Session not found).

SOURCE: https://github.com/elizaos/docs/blob/main/guides/sessions-api-guide.mdx#_snippet_9

LANGUAGE: javascript
CODE:
```
try {
  const response = await fetch(`/api/messaging/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message })
  });

  if (!response.ok) {
    const error = await response.json();
    if (response.status === 404) {
      // Session not found - create a new one
      await createNewSession();
    } else {
      console.error('Error:', error.message);
    }
  }
} catch (error) {
  console.error('Network error:', error);
}
```

----------------------------------------

TITLE: Event-Driven New User Welcome Task
DESCRIPTION: Implements an event-driven task that sends a welcome message to new users and schedules a follow-up task for 24 hours later. It listens for the ENTITY_JOINED event to trigger the welcome process.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_8

LANGUAGE: typescript
CODE:
```
// Task that triggers on specific events
runtime.registerTaskWorker({
  name: 'NEW_USER_WELCOME',

  execute: async (runtime, options) => {
    const { userId, userName } = options;

    // Send welcome message
    await runtime.sendMessage({
      roomId: options.roomId,
      content: {
        text: `Welcome ${userName}! 👋 I'm here to help you get started.`, 
        actions: ['WELCOME'],
      },
    });

    // Schedule follow-up
    await runtime.createTask({
      name: 'WELCOME_FOLLOWUP',
      metadata: {
        userId,
        executeAt: Date.now() + 1000 * 60 * 60 * 24, // 24 hours later
      },
      tags: ['queue'],
    });
  },
});

// Trigger on new user
runtime.on(EventType.ENTITY_JOINED, async (payload) => {
  await runtime.createTask({
    name: 'NEW_USER_WELCOME',
    metadata: {
      userId: payload.entityId,
      userName: payload.entity.name,
      roomId: payload.roomId,
    },
    tags: ['queue', 'immediate'],
  });
});

```

----------------------------------------

TITLE: Custom Provider Implementation
DESCRIPTION: Example of a custom provider that fetches data from a service and formats it for the agent's context. It demonstrates how to access runtime services, format text, and return structured data including text, values, and raw data.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_34

LANGUAGE: typescript
CODE:
```
import { Provider, ProviderResult, IAgentRuntime, Memory, State, addHeader } from '@elizaos/core';

export const myProvider: Provider = {
  name: 'myProvider',
  description: 'Provides contextual information about X',

  // Optional: Set to true if this provider should only run when explicitly requested
  dynamic: false,

  // Optional: Control execution order (lower numbers run first, can be negative)
  position: 100,

  // Optional: Set to true to exclude from default provider list
  private: false,

  get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
    try {
      const service = runtime.getService('my-service') as MyService;
      const data = await service.getCurrentData();

      // Format data for LLM context
      const formattedText = addHeader(
        '# Current System Status',
        `Field 1: ${data.field1}
Field 2: ${data.field2}
Last updated: ${new Date(data.timestamp).toLocaleString()}`
      );

      return {
        // Text that will be included in the LLM prompt
        text: formattedText,

        // Values that can be accessed by other providers/actions
        values: {
          currentField1: data.field1,
          currentField2: data.field2,
          lastUpdate: data.timestamp,
        },

        // Raw data for internal use
        data: {
          raw: data,
          processed: true,
        },
      };
    } catch (error) {
      return {
        text: 'Unable to retrieve current status',
        values: {},
        data: { error: error.message },
      };
    }
  },
};

```

----------------------------------------

TITLE: Example Agent Configuration
DESCRIPTION: Provides a practical example of how to define an Agent object in TypeScript, including its name, bio, adjectives, topics, message examples, style preferences, and a list of plugins. It demonstrates conditional plugin loading based on environment variables.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/agents.mdx#_snippet_2

LANGUAGE: typescript
CODE:
```
export const character: Character = {
  name: "Eliza",
  bio: [
    "Helpful AI assistant",
    "Expert in technical topics",
    "Friendly conversationalist"
  ],
  adjectives: ["helpful", "knowledgeable", "friendly"],
  topics: ["technology", "programming", "general knowledge"],
  
  messageExamples: [[
    {
      name: "{{user}}",
      content: { text: "Can you help me debug this?" }
    },
    {
      name: "Eliza",
      content: { text: "I'd be happy to help! Can you share the error message?" }
    }
  ]],
  
  style: {
    all: ["be concise", "use examples"],
    chat: ["be conversational"],
    post: ["use emojis sparingly"]
  },
  
  plugins: [
    "@elizaos/plugin-bootstrap",
    ...(process.env.DISCORD_API_TOKEN ? ["@elizaos/plugin-discord"] : []),
    ...(process.env.OPENAI_API_KEY ? ["@elizaos/plugin-openai"] : [])
  ]
};
```

----------------------------------------

TITLE: Action with Usage Examples
DESCRIPTION: Shows how to include usage examples within an Action definition, providing context for its interaction.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/plugins/actions.mdx#_snippet_3

LANGUAGE: typescript
CODE:
```
const action: Action = {
  name: 'WEATHER',
  description: 'Get weather info',
  examples: [[
    { name: "user", content: { text: "What's the weather?" } },
    { name: "agent", content: { text: "Let me check the weather for you." } }
  ]],
  validate: async (runtime, message) => {
    return message.content.toLowerCase().includes('weather');
  },
  handler: async (runtime, message) => {
    const weather = await fetchWeather();
    return { text: `It's ${weather.temp}°C and ${weather.condition}` };
  }
};
```

----------------------------------------

TITLE: Batch Get Multiple Accounts
DESCRIPTION: Efficiently retrieves multiple account information in batches to avoid overwhelming the connection. It processes a list of public keys, fetching them in chunks of BATCH_SIZE.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/solana/complete-documentation.mdx#_snippet_14

LANGUAGE: typescript
CODE:
```
async function batchGetMultipleAccounts(
  connection: Connection,
  publicKeys: PublicKey[]
): Promise<(AccountInfo<Buffer> | null)[]> {
  const BATCH_SIZE = 100;
  const results: (AccountInfo<Buffer> | null)[] = [];

  for (let i = 0; i < publicKeys.length; i += BATCH_SIZE) {
    const batch = publicKeys.slice(i, i + BATCH_SIZE);
    const batchResults = await connection.getMultipleAccountsInfo(batch);
    results.push(...batchResults);
  }

  return results;
}
```

----------------------------------------

TITLE: Code Example Standards
DESCRIPTION: Guidelines for writing effective code examples, emphasizing completeness, functionality, necessary imports, comments for complex logic, basic and advanced usage patterns, consistent formatting, and realistic naming. All examples must be tested.

SOURCE: https://github.com/elizaos/docs/blob/main/CLAUDE.md#_snippet_2

LANGUAGE: javascript
CODE:
```
// Import necessary modules
import { fetchData } from './api';

/**
 * Fetches and processes data from an API.
 * @param {string} url - The API endpoint URL.
 * @returns {Promise<object>} - The processed data.
 */
async function processData(url) {
  try {
    const data = await fetchData(url);
    // Complex logic explanation
    const processed = data.items.map(item => ({
      id: item.id,
      name: item.name.toUpperCase()
    }));
    return processed;
  } catch (error) {
    console.error('Error processing data:', error);
    throw error;
  }
}

// Basic usage example
processData('/api/items')
  .then(result => console.log('Basic result:', result))
  .catch(err => console.error(err));

// Advanced usage example with error handling
async function advancedUsage() {
  try {
    const advancedResult = await processData('/api/advanced-items');
    console.log('Advanced result:', advancedResult);
  } catch (error) {
    console.error('Advanced usage failed:', error.message);
  }
}
advancedUsage();
```

----------------------------------------

TITLE: Listing Installed Plugins
DESCRIPTION: Shows how to list plugins that are currently installed in your ElizaOS project by checking the project's `package.json` dependencies.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/plugins.mdx#_snippet_4

LANGUAGE: bash
CODE:
```
# Show plugins currently in your project's package.json
elizaos plugins installed-plugins
```

----------------------------------------

TITLE: Minimal Action Example
DESCRIPTION: A basic example of creating an Action with a name, description, validation, and handler.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/plugins/actions.mdx#_snippet_1

LANGUAGE: typescript
CODE:
```
const action: Action = {
  name: 'MY_ACTION',
  description: 'Does something',
  validate: async () => true,
  handler: async (runtime, message) => {
    return { text: "Done!" };
  }
};
```

----------------------------------------

TITLE: Configuration Schema Validation with Zod
DESCRIPTION: Shows how to use Zod to define a schema for validating plugin configuration at runtime. It includes examples of required string fields, optional URL fields, and numeric fields with defaults.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_63

LANGUAGE: typescript
CODE:
```
import { z } from 'zod';

export const configSchema = z.object({
  API_KEY: z.string().min(1, 'API key is required'),
  ENDPOINT_URL: z.string().url().optional(),
  TIMEOUT: z.number().positive().default(30000),
});

export async function validateConfig(runtime: IAgentRuntime) {
  const config = {
    API_KEY: runtime.getSetting('MY_API_KEY'),
    ENDPOINT_URL: runtime.getSetting('MY_ENDPOINT_URL'),
    TIMEOUT: Number(runtime.getSetting('MY_TIMEOUT') || 30000),
  };

  return configSchema.parse(config);
}
```

----------------------------------------

TITLE: Custom Event Handler Implementation
DESCRIPTION: Demonstrates how to add custom event handlers in ElizaOS to pre-process or post-process events. This example shows intercepting `MESSAGE_RECEIVED` events.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/complete-documentation.mdx#_snippet_25

LANGUAGE: typescript
CODE:
```
// Add custom handling for existing events
runtime.on(EventType.MESSAGE_RECEIVED, async (payload) => {
  // Custom pre-processing
  await customPreProcessor(payload);

  // Call default handler
  await bootstrapPlugin.events[EventType.MESSAGE_RECEIVED][0](payload);

  // Custom post-processing
  await customPostProcessor(payload);
});
```

----------------------------------------

TITLE: Install Anthropic Plugin
DESCRIPTION: Command to install the Anthropic plugin for elizaOS.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/llm/anthropic.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
elizaos plugins add @elizaos/plugin-anthropic
```

----------------------------------------

TITLE: Component Test Example (Vitest)
DESCRIPTION: An example of a component test file using Vitest, demonstrating describe, it, and expect for testing plugin functionality.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/test.mdx#_snippet_2

LANGUAGE: typescript
CODE:
```
// __tests__/myPlugin.test.ts
import { describe, it, expect } from 'vitest';
import { MyPlugin } from '../src/myPlugin';

describe('MyPlugin', () => {
  it('should initialize correctly', () => {
    const plugin = new MyPlugin();
    expect(plugin.name).toBe('MyPlugin');
  });

  it('should handle actions', async () => {
    const plugin = new MyPlugin();
    const result = await plugin.handleAction('test');
    expect(result).toBeDefined();
  });
});
```

----------------------------------------

TITLE: Correct Event Name for Broadcasts
DESCRIPTION: This example highlights the critical difference between the 'message' event and the 'messageBroadcast' event. To receive broadcast messages intended for a room, you must listen on the 'messageBroadcast' event.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/socket-io-integration-guide.mdx#_snippet_3

LANGUAGE: javascript
CODE:
```
// [WRONG]
socket.on('message', handler)

// [CORRECT]
socket.on('messageBroadcast', handler)
```

----------------------------------------

TITLE: Solana Plugin Usage: Portfolio Management
DESCRIPTION: Provides examples of how users can query their wallet balance and portfolio value using natural language. The agent can display total value and individual token holdings.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/solana/examples.mdx#_snippet_4

LANGUAGE: text
CODE:
```
User: What's my wallet balance?
Agent: [Shows total portfolio value and individual token balances]

User: How much is my portfolio worth?
Agent: Your total portfolio value is $X,XXX.XX (XX.XX SOL)
```

----------------------------------------

TITLE: Bot Creation Steps
DESCRIPTION: Instructions for creating a Telegram bot using BotFather, including setting up essential bot properties and commands.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/telegram/complete-documentation.mdx#_snippet_12

LANGUAGE: bash
CODE:
```
# BotFather setup
# 1. Open @BotFather in Telegram
# 2. Send /newbot
# 3. Choose a name for your bot
# 4. Choose a username (must end in 'bot')
# 5. Save the token provided

# Bot settings configuration
# /setprivacy - Disable for group message access
# /setcommands - Set bot commands
# /setdescription - Add bot description
# /setabouttext - Set about text
```

----------------------------------------

TITLE: Plugin Development Workflow
DESCRIPTION: Outlines the typical workflow for developing a plugin, including creating a new plugin, installing it locally or from a branch for development, running tests, and publishing the plugin.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/plugins.mdx#_snippet_9

LANGUAGE: bash
CODE:
```
elizaos create -t plugin my-awesome-plugin
cd plugin-my-awesome-plugin
elizaos plugins add ./path/to/plugin-my-awesome-plugin
elizaos plugins add my-awesome-plugin --branch feature/new-feature
elizaos dev
elizaos test
elizaos publish --test
elizaos publish
```

----------------------------------------

TITLE: Troubleshooting Build Failures
DESCRIPTION: Build failures in ElizaOS projects can often be resolved by checking for TypeScript errors or ensuring dependencies are correctly installed. Running `bun install` followed by `bun run build` can help diagnose and fix these issues.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/create.mdx#_snippet_9

LANGUAGE: bash
CODE:
```
# Check for TypeScript errors
bun run build

# If build fails, check dependencies
bun install
bun run build
```

----------------------------------------

TITLE: Standard Plugin Directory Structure
DESCRIPTION: Illustrates the conventional directory layout for an ElizaOS plugin.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_12

LANGUAGE: bash
CODE:
```
packages/plugin-<name>/
├── src/
│   ├── index.ts           # Plugin manifest and exports
│   ├── service.ts         # Main service implementation
│   ├── actions/           # Agent capabilities
│   │   └── *.ts
│   ├── providers/         # Context providers
│   │   └── *.ts
│   ├── evaluators/        # Post-processing
│   │   └── *.ts
│   ├── handlers/          # LLM model handlers
│   │   └── *.ts
│   ├── types/             # TypeScript definitions
│   │   └── index.ts
│   ├── constants/         # Configuration constants
│   │   └── index.ts
│   ├── utils/             # Helper functions
│   │   └── *.ts
│   └── tests.ts           # Test suite
├── __tests__/             # Unit tests
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

----------------------------------------

TITLE: ElizaOS Update Check Example Output
DESCRIPTION: Shows an example of the output when running `elizaos update --check`, indicating current and latest versions of the CLI and project packages.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/update.mdx#_snippet_2

LANGUAGE: bash
CODE:
```
$ elizaos update --check

Checking for updates...
Current CLI version: 1.3.5
Latest CLI version: 1.4.0

elizaOS packages that can be updated:
  - @elizaos/core (1.3.0) → 1.4.0
  - @elizaos/plugin-openai (1.2.5) → 1.4.0

To apply updates, run: elizaos update
```

----------------------------------------

TITLE: Start Agent API Endpoint
DESCRIPTION: This section describes the POST request to start an agent. It includes the endpoint path, required parameters, and expected responses.

SOURCE: https://github.com/elizaos/docs/blob/main/api-reference/agents/start-an-agent.mdx#_snippet_0

LANGUAGE: APIDOC
CODE:
```
openapi: post /api/agents/{agentId}/start

```

----------------------------------------

TITLE: Agent Configuration Example
DESCRIPTION: Demonstrates how to define an AI agent's configuration, including its name, biography, and the plugins it utilizes. This example uses TypeScript and specifies core functionality, Discord integration, and web search capabilities.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/index.mdx#_snippet_0

LANGUAGE: typescript
CODE:
```
import { Character } from '@elizaos/core';

export const character: Character = {
  name: "Assistant",
  bio: "A helpful AI agent",
  plugins: [
    "@elizaos/plugin-bootstrap",     // Core functionality
    "@elizaos/plugin-discord",       // Discord integration
    "plugin-web-search"              // Web search capability
  ]
};
```

----------------------------------------

TITLE: ElizaOS CLI Reference
DESCRIPTION: Key ElizaOS commands for project management and development, including starting, testing, environment configuration, and project creation.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/dev.mdx#_snippet_20

LANGUAGE: cli
CODE:
```
# Start your project in production mode
/cli-reference/start

# Run tests for your project
/cli-reference/test

# Configure environment variables for development
/cli-reference/env

# Create new projects with development structure
/cli-reference/create
```

----------------------------------------

TITLE: Character Configuration Example
DESCRIPTION: Defines the configuration for an agent's character, including its name, plugins, settings, system prompt, bio, topics, message examples, and response style. Plugin loading is conditional based on environment variables.

SOURCE: https://github.com/elizaos/docs/blob/main/deep-dive/real-world-patterns.mdx#_snippet_9

LANGUAGE: typescript
CODE:
```
export const character: Character = {
  name: 'Eliza',
  plugins: [
    // Core plugins first
    '@elizaos/plugin-sql',
    
    // Conditional plugins based on environment
    ...(process.env.ANTHROPIC_API_KEY ? ['@elizaos/plugin-anthropic'] : []),
    ...(process.env.OPENAI_API_KEY ? ['@elizaos/plugin-openai'] : []),
    ...(process.env.DISCORD_API_TOKEN ? ['@elizaos/plugin-discord'] : []),
    ...(process.env.TELEGRAM_BOT_TOKEN ? ['@elizaos/plugin-telegram'] : []),
    
    // Bootstrap plugin (unless explicitly disabled)
    ...(!process.env.IGNORE_BOOTSTRAP ? ['@elizaos/plugin-bootstrap'] : []),
  ],
  settings: {
    secrets: {},
    avatar: 'https://elizaos.github.io/eliza-avatars/Eliza/portrait.png',
  },
  system: 'Respond to all messages in a helpful, conversational manner...',
  bio: [
    'Engages with all types of questions and conversations',
    'Provides helpful, concise responses',
    // ...
  ],
  topics: ['general knowledge', 'problem solving', 'technology'],
  messageExamples: [/* conversation examples */],
  style: {
    all: ['Keep responses concise', 'Use clear language'],
    chat: ['Be conversational', 'Show personality'],
  },
};
```

----------------------------------------

TITLE: GitHub Actions Workflow for Discord Plugin Tests
DESCRIPTION: A GitHub Actions workflow that runs tests for the Discord plugin on push or pull request events affecting the plugin's directory. It sets up Node.js, installs dependencies using Bun, runs unit tests with coverage, and uploads the coverage report to Codecov.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/discord/testing-guide.mdx#_snippet_13

LANGUAGE: yaml
CODE:
```
name: Discord Plugin Tests

on:
  push:
    paths:
      - 'packages/plugin-discord/**'
  pull_request:
    paths:
      - 'packages/plugin-discord/**'

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 20
        
    - name: Install dependencies
      run: bun install
      
    - name: Run unit tests
      run: bun test packages/plugin-discord --coverage
      env:
        DISCORD_API_TOKEN: ${{ secrets.TEST_DISCORD_TOKEN }}
        DISCORD_APPLICATION_ID: ${{ secrets.TEST_DISCORD_APP_ID }}
        
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage/coverage-final.json
```

----------------------------------------

TITLE: Example Projects: Discord Bot Plugins
DESCRIPTION: Configuration snippet for a single-agent project designed as a Discord bot. It includes bootstrap and discord plugins.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/projects.mdx#_snippet_7

LANGUAGE: typescript
CODE:
```
plugins: [
  "@elizaos/plugin-bootstrap",
  "@elizaos/plugin-discord"
]
```

----------------------------------------

TITLE: Mintlify Configuration File
DESCRIPTION: Example structure of a Mintlify configuration file (docs.json) which defines the project structure and navigation for the documentation site.

SOURCE: https://github.com/elizaos/docs/blob/main/README.md#_snippet_2

LANGUAGE: json
CODE:
```
{
  "name": "ElizaOS Documentation",
  "version": "1.0.0",
  "baseUrl": "/",
  "navigation": [
    {
      "title": "Getting Started",
      "route": "/"
    },
    {
      "title": "Core Concepts",
      "route": "/core-concepts"
    },
    {
      "title": "Deep Dive",
      "route": "/deep-dive"
    },
    {
      "title": "API Reference",
      "route": "/api-reference"
    },
    {
      "title": "Examples",
      "route": "/examples"
    },
    {
      "title": "Development",
      "route": "/development"
    },
    {
      "title": "Contributing",
      "route": "/contributing"
    },
    {
      "title": "Publishing",
      "route": "/publishing"
    },
    {
      "title": "Troubleshooting",
      "route": "/troubleshooting"
    }
  ]
}
```

----------------------------------------

TITLE: Install OpenRouter Plugin
DESCRIPTION: Command to add the OpenRouter plugin to ElizaOS.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/llm/openrouter.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
elizaos plugins add @elizaos/plugin-openrouter
```

----------------------------------------

TITLE: FAQ Telegram Bot
DESCRIPTION: Implements a Telegram bot focused on answering frequently asked questions. It depends on @elizaos/core, @elizaos/plugin-telegram, and @elizaos/plugin-bootstrap. The bot is configured with its name, description, plugins, client, and settings, including the Telegram bot token. It uses a 'knowledge' array for predefined answers and a 'telegramMessageHandlerTemplate' to guide its responses as a customer support bot.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/telegram/examples.mdx#_snippet_2

LANGUAGE: typescript
CODE:
```
const faqBot = {
  name: "FAQBot",
  description: "Answers frequently asked questions",
  plugins: [bootstrapPlugin, telegramPlugin],
  clients: ["telegram"],
  settings: {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN
  },
  knowledge: [
    "Our business hours are 9 AM to 5 PM EST, Monday through Friday.",
    "Shipping typically takes 3-5 business days.",
    "We accept returns within 30 days of purchase.",
    "Customer support can be reached at support@example.com"
  ],
  templates: {
    telegramMessageHandlerTemplate: `
      You are a customer support FAQ bot. Answer questions based on the knowledge provided.
      If you don't know the answer, politely say so and suggest contacting support.
    `
  }
};
```

----------------------------------------

TITLE: Environment Setup for Database Connection
DESCRIPTION: Configures database connection URLs for PostgreSQL (production) and PGLite (development) using environment variables.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/sql.mdx#_snippet_1

LANGUAGE: bash
CODE:
```
# For PostgreSQL (production)
POSTGRES_URL=postgresql://user:password@host:5432/database

# For custom PGLite directory (development)
# Optional - defaults to ./.eliza/.elizadb if not set
PGLITE_DATA_DIR=/path/to/custom/db
```

----------------------------------------

TITLE: Service Communication Example
DESCRIPTION: Illustrates how services can communicate with the ElizaOS runtime and other services. The `NotificationService` example shows how to retrieve other services by type or iterate through all registered services.

SOURCE: https://github.com/elizaos/docs/blob/main/deep-dive/services.mdx#_snippet_6

LANGUAGE: typescript
CODE:
```
class NotificationService extends Service {
  static serviceType = 'notification' as const;
  capabilityDescription = 'Cross-platform notifications';
  
  async notify(message: string) {
    // Get service by type
    const discord = this.runtime.getService('discord');
    if (discord) {
      await discord.sendMessage(channelId, message);
    }
    
    // Check all registered services
    const services = this.runtime.getAllServices();
    // Coordinate across services
  }
}
```

----------------------------------------

TITLE: Running Projects
DESCRIPTION: Commands to run ElizaOS projects. Includes starting with a default or specific character file, and running in development mode.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/projects.mdx#_snippet_4

LANGUAGE: bash
CODE:
```
# Start with default character
elizaos start

# Start with specific character file
elizaos start --character character.json

# Development mode
elizaos dev
```

----------------------------------------

TITLE: Running Tests with Bun
DESCRIPTION: Provides common commands for running tests using the Bun test runner, including running all tests, specific files, watch mode, and coverage.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/testing-guide.mdx#_snippet_16

LANGUAGE: bash
CODE:
```
# Run all bootstrap tests
bun test

# Run specific test file
bun test packages/plugin-bootstrap/src/__tests__/actions.test.ts

# Run tests in watch mode
bun test --watch

# Run with coverage
bun test --coverage
```

----------------------------------------

TITLE: End-to-End Test Example (ElizaOS Test Utils)
DESCRIPTION: An example of an end-to-end test file using elizaOS core test utilities to create and interact with an agent.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/test.mdx#_snippet_3

LANGUAGE: typescript
CODE:
```
// e2e/agent-flow.test.ts
import { createTestAgent } from '@elizaos/core/test-utils';

describe('Agent Flow', () => {
  it('should respond to messages', async () => {
    const agent = await createTestAgent({
      character: './test-character.json'
    });

    const response = await agent.sendMessage('Hello');
    expect(response).toContain('Hi');
  });
});
```

----------------------------------------

TITLE: Telegram Bot Lifecycle Integration Test
DESCRIPTION: Tests the integration of the TelegramService, focusing on the bot's lifecycle management, including starting, stopping, connecting to Telegram, and handling incoming messages.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/telegram/testing-guide.mdx#_snippet_10

LANGUAGE: typescript
CODE:
```
import { TelegramService } from '@elizaos/plugin-telegram';
import { AgentRuntime } from '@elizaos/core';

describe('Bot Lifecycle Integration', () => {
  let service: TelegramService;
  let runtime: AgentRuntime;
  
  beforeAll(async () => {
    runtime = new AgentRuntime({
      character: {
        name: 'TestBot',
        clients: ['telegram']
      },
      settings: {
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_TEST_TOKEN
      }
    });
    
    service = await TelegramService.start(runtime);
  });
  
  afterAll(async () => {
    await service.stop();
  });
  
  it('should connect to Telegram', async () => {
    expect(service.bot).toBeDefined();
    const botInfo = await service.bot.telegram.getMe();
    expect(botInfo.is_bot).toBe(true);
  });
  
  it('should handle incoming messages', async () => {
    // Send test message
    const testMessage = await sendTestMessage(
      'Test message',
      process.env.TELEGRAM_TEST_CHAT_ID
    );
    
    // Wait for processing
    await waitForProcessing(1000);
    
    // Verify message was processed
    expect(runtime.processMessage).toHaveBeenCalled();
  });
});
```

----------------------------------------

TITLE: Multi-Platform Bot Initialization
DESCRIPTION: Demonstrates how to initialize a multi-platform bot using ElizaOS, integrating with Discord, Telegram, and Twitter clients. It highlights the use of agent runtime, plugins, and providers for platform-specific information.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_11

LANGUAGE: typescript
CODE:
```
import {
  DiscordClient,
} from '@elizaos/discord';
import {
  TelegramClient,
} from '@elizaos/telegram';
import {
  TwitterClient,
} from '@elizaos/twitter';

const multiPlatformBot = new AgentRuntime({
  character: {
    name: 'OmniBot',
    description: 'Available everywhere',
  },

  plugins: [
    bootstrapPlugin,
    {
      name: 'platform-adapter',
      providers: [
        {
          name: 'PLATFORM_INFO',
          get: async (runtime, message) => {
            const source = message.content.source;
            const platformTips = {
              discord: 'Use /commands for Discord-specific features',
              telegram: 'Use inline keyboards for better UX',
              twitter: 'Keep responses under 280 characters',
            };

            return {
              data: { platform: source },
              values: { isTwitter: source === 'twitter' },
              text: `Platform: ${source}\nTip: ${platformTips[source] || 'None'}`,
            };
          },
        },
      ],
    },
  ],

  clients: [new DiscordClient(), new TelegramClient(), new TwitterClient()],
});
```

----------------------------------------

TITLE: Install Ollama Plugin
DESCRIPTION: Command to add the Ollama plugin to elizaOS.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/llm/ollama.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
elizaos plugins add @elizaos/plugin-ollama
```

----------------------------------------

TITLE: Testing Async Actions
DESCRIPTION: Illustrates how to test actions that involve asynchronous operations. This example shows mocking an asynchronous method on the runtime and verifying that the action handler correctly processes the async result. It utilizes 'setupActionTest' for test setup.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/testing-guide.mdx#_snippet_9

LANGUAGE: typescript
CODE:
```
describe('Async Action', () => {
  it('should handle async operations', async () => {
    const setup = setupActionTest({
      runtimeOverrides: {
        useModel: mock().mockImplementation(async (modelType) => {
          // Simulate async delay
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { result: 'async result' };
        }),
      },
    });

    const result = await asyncAction.handler(
      setup.mockRuntime as IAgentRuntime,
      setup.mockMessage as Memory,
      setup.mockState as State,
      {},
      setup.callbackFn as HandlerCallback
    );

    expect(result).toBe(true);
    expect(setup.callbackFn).toHaveBeenCalled();
  });
});
```

----------------------------------------

TITLE: Simple Text Provider Example
DESCRIPTION: An example of a basic provider that fetches weather data and returns a formatted text string along with key-value pairs.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/state-and-providers-guide.mdx#_snippet_5

LANGUAGE: typescript
CODE:
```
const weatherProvider: Provider = {
  name: 'weatherProvider',
  description: 'Provides current weather information',
  dynamic: true,

  get: async (runtime, message, state) => {
    const weather = await fetchWeatherData();

    return {
      text: `Current weather: ${weather.temp}°F, ${weather.condition}`,
      values: {
        temperature: weather.temp,
        condition: weather.condition,
      },
    };
  },
};
```

----------------------------------------

TITLE: Related ElizaOS CLI Commands
DESCRIPTION: This section lists related ElizaOS CLI commands that are useful after project creation. These include commands for starting the project, running in development mode, and managing environment variables.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/create.mdx#_snippet_11

LANGUAGE: bash
CODE:
```
- `start`: Start your created project
- `dev`: Run your project in development mode
- `env`: Configure environment variables
```

----------------------------------------

TITLE: Plugin Initialization Configuration Access
DESCRIPTION: Demonstrates how to access configuration settings during plugin initialization, considering that the runtime might not be fully available. It shows how to safely retrieve API keys and boolean flags from multiple sources.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_62

LANGUAGE: typescript
CODE:
```
export const myPlugin: Plugin = {
  name: 'my-plugin',

  // Plugin-level config defaults
  config: {
    DEFAULT_TIMEOUT: 30000,
    RETRY_ATTEMPTS: 3,
  },

  async init(config: Record<string, string>, runtime?: IAgentRuntime) {
    // During init, runtime might not be available or fully initialized
    // Always check multiple sources:

    const apiKey =
      config.API_KEY || // From agent character config
      runtime?.getSetting('API_KEY') || // From runtime (may be undefined)
      process.env.API_KEY; // From environment

    if (!apiKey) {
      throw new Error('API_KEY required for my-plugin');
    }

    // For boolean values, be careful with string parsing
    const isEnabled =
      config.FEATURE_ENABLED === 'true' ||
      runtime?.getSetting('FEATURE_ENABLED') === 'true' ||
      process.env.FEATURE_ENABLED === 'true';
  },
};
```

----------------------------------------

TITLE: Testing ElizaOS Event Handlers
DESCRIPTION: Provides examples for testing event handlers in ElizaOS plugins, specifically focusing on MESSAGE_RECEIVED and ENTITY_JOINED events. It utilizes helper functions for test setup and mocks the runtime environment.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/testing-guide.mdx#_snippet_13

LANGUAGE: typescript
CODE:
```
// src/__tests__/events.test.ts
import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { myPlugin } from '../index';
import { setupActionTest } from './test-utils';
import {
  type IAgentRuntime,
  type Memory,
  EventType,
  type MessagePayload,
  type EntityPayload,
} from '@elizaos/core';

describe('Event Handlers', () => {
  let mockRuntime: any;
  let mockMessage: Partial<Memory>;
  let mockCallback: any;

  beforeEach(() => {
    const setup = setupActionTest();
    mockRuntime = setup.mockRuntime;
    mockMessage = setup.mockMessage;
    mockCallback = setup.callbackFn;
  });

  afterEach(() => {
    mock.restore();
  });

  it('should handle MESSAGE_RECEIVED event', async () => {
    const messageHandler = myPlugin.events?.[EventType.MESSAGE_RECEIVED]?.[0];
    expect(messageHandler).toBeDefined();

    if (messageHandler) {
      await messageHandler({
        runtime: mockRuntime as IAgentRuntime,
        message: mockMessage as Memory,
        callback: mockCallback,
        source: 'test',
      } as MessagePayload);

      expect(mockRuntime.createMemory).toHaveBeenCalledWith(mockMessage, 'messages');
    }
  });

  it('should handle ENTITY_JOINED event', async () => {
    const entityHandler = myPlugin.events?.[EventType.ENTITY_JOINED]?.[0];
    expect(entityHandler).toBeDefined();

    if (entityHandler) {
      await entityHandler({
        runtime: mockRuntime as IAgentRuntime,
        entityId: 'test-entity-id',
        worldId: 'test-world-id',
        roomId: 'test-room-id',
        metadata: {
          type: 'user',
          username: 'testuser',
        },
        source: 'test',
      } as EntityPayload);

      expect(mockRuntime.ensureConnection).toHaveBeenCalled();
    }
  });
});
```

----------------------------------------

TITLE: Agent Actions for Knowledge Plugin
DESCRIPTION: Lists the core agent actions provided by the Knowledge Plugin: PROCESS_KNOWLEDGE for remembering documents and SEARCH_KNOWLEDGE for querying the knowledge base.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/quick-start.mdx#_snippet_4

LANGUAGE: APIDOC
CODE:
```
PROCESS_KNOWLEDGE - "Remember this document: [file path or text]"
SEARCH_KNOWLEDGE - "Search your knowledge for [topic]"
```

----------------------------------------

TITLE: Test Environment Configuration
DESCRIPTION: Configuration file for setting up the test environment, including Discord API credentials and channel IDs.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/discord/testing-guide.mdx#_snippet_0

LANGUAGE: bash
CODE:
```
# .env.test
DISCORD_APPLICATION_ID=test_application_id
DISCORD_API_TOKEN=test_bot_token
DISCORD_TEST_CHANNEL_ID=test_text_channel_id
DISCORD_TEST_VOICE_CHANNEL_ID=test_voice_channel_id
DISCORD_TEST_SERVER_ID=test_server_id

# Test user for interactions
DISCORD_TEST_USER_ID=test_user_id
```

----------------------------------------

TITLE: Task Scheduling Example
DESCRIPTION: Demonstrates how to register a task worker for daily summaries and create a scheduled task. The worker validates if the current hour is 9 AM before executing. The task is set to check for updates hourly.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/complete-documentation.mdx#_snippet_29

LANGUAGE: typescript
CODE:
```
runtime.registerTaskWorker({
  name: 'DAILY_SUMMARY',
  validate: async (runtime) => {
    const hour = new Date().getHours();
    return hour === 9; // Run at 9 AM
  },
  execute: async (runtime, options) => {
    // Generate and post daily summary
    await runtime.emitEvent(EventType.POST_GENERATED, {
      runtime,
      worldId: options.worldId,
      // ... other params
    });
  },
});

// Create the task
await runtime.createTask({
  name: 'DAILY_SUMMARY',
  metadata: {
    updateInterval: 1000 * 60 * 60, // Check hourly
  },
  tags: ['queue', 'repeat'],
});
```

----------------------------------------

TITLE: Set Up Discord Bot Test Suite
DESCRIPTION: Shows how to initialize and configure a Discord bot test suite using ElizaOS's testing utilities. It involves creating a test suite instance, configuring test channel IDs, and running the tests.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/discord/examples.mdx#_snippet_14

LANGUAGE: typescript
CODE:
```
import { DiscordTestSuite } from '@elizaos/plugin-discord';

const testSuite = new DiscordTestSuite();

// Configure test environment
testSuite.configure({
  testChannelId: process.env.DISCORD_TEST_CHANNEL_ID,
  testVoiceChannelId: process.env.DISCORD_TEST_VOICE_CHANNEL_ID
});

// Run tests
await testSuite.run();
```

----------------------------------------

TITLE: Complete Handler Migration Example
DESCRIPTION: Demonstrates the updated handler pattern for ElizaOS, including state management, prompt composition, model usage, result parsing, validation, and action execution. It highlights the use of `IAgentRuntime`, `Memory`, `State`, and `elizaLogger`.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/migration-guide.mdx#_snippet_18

LANGUAGE: typescript
CODE:
```
handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
) => {
    elizaLogger.log("Starting YOUR_ACTION handler...");

    // 1. Initialize or update state
    let currentState = state;
    if (!currentState) {
        currentState = await runtime.composeState(message);
    } else {
        currentState = await runtime.composeState(message, [
            "RECENT_MESSAGES",
        ]);
    }

    // 2. Compose prompt from state
    const prompt = composePromptFromState({
        state: currentState,
        template: yourTemplate,
    });

    // 3. Generate content using the model
    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
        stopSequences: [],
    });

    // 4. Parse the result
    const content = parseKeyValueXml(result);

    elizaLogger.debug("Parsed content:", content);

    // 5. Validate content
    if (!isYourActionContent(runtime, content)) {
        elizaLogger.error("Invalid content for YOUR_ACTION action.");
        callback?.({
            text: "Unable to process request. Invalid content provided.",
            content: { error: "Invalid content" },
        });
        return false;
    }

    // 6. Execute your action logic
    try {
        // Your action implementation here
        const result = await yourActionLogic(runtime, content);

        callback?.({
            text: `Success message with ${content.name}`,
            content: result,
        });
        return true;
    } catch (error) {
        elizaLogger.error("Action failed:", error);
        callback?.({
            text: "Action failed. Please try again.",
            content: { error: error.message },
        });
        return false;
    }
},
```

----------------------------------------

TITLE: Solana Plugin Usage: Swap Operations
DESCRIPTION: Shows examples of using the Solana plugin for token swaps via natural language commands. The agent can execute swaps between different tokens, specify amounts, and handle slippage tolerance.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/solana/examples.mdx#_snippet_3

LANGUAGE: text
CODE:
```
User: Swap 10 SOL for USDC
Agent: I'll swap 10 SOL for USDC using Jupiter.

User: Exchange all my BONK for SOL
Agent: Swapping all your BONK tokens for SOL.

User: Trade 100 USDC for JTO with 2% slippage
Agent: Swapping 100 USDC for JTO with 2% slippage tolerance.
```

----------------------------------------

TITLE: Create Git tag and push
DESCRIPTION: This bash script configures Git user information and creates a Git tag for the current version. It then pushes the newly created tag to the origin repository.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/completion-requirements.mdx#_snippet_8

LANGUAGE: bash
CODE:
```
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git tag -a "v${{ needs.verify_version.outputs.version }}" -m "Release v${{ needs.verify_version.outputs.version }}"
git push origin "v${{ needs.verify_version.outputs.version }}"

```

----------------------------------------

TITLE: ElizaOS Create in Specific Directory
DESCRIPTION: Illustrates how to create new projects, plugins, or agents within a specific directory by navigating to that directory before running the `elizaos create` command.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/create.mdx#_snippet_4

LANGUAGE: bash
CODE:
```
# Navigate to the desired directory
cd ./my-projects

# Create a new agent in the current directory
elizaos create new-agent

# Navigate to plugins directory and create a plugin
cd ./plugins
elizaos create -t plugin my-plugin
```

----------------------------------------

TITLE: Build and Verify
DESCRIPTION: Commands to build the project and perform type checking using Bun, essential steps before submitting changes.

SOURCE: https://github.com/elizaos/docs/blob/main/development.mdx#_snippet_14

LANGUAGE: bash
CODE:
```
bun run build
bun run typecheck
```

----------------------------------------

TITLE: GitHub Actions Workflow for Telegram Plugin Tests
DESCRIPTION: A GitHub Actions workflow that triggers on push or pull request events for the Telegram plugin. It sets up Node.js, installs dependencies, runs unit and integration tests, and uploads code coverage.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/telegram/testing-guide.mdx#_snippet_25

LANGUAGE: yaml
CODE:
```
name: Telegram Plugin Tests

on:
  push:
    paths:
      - 'packages/plugin-telegram/**'
  pull_request:
    paths:
      - 'packages/plugin-telegram/**'

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 20
        
    - name: Install dependencies
      run: bun install
      
    - name: Run unit tests
      run: bun test packages/plugin-telegram --run
      env:
        TELEGRAM_TEST_TOKEN: ${{ secrets.TELEGRAM_TEST_TOKEN }}
        TELEGRAM_TEST_CHAT_ID: ${{ secrets.TELEGRAM_TEST_CHAT_ID }}
        
    - name: Run integration tests
      if: github.event_name == 'push'
      run: bun test:integration packages/plugin-telegram
      env:
        TELEGRAM_TEST_TOKEN: ${{ secrets.TELEGRAM_TEST_TOKEN }}
        TELEGRAM_TEST_CHAT_ID: ${{ secrets.TELEGRAM_TEST_CHAT_ID }}
        
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage/coverage-final.json
        flags: telegram-plugin
```

----------------------------------------

TITLE: Example elizaOS Environment Output
DESCRIPTION: This snippet displays an example output from the `elizaos env list` command, showing both system information and local environment variables, including masked sensitive data.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/env.mdx#_snippet_5

LANGUAGE: text
CODE:
```
System Information:
  Platform: darwin (24.3.0)
  Architecture: arm64
  CLI Version: 1.0.0
  Package Manager: bun v1.2.5

Local Environment Variables:
Path: /current/directory/.env
  OPENAI_API_KEY: your-key...5678
  MODEL_PROVIDER: openai
  PORT: 8080
  LOG_LEVEL: debug
```

----------------------------------------

TITLE: Creating a System Status Provider
DESCRIPTION: Implements a 'SYSTEM_STATUS' provider that gathers and formats system metrics like CPU usage, memory, and uptime. This provider can be integrated into an AgentRuntime to supply system information.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_4

LANGUAGE: typescript
CODE:
```
import { Provider } from '@elizaos/core';

const systemStatusProvider: Provider = {
  name: 'SYSTEM_STATUS',
  description: 'Provides current system status and metrics',
  position: 50,

  get: async (runtime, message) => {
    // Gather system metrics
    const metrics = await gatherSystemMetrics();

    // Format for prompt
    const statusText = `
# System Status
- CPU Usage: ${metrics.cpu}%
- Memory: ${metrics.memory}% used
- Active Users: ${metrics.activeUsers}
- Response Time: ${metrics.avgResponseTime}ms
- Uptime: ${metrics.uptime}
    `.trim();

    return {
      data: metrics,
      values: {
        cpuUsage: metrics.cpu,
        memoryUsage: metrics.memory,
        isHealthy: metrics.cpu < 80 && metrics.memory < 90,
      },
      text: statusText,
    };
  },
};

// Use in agent
const monitoringAgent = new AgentRuntime({
  character: {
    name: 'SystemMonitor',
    // ...
  },
  plugins: [
    bootstrapPlugin,
    {
      name: 'monitoring',
      providers: [systemStatusProvider],
    },
  ],
});
```

----------------------------------------

TITLE: Platform Plugin Key Patterns
DESCRIPTION: Outlines the key patterns for implementing platform plugins, focusing on entity mapping, message conversion, event handling, and rate limiting.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_57

LANGUAGE: typescript
CODE:
```
// Key patterns for platform plugins:
// 1. Entity mapping (server → world, channel → room, user → entity)
// 2. Message conversion
// 3. Event handling
// 4. Rate limiting

export class PlatformService extends Service {
  private client: PlatformClient;
  private messageManager: MessageManager;

  async handleIncomingMessage(platformMessage: any) {
    // 1. Sync entities
    const { worldId, roomId, userId } = await this.syncEntities(platformMessage);

    // 2. Convert to Memory
    const memory = await this.messageManager.convertToMemory(platformMessage, roomId, userId);

    // 3. Process through runtime
    await this.runtime.processMemory(memory);

    // 4. Emit events
    await this.runtime.emit(EventType.MESSAGE_RECEIVED, memory);
  }
}
```

----------------------------------------

TITLE: Bun Configuration (bunfig.toml)
DESCRIPTION: Configuration file for Bun, the JavaScript runtime, specifying options like registry settings and exact version saving.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_53

LANGUAGE: toml
CODE:
```
# bunfig.toml
[install]
# Optional: Configure registry
# registry = "https://registry.npmjs.org"

# Optional: Save exact versions
save-exact = true

# Optional: Configure trusted dependencies for postinstall scripts
# trustedDependencies = ["package-name"]
```

----------------------------------------

TITLE: OpenRouter + Google Setup
DESCRIPTION: Configuration for using OpenRouter for text generation and Google for embeddings, including character plugin setup and .env variables.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/contextual-embeddings.mdx#_snippet_3

LANGUAGE: typescript
CODE:
```
export const character = {
  name: 'MyAgent',
  plugins: [
    '@elizaos/plugin-openrouter',  // For text generation
    '@elizaos/plugin-google',       // For embeddings
    '@elizaos/plugin-knowledge',    // Knowledge plugin
  ],
};
```

LANGUAGE: env
CODE:
```
# Enable contextual embeddings
CTX_KNOWLEDGE_ENABLED=true

# Text generation (for context enrichment)
TEXT_PROVIDER=openrouter
TEXT_MODEL=anthropic/claude-3-haiku
OPENROUTER_API_KEY=your-openrouter-key

# Embeddings (Google will be used automatically)
GOOGLE_API_KEY=your-google-key
```

----------------------------------------

TITLE: Twitter Service Initialization
DESCRIPTION: Manages multiple Twitter client instances for elizaOS agents. It handles the creation, initialization, and starting of Twitter client services based on agent runtime and configuration. The service also emits a 'serverJoined' event upon successful client creation.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/complete-documentation.mdx#_snippet_0

LANGUAGE: typescript
CODE:
```
export class TwitterService extends Service {
  static serviceType: string = TWITTER_SERVICE_NAME;
  private static instance: TwitterService;
  private clients: Map<string, TwitterClientInstance> = new Map();
  
  async createClient(
    runtime: IAgentRuntime,
    clientId: string,
    state: any
  ): Promise<TwitterClientInstance> {
    // Create and initialize client
    const client = new TwitterClientInstance(runtime, state);
    await client.client.init();
    
    // Start services based on configuration
    if (client.post) client.post.start();
    if (client.interaction) client.interaction.start();
    if (client.timeline) client.timeline.start();
    
    // Store client
    this.clients.set(clientKey, client);
    
    // Emit WORLD_JOINED event
    await this.emitServerJoinedEvent(runtime, client);
    
    return client;
  }
}
```

----------------------------------------

TITLE: Agent Knowledge Search Example
DESCRIPTION: Demonstrates how an ElizaOS agent automatically searches its knowledge base to answer user questions. It shows the process of identifying relevant chunks from documents based on the user's query.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/examples.mdx#_snippet_5

LANGUAGE: typescript
CODE:
```
// User asks: "What's your refund policy?"
// Agent automatically:
// 1. Searches knowledge base for "refund policy"
// 2. Finds relevant chunks from refund-policy.pdf
// 3. Uses this information to answer

// User asks: "How do I install the software?"
// Agent automatically:
// 1. Searches for "install software"
// 2. Finds installation-guide.pdf content
// 3. Provides step-by-step instructions
```

----------------------------------------

TITLE: Reference Plugin's Own Tables for Foreign Keys
DESCRIPTION: Shows how to define a foreign key relationship between tables within the same plugin. This example creates a `plugin_posts` table that references the `pluginUsersTable` defined earlier, establishing an author-post relationship.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/sql/plugin-tables.mdx#_snippet_4

LANGUAGE: typescript
CODE:
```
export const pluginPostsTable = pgTable('plugin_posts', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Reference user in same plugin
  authorId: uuid('author_id')
    .notNull()
    .references(() => pluginUsersTable.id, { onDelete: 'cascade' }),

  title: text('title').notNull(),
  content: text('content').notNull(),
});
```

----------------------------------------

TITLE: Jupiter Swap Integration
DESCRIPTION: Provides functions to get swap quotes and execute swaps using the Jupiter API. It handles fetching quotes based on input/output tokens, amounts, and slippage, then deserializes and signs the transaction for execution.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/solana/complete-documentation.mdx#_snippet_11

LANGUAGE: typescript
CODE:
```
interface JupiterSwapParams {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: number;
  slippageBps: number;
  userPublicKey: PublicKey;
}

async function getJupiterQuote(params: JupiterSwapParams): Promise<QuoteResponse> {
  const url = new URL('https://quote-api.jup.ag/v6/quote');
  url.searchParams.append('inputMint', params.inputMint.toBase58());
  url.searchParams.append('outputMint', params.outputMint.toBase58());
  url.searchParams.append('amount', params.amount.toString());
  url.searchParams.append('slippageBps', params.slippageBps.toString());
  url.searchParams.append('onlyDirectRoutes', 'false');
  url.searchParams.append('asLegacyTransaction', 'false');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Jupiter quote failed: ${response.statusText}`);
  }

  return response.json();
}

async function executeJupiterSwap(
  connection: Connection,
  wallet: Wallet,
  quote: QuoteResponse
): Promise<{ signature: string }> {
  // Get serialized transaction from Jupiter
  const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: 'auto'
    })
  });

  const { swapTransaction } = await swapResponse.json();
  
  // Deserialize and sign
  const transaction = VersionedTransaction.deserialize(
    Buffer.from(swapTransaction, 'base64')
  );
  transaction.sign([wallet.payer]);

  // Send with confirmation
  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
    maxRetries: 3
  });

  // Wait for confirmation
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash: transaction.message.recentBlockhash,
    lastValidBlockHeight: transaction.message.lastValidBlockHeight
  });

  if (confirmation.value.err) {
    throw new Error(`Swap failed: ${confirmation.value.err}`);
  }

  return { signature };
}
```

----------------------------------------

TITLE: Twitter OAuth 1.0a Credentials Setup
DESCRIPTION: Illustrates the correct way to set up OAuth 1.0a credentials for Twitter API access, emphasizing the use of API Key, API Secret Key, Access Token, and Access Token Secret. It also warns against using OAuth 2.0 credentials.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/complete-documentation.mdx#_snippet_7

LANGUAGE: typescript
CODE:
```
// Correct credentials (OAuth 1.0a)
const credentials = {
  // From "Consumer Keys" section
  apiKey: process.env.TWITTER_API_KEY,              // Consumer API Key
  apiSecretKey: process.env.TWITTER_API_SECRET_KEY, // Consumer API Secret
  
  // From "Authentication Tokens" section
  accessToken: process.env.TWITTER_ACCESS_TOKEN,         // Access Token
  accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET // Access Token Secret
};

// WRONG - Don't use these (OAuth 2.0)
// ❌ Client ID
// ❌ Client Secret  
// ❌ Bearer Token
```

----------------------------------------

TITLE: Progressive Disclosure Pattern Example
DESCRIPTION: Demonstrates the progressive disclosure pattern by providing explanations tailored to the user's level (beginner or advanced). It includes conditional logic for different user levels and shows how to send text and attachments.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_17

LANGUAGE: typescript
CODE:
```
const teachAction: Action = {
  name: 'TEACH_CONCEPT',

  handler: async (runtime, message, state, options, callback) => {
    const concept = extractConcept(message.content.text);
    const userLevel = await getUserLevel(runtime, message.entityId);

    if (userLevel === 'beginner') {
      // Start with simple explanation
      await callback({
        text: `Let's start with the basics of ${concept}...`,
        actions: ['TEACH_INTRO'],
      });

      // Add an analogy
      await callback({
        text: `Think of it like ${getAnalogy(concept)}`,
        actions: ['TEACH_ANALOGY'],
      });

      // Check understanding
      await callback({
        text: 'Does this make sense so far? Would you like me to explain differently?',
        actions: ['CHECK_UNDERSTANDING'],
      });
    } else {
      // Advanced explanation
      await callback({
        text: `${concept} involves several key principles...`,
        actions: ['TEACH_ADVANCED'],
        attachments: [
          {
            url: `/diagrams/${concept}.png`,
            contentType: 'image/png',
          },
        ],
      });
    }

    return true;
  },
};

```

----------------------------------------

TITLE: Add Action to Plugin
DESCRIPTION: Demonstrates how to add a custom action to an elizaOS plugin. It includes defining the action's `name`, `description`, a `validate` function to check if the action can be performed, and a `handler` function to execute the action's logic. It also shows how to provide usage `examples`.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-publishing-guide.mdx#_snippet_2

LANGUAGE: typescript
CODE:
```
import { Action, IAgentRuntime, Memory, HandlerCallback } from "@elizaos/core";

const greetAction: Action = {
    name: "GREET_USER",
    description: "Greets the user with a personalized message",

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Validate the action can be performed
        return message.content.text.toLowerCase().includes("hello");
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: any,
        options: any,
        callback: HandlerCallback
    ) => {
        // Perform the action
        const response = `Hello! Welcome to ${runtime.character.name}!`;
        callback({
            text: response,
            action: "GREET_USER"
        });
    },

    examples: [
        [
            {
                user: "user123",
                content: { text: "Hello there!" }
            },
            {
                user: "assistant",
                content: {
                    text: "Hello! Welcome to Eliza!",
                    action: "GREET_USER"
                }
            }
        ]
    ]
};
```

----------------------------------------

TITLE: Troubleshoot Configuration
DESCRIPTION: Commands to assist with configuration problems and check environment variable setup for ElizaOS development.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/dev.mdx#_snippet_19

LANGUAGE: bash
CODE:
```
# If having configuration problems
elizaos dev --configure

# Check environment setup
elizaos env list
```

----------------------------------------

TITLE: Full Plugin Project Structure
DESCRIPTION: Details the project structure for a 'Full Plugin' which includes frontend capabilities. This structure expands upon the 'Quick Plugin' by adding directories for frontend code, static assets, and frontend build configurations like Vite.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_2

LANGUAGE: bash
CODE:
```
plugin-my-plugin/
├── src/
│   ├── index.ts           # Plugin manifest with routes
│   ├── actions/
│   ├── providers/
│   ├── types/
│   └── frontend/          # React frontend
│       ├── App.tsx
│       ├── main.tsx
│       └── components/
├── public/                # Static assets
├── index.html             # Frontend entry
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # Tailwind setup
└── [other config files]
```

----------------------------------------

TITLE: Discord Integration with ElizaOS
DESCRIPTION: Demonstrates how to integrate ElizaOS with Discord, including setting up the AgentRuntime with a Discord client and handling Discord-specific events like messages within threads.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_10

LANGUAGE: typescript
CODE:
```
import { DiscordClient } from '@elizaos/discord';

const discordBot = new AgentRuntime({
  character: {
    /* ... */
  },
  plugins: [bootstrapPlugin],
  clients: [new DiscordClient()],
});

// Discord-specific room handling
discordBot.on(EventType.MESSAGE_RECEIVED, async (payload) => {
  const room = await payload.runtime.getRoom(payload.message.roomId);

  // Handle Discord-specific features
  if (room?.metadata?.discordType === 'thread') {
    // Special handling for threads
  }
});
```

----------------------------------------

TITLE: Understanding the Callback Mechanism
DESCRIPTION: Illustrates the callback mechanism in ElizaOS actions, showing how to send messages back to the user in stages. This includes acknowledging a request, delivering information, and offering follow-up interactions.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_13

LANGUAGE: typescript
CODE:
```
const explainAction: Action = {
  name: 'EXPLAIN',
  description: 'Explains a concept in detail',

  handler: async (runtime, message, state, options, callback) => {
    // Extract topic from message
    const topic = extractTopic(message.content.text);

    // First message - acknowledge the request
    await callback({
      text: `Let me explain ${topic} for you...`,
      actions: ['ACKNOWLEDGE'],
    });

    // Fetch explanation (simulating delay)
    const explanation = await fetchExplanation(topic);

    // Second message - deliver the explanation
    await callback({
      text: explanation,
      actions: ['EXPLAIN'],
      thought: `Explained ${topic} to the user`,
    });

    // Third message - offer follow-up
    await callback({
      text: 'Would you like me to explain anything else about this topic?',
      actions: ['FOLLOW_UP'],
    });

    return true;
  },
};
```

----------------------------------------

TITLE: Development Mode with Forced Reconfiguration
DESCRIPTION: Illustrates forcing a reconfiguration of services and AI models when starting the development server.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/dev.mdx#_snippet_3

LANGUAGE: bash
CODE:
```
# Force reconfiguration of services
elizaos dev --configure
```

----------------------------------------

TITLE: Link Plugin in Project Directory
DESCRIPTION: Command to link an external plugin into a project directory using `bun link`.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_8

LANGUAGE: bash
CODE:
```
# In your project directory
cd packages/project-starter  # or wherever your agent project is
bun link @yourorg/plugin-myplugin
```

----------------------------------------

TITLE: Simple Telegram Message Bot
DESCRIPTION: Sets up a basic Telegram bot that responds to user messages. It requires the @elizaos/core, @elizaos/plugin-telegram, and @elizaos/plugin-bootstrap packages. The bot is configured with a name, description, plugins, client, and settings including the Telegram bot token. It also includes message examples to define its personality.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/telegram/examples.mdx#_snippet_0

LANGUAGE: typescript
CODE:
```
import {
  AgentRuntime
} from '@elizaos/core';
import { telegramPlugin } from '@elizaos/plugin-telegram';
import { bootstrapPlugin } from '@elizaos/plugin-bootstrap';

const character = {
  name: "SimpleTelegramBot",
  description: "A simple Telegram bot",
  plugins: [bootstrapPlugin, telegramPlugin],
  clients: ["telegram"],
  settings: {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN
  },
  // Message examples for the bot's personality
  messageExamples: [
    {
      user: "user",
      content: { text: "Hello!" },
      response: { text: "Hello! How can I help you today?" }
    },
    {
      user: "user",
      content: { text: "What's the weather?" },
      response: { text: "I'm sorry, I don't have access to weather data. Is there something else I can help you with?" }
    }
  ]
};

// Create and start the runtime
const runtime = new AgentRuntime({ character });
await runtime.start();

console.log('Telegram bot is running!');
```

----------------------------------------

TITLE: GitHub Actions Workflow for Twitter Plugin
DESCRIPTION: This workflow automates the testing of the Twitter plugin. It triggers on pushes or pull requests that modify files within the plugin's directory. The workflow checks out the code, sets up Node.js, installs dependencies using 'bun', runs unit tests, and conditionally runs integration tests on the main branch. It also uploads code coverage to Codecov.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/twitter/testing-guide.mdx#_snippet_17

LANGUAGE: yaml
CODE:
```
name: Twitter Plugin Tests

on:
  push:
    paths:
      - 'packages/plugin-twitter/**'
  pull_request:
    paths:
      - 'packages/plugin-twitter/**'

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 20
        
    - name: Install dependencies
      run: bun install
      
    - name: Run unit tests
      run: bun test packages/plugin-twitter
      env:
        TWITTER_DRY_RUN: true
        
    - name: Run integration tests
      if: github.event_name == 'push' && github.ref == 'refs/heads/main'
      run: bun test:integration packages/plugin-twitter
      env:
        TWITTER_API_KEY: ${{ secrets.TEST_TWITTER_API_KEY }}
        TWITTER_API_SECRET_KEY: ${{ secrets.TEST_TWITTER_API_SECRET }}
        TWITTER_ACCESS_TOKEN: ${{ secrets.TEST_TWITTER_ACCESS_TOKEN }}
        TWITTER_ACCESS_TOKEN_SECRET: ${{ secrets.TEST_TWITTER_TOKEN_SECRET }}
        TWITTER_DRY_RUN: true
        
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage/coverage-final.json
        flags: twitter-plugin
```

----------------------------------------

TITLE: Setup Action Test Helper
DESCRIPTION: The `setupActionTest` function is a helper for setting up test environments for agent actions. It creates mock runtime, message, and state objects, optionally allowing overrides for each. It also returns a mock callback function, simplifying the process of testing action execution.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/testing-guide.mdx#_snippet_6

LANGUAGE: typescript
CODE:
```
// Setup Action Test Helper
export function setupActionTest(
  options: {
    runtimeOverrides?: Partial<MockRuntime>;
    messageOverrides?: Partial<Memory>;
    stateOverrides?: Partial<State>;
  } = {}
) {
  const mockRuntime = createMockRuntime(options.runtimeOverrides);
  const mockMessage = createMockMemory(options.messageOverrides);
  const mockState = createMockState(options.stateOverrides);
  const callbackFn = mock().mockResolvedValue([]);

  return {
    mockRuntime,
    mockMessage,
    mockState,
    callbackFn,
  };
}
```

----------------------------------------

TITLE: TelegramService Class Definition
DESCRIPTION: Defines the main `TelegramService` class for Telegram integration. It handles bot initialization, middleware setup, event registration, and chat management. It extends the base `Service` class and utilizes the Telegraf library.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/platform/telegram/complete-documentation.mdx#_snippet_0

LANGUAGE: typescript
CODE:
```
export class TelegramService extends Service {
  static serviceType = TELEGRAM_SERVICE_NAME;
  private bot: Telegraf<Context> | null;
  public messageManager: MessageManager | null;
  private knownChats: Map<string, any> = new Map();
  private syncedEntityIds: Set<string> = new Set<string>();
  
  constructor(runtime: IAgentRuntime) {
    super(runtime);
    // Initialize bot with token
    // Set up middleware
    // Configure event handlers
  }
}
```

----------------------------------------

TITLE: Custom Document Folder Configuration
DESCRIPTION: Explains how to configure a custom path for storing documents using the KNOWLEDGE_PATH environment variable in the .env file.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/quick-start.mdx#_snippet_5

LANGUAGE: env
CODE:
```
KNOWLEDGE_PATH=/path/to/your/documents
```

----------------------------------------

TITLE: XML Parsing (v1)
DESCRIPTION: Illustrates the v1 method for parsing XML key-value pairs from text responses using `@elizaos/core`.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/prompt-and-generation-guide.mdx#_snippet_10

LANGUAGE: typescript
CODE:
```
// v1: Parse XML key-value pairs
import { parseKeyValueXml } from '@elizaos/core';

const parsedContent = parseKeyValueXml(response);
if (parsedContent && parsedContent.address) {
  // Use the address
}
```

----------------------------------------

TITLE: Dynamic Templates
DESCRIPTION: Demonstrates how dynamic templates are composed for generating prompts in both v0 and v1 of ElizaOS.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/prompt-and-generation-guide.mdx#_snippet_3

LANGUAGE: typescript
CODE:
```
// v0
const template = ({ state }) => {
  return state.isUrgent ? 'URGENT: {{message}}' : 'Info: {{message}}';
};

const prompt = composeContext({ state, template });

// v1 - Same pattern works
const prompt = composePrompt({ state, template });
```

----------------------------------------

TITLE: Solana Plugin Common Patterns: All Balance Swaps
DESCRIPTION: Shows how the plugin handles requests to swap the entire balance of a specific token, automatically calculating the maximum available amount for the swap.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/solana/examples.mdx#_snippet_8

LANGUAGE: text
CODE:
```
User: Swap all my BONK for USDC
Agent: [Calculates max balance and executes swap]
```

----------------------------------------

TITLE: React Hook for Eliza Session Management
DESCRIPTION: A custom React hook `useElizaSession` to manage messaging sessions with Eliza. It handles starting sessions, sending messages, and managing the message list and loading state. It depends on React's `useState` and `useCallback` hooks.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/sessions-api-guide.mdx#_snippet_11

LANGUAGE: javascript
CODE:
```
import { useState, useCallback } from 'react';

function useElizaSession(agentId, userId) {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const startSession = useCallback(async () => {
    const response = await fetch('/api/messaging/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, userId })
    });
    const data = await response.json();
    setSessionId(data.sessionId);
    return data.sessionId;
  }, [agentId, userId]);

  const sendMessage = useCallback(async (content) => {
    if (!sessionId) await startSession();
    
    setLoading(true);
    try {
      const response = await fetch(
        `/api/messaging/sessions/${sessionId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        }
      );
      const message = await response.json();
      setMessages(prev => [...prev, message]);
      return message;
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  return { sessionId, messages, sendMessage, loading };
}
```

----------------------------------------

TITLE: Using the ElizaOS Knowledge Service
DESCRIPTION: Demonstrates programmatic usage of the ElizaOS knowledge service, including adding knowledge and searching for existing knowledge.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/complete-documentation.mdx#_snippet_28

LANGUAGE: typescript
CODE:
```
// Get the knowledge service
const knowledgeService = runtime.getService<KnowledgeService>('knowledge');

// Add knowledge programmatically
const result = await knowledgeService.addKnowledge({
  content: documentContent, // Base64 or plain text
  originalFilename: 'guide.pdf',
  contentType: 'application/pdf',
  worldId: runtime.agentId,
  roomId: message.roomId,
  entityId: message.entityId
});

// Search for knowledge
const results = await knowledgeService.getKnowledge(message, {
  roomId: message.roomId,
  worldId: runtime.agentId
});
```

----------------------------------------

TITLE: Migration Example: Accessing Charity Address
DESCRIPTION: Provides a practical example of migrating a function that accesses charity addresses. The v0 version used the global `settings` object, while the v1 version requires passing the `runtime` object to utilize `runtime.getSetting()`.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/advanced-migration-guide.mdx#_snippet_10

LANGUAGE: typescript
CODE:
```
// v0: utils.ts using global settings
import { settings } from '@elizaos/core';

export function getCharityAddress(network: string): string | null {
  const networkKey = `CHARITY_ADDRESS_${network.toUpperCase()}`;
  const charityAddress = settings[networkKey];
  return charityAddress;
}

// v1: Pass runtime to access settings
export function getCharityAddress(runtime: IAgentRuntime, network: string): string | null {
  const networkKey = `CHARITY_ADDRESS_${network.toUpperCase()}`;
  const charityAddress = runtime.getSetting(networkKey);
  return charityAddress;
}
```

----------------------------------------

TITLE: Add Knowledge Plugin to Agent
DESCRIPTION: Demonstrates how to add the '@elizaos/plugin-knowledge' to your agent's plugin list in the character configuration file.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/quick-start.mdx#_snippet_0

LANGUAGE: typescript
CODE:
```
export const character = {
  name: 'MyAgent',
  plugins: [
    '@elizaos/plugin-openai', // â20ac; Make sure you have this
    '@elizaos/plugin-knowledge', // â20ac; Add this line
    // ... your other plugins
  ],
  // ... rest of your character config
};
```

----------------------------------------

TITLE: State Filtering Pattern
DESCRIPTION: Examples of using the `composeState` method for efficient state management. The first example shows an initial load with essential keys, while the second demonstrates updating only specific parts of the state.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/state-and-providers-guide.mdx#_snippet_18

LANGUAGE: typescript
CODE:
```
// Initial load - get essential state
const initialState = await runtime.composeState(
  message,
  ['agentName', 'bio', 'recentMessages', 'actions', 'providers'],
  true
);

// Process message...

// Update only what changed
const updatedState = await runtime.composeState(message, [
  'RECENT_MESSAGES',
  'goals',
  'attachments',
]);
```

----------------------------------------

TITLE: Troubleshooting Environment Loading
DESCRIPTION: Guides users on verifying the .env file content and checking for syntax errors using ElizaOS CLI commands.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/env.mdx#_snippet_10

LANGUAGE: bash
CODE:
```
# Verify environment file exists and has content
cat .env

# Check for syntax errors in .env file
elizaos env list --local
```

----------------------------------------

TITLE: Complex Action Example (Reply Action)
DESCRIPTION: Provides an example of a more complex action, 'REPLY', which is used to respond to messages. It demonstrates composing state with providers, using a language model to generate a response, and handling the response content.

SOURCE: https://github.com/elizaos/docs/blob/main/deep-dive/real-world-patterns.mdx#_snippet_4

LANGUAGE: typescript
CODE:
```
export const replyAction = {
  name: 'REPLY',
  similes: ['GREET', 'REPLY_TO_MESSAGE', 'SEND_REPLY', 'RESPOND'],
  description: 'Replies to the current conversation',
  
  validate: async (runtime) => true,
  
  handler: async (runtime, message, state, options, callback, responses) => {
    // Compose state with providers
    state = await runtime.composeState(message, ['RECENT_MESSAGES']);
    
    // Generate response using LLM
    const prompt = composePromptFromState({ state, template: replyTemplate });
    const response = await runtime.useModel(ModelType.OBJECT_LARGE, { prompt });
    
    const responseContent = {
      thought: response.thought,
      text: response.message || '',
      actions: ['REPLY'],
    };
    
    await callback(responseContent);
    return true;
  }
};
```

----------------------------------------

TITLE: ElizaOS Plugin Implementation
DESCRIPTION: Core implementation of an ElizaOS plugin, defining its name, description, services, actions, providers, and initialization logic.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_54

LANGUAGE: typescript
CODE:
```
// src/index.ts
import type { Plugin } from '@elizaos/core';
import { MyService } from './service';
import { myAction } from './actions/myAction';
import { myProvider } from './providers/myProvider';

export const myPlugin: Plugin = {
  name: 'myplugin',
      description: 'My custom plugin for elizaOS',
  services: [MyService], // Pass the class constructor, not an instance
  actions: [myAction],
  providers: [myProvider],
  routes: myPluginRoutes, // Optional: HTTP endpoints

  init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
    // Optional initialization logic
    logger.info('MyPlugin initialized');
  },
};

export default myPlugin;
```

----------------------------------------

TITLE: OpenRouter + OpenAI Setup
DESCRIPTION: Configuration for using OpenRouter for text generation and OpenAI for embeddings, including character plugin setup and .env variables.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/knowledge/contextual-embeddings.mdx#_snippet_2

LANGUAGE: typescript
CODE:
```
export const character = {
  name: 'MyAgent',
  plugins: [
    '@elizaos/plugin-openrouter',  // For text generation
    '@elizaos/plugin-openai',       // For embeddings
    '@elizaos/plugin-knowledge',    // Knowledge plugin
  ],
};
```

LANGUAGE: env
CODE:
```
# Enable contextual embeddings
CTX_KNOWLEDGE_ENABLED=true

# Text generation (for context enrichment)
TEXT_PROVIDER=openrouter
TEXT_MODEL=anthropic/claude-3-haiku
OPENROUTER_API_KEY=your-openrouter-key

# Embeddings (automatically used)
OPENAI_API_KEY=your-openai-key
```

----------------------------------------

TITLE: Publish Plugin to npm and Registry
DESCRIPTION: Details the process of publishing an elizaOS plugin, including authentication with npm and setting GitHub tokens. The `elizaos publish` command handles building, publishing to npm, creating a GitHub repository, and submitting a PR to the elizaOS registry.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-publishing-guide.mdx#_snippet_11

LANGUAGE: bash
CODE:
```
# Login to npm
bunx npm login

# Set GitHub token (or you'll be prompted)
export GITHUB_TOKEN=your_pat_here

# Publish to npm and submit to registry
elizaos publish --npm
```

----------------------------------------

TITLE: ElizaOS Update Examples
DESCRIPTION: Demonstrates various ways to use the `elizaos update` command, including basic updates, checking for updates, scoped updates (CLI or packages), and combined options.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/update.mdx#_snippet_1

LANGUAGE: bash
CODE:
```
# Update both CLI and project dependencies (default behavior)
elizaos update

# Check for available updates without applying them
elizaos update --check

# Update only the global CLI
elizaos update --cli

# Update only project packages
elizaos update --packages

# Check only for CLI updates
elizaos update --check --cli

# Update packages without rebuilding afterward
elizaos update --packages --skip-build
```

----------------------------------------

TITLE: Memory Management Examples
DESCRIPTION: Illustrates how to interact with the runtime's database adapter for storing and searching memories.

SOURCE: https://github.com/elizaos/docs/blob/main/deep-dive/runtime.mdx#_snippet_6

LANGUAGE: typescript
CODE:
```
// Store memories
await runtime.databaseAdapter.createMemory({
  type: MemoryType.MESSAGE,
  content: { text: "User message" },
  roomId: message.roomId
});

// Search memories
const memories = await runtime.databaseAdapter.searchMemories({
  query: "previous conversation",
  limit: 10
});
```

----------------------------------------

TITLE: Service Delayed Initialization Pattern
DESCRIPTION: Illustrates a pattern for performing non-critical initialization tasks after the main service startup using setTimeout.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_14

LANGUAGE: typescript
CODE:
```
export class MyService extends Service {
  static serviceType = 'my-service';

  static async start(runtime: IAgentRuntime): Promise<MyService> {
    const service = new MyService(runtime);

    // Immediate initialization
    await service.initialize();

    // Delayed initialization for non-critical tasks
    setTimeout(async () => {
      try {
        await service.loadCachedData();
        await service.syncWithRemote();
        logger.info('MyService: Delayed initialization complete');
      } catch (error) {
        logger.error('MyService: Delayed init failed', error);
        // Don't throw - service is still functional
      }
    }, 5000);

    return service;
  }
}
```

----------------------------------------

TITLE: Governance Flow Examples
DESCRIPTION: Provides examples of how the plugin handles governance-related actions, specifically proposal creation and voting.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/defi/evm/defi-operations-flow.mdx#_snippet_3

LANGUAGE: text
CODE:
```
User: Create a proposal to increase treasury allocation
→ Plugin creates proposal transaction with targets, values, and description

User: Vote FOR on proposal 42
→ Plugin casts vote with correct proposal ID and support value
```

----------------------------------------

TITLE: Define Plugin User Table with Drizzle ORM
DESCRIPTION: Demonstrates how to define a 'plugin_users' table using Drizzle ORM in TypeScript. Includes primary key, unique constraints, JSONB type for flexible data, and default timestamps. This is a core example of defining custom tables for a plugin.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/sql/plugin-tables.mdx#_snippet_0

LANGUAGE: typescript
CODE:
```
import { pgTable, uuid, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const pluginUsersTable = pgTable('plugin_users', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Basic fields
  username: text('username').notNull().unique(),
  email: text('email').notNull(),
  isActive: boolean('is_active').default(true),

  // JSONB for flexible data
  profile: jsonb('profile')
    .$type<{
      avatar?: string;
      bio?: string;
      preferences?: Record<string, any>;
    }>()
    .default(sql`'{}'::jsonb`),

  // Standard timestamps
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});
```

----------------------------------------

TITLE: Provider Migration (0.x to 1.x)
DESCRIPTION: Illustrates the shift from direct state access in 0.x to the new provider pattern in 1.x for accessing data, such as from a database.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/overview.mdx#_snippet_1

LANGUAGE: typescript
CODE:
```
// 0.x - Direct state access
const data = await runtime.databaseAdapter.getData();

// 1.x - Provider pattern
const provider = {
  get: async (runtime, message) => {
    return await runtime.databaseAdapter.getData();
  }
};
```

----------------------------------------

TITLE: Reinstall Dependencies
DESCRIPTION: Installs all project dependencies using Bun. This is a fundamental step for ensuring a clean project state.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/update.mdx#_snippet_6

LANGUAGE: bash
CODE:
```
bun install
```

----------------------------------------

TITLE: Provider Migration Best Practices
DESCRIPTION: Outlines best practices for developing and migrating providers. Recommendations cover descriptive naming, appropriate return types ('text', 'data', 'values'), adding descriptions, using logging for debugging, and graceful error handling.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/migration-guide.mdx#_snippet_29

LANGUAGE: APIDOC
CODE:
```
Provider Best Practices:

1.  **Descriptive Names**: Use clear, descriptive names that indicate the provider's function.
2.  **Return Appropriate Result Types**: Use `text` for human-readable responses, `data` for structured data, and `values` for simple key-value pairs.
3.  **Add Descriptions**: Provide descriptions to help other developers understand the provider's purpose.
4.  **Use Logging**: Include debug logs to aid in troubleshooting.
5.  **Handle Errors Gracefully**: Return meaningful error messages in the `text` field.
```

----------------------------------------

TITLE: Stop Agent Examples
DESCRIPTION: Provides examples for stopping agents using `elizaos agent stop`, covering stopping by name, ID, index, and specifying remote URLs.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/agent.mdx#_snippet_4

LANGUAGE: bash
CODE:
```
# Stop agent by name
elizaos agent stop --name eliza

# Stop agent by ID
elizaos agent stop --name agent_123456

# Stop agent by index
elizaos agent stop --name 0

# Using alias
elizaos agent st --name eliza

# Stop agent on remote runtime
elizaos agent stop --name eliza --remote-url http://server:3000
```

----------------------------------------

TITLE: Plugin Initialization
DESCRIPTION: Demonstrates how to initialize a plugin with configuration and validation logic. It shows setting up environment variables based on validated configuration. Dependencies include a schema validation library.

SOURCE: https://github.com/elizaos/docs/blob/main/deep-dive/real-world-patterns.mdx#_snippet_11

LANGUAGE: typescript
CODE:
```
const myPlugin: Plugin = {
  name: 'my-plugin',
  config: {
    EXAMPLE_VARIABLE: process.env.EXAMPLE_VARIABLE,
  },
  async init(config: Record<string, string>) {
    // Validate configuration
    const validatedConfig = await configSchema.parseAsync(config);
    
    // Set environment variables
    for (const [key, value] of Object.entries(validatedConfig)) {
      if (value) process.env[key] = value;
    }
  },
};
```

----------------------------------------

TITLE: Plugin Dependencies and Priority
DESCRIPTION: Demonstrates how to declare required and optional dependencies for a plugin, and how to set a loading priority to control execution order.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_55

LANGUAGE: typescript
CODE:
```
export const myPlugin: Plugin = {
  name: 'my-plugin',
  description: 'Plugin that depends on other plugins',

  // Required dependencies - plugin won't load without these
  dependencies: ['plugin-sql', 'plugin-bootstrap'],

  // Optional test dependencies
  testDependencies: ['plugin-test-utils'],

  // Higher priority = loads earlier (default: 0)
  priority: 100,

  async init(config, runtime) {
    // Dependencies are guaranteed to be loaded
    const sqlService = runtime.getService('sql');
    if (!sqlService) {
      throw new Error('SQL service not found despite dependency');
    }
  },
};
```

----------------------------------------

TITLE: Build Configuration (tsup.config.ts)
DESCRIPTION: Defines the build process using tsup, specifying entry points, output formats, and enabling TypeScript declaration files and source maps.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-developer-guide.mdx#_snippet_52

LANGUAGE: typescript
CODE:
```
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['@elizaos/core'],
});
```

----------------------------------------

TITLE: Minimal Socket.IO Client Implementation
DESCRIPTION: This snippet demonstrates how to establish a connection to a Socket.IO server, join a specific room, listen for broadcast messages, and send messages. It includes configurations for compatibility with older Socket.IO versions and provides helper functions for message formatting and UUID generation. Error handling for connection issues and disconnects is also included.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/socket-io-integration-guide.mdx#_snippet_2

LANGUAGE: javascript
CODE:
```
const SOCKET_URL = 'http://localhost:3000';

// 1. Connect to Socket.IO
const socket = io(SOCKET_URL, {
  // For v1.3.0 compatibility
  'force new connection': true,
  'reconnection': true,
  'reconnectionDelay': 1000,
  'reconnectionAttempts': 5,
  'timeout': 20000,
  'transports': ['polling', 'websocket']
});

// Your IDs (make sure these match exactly)
const entityId = 'your-extension-entity-id';
const roomId = 'your-room-id'; // This should match the agent/channel ID

// 2. CRITICAL: Join the room when connected
socket.on('connect', function() {
  console.log('[SUCCESS] Connected to Eliza, socket ID:', socket.id);
  
  // JOIN THE ROOM - This is required to receive broadcasts!
  socket.emit('message', {
    type: 1, // ROOM_JOINING
    payload: {
      roomId: roomId,
      entityId: entityId
    }
  });
  
  console.log('[SENT] Room join request for room:', roomId);
});

// 3. LISTEN FOR THE CORRECT EVENT: "messageBroadcast" (not "message")
socket.on('messageBroadcast', function(data) {
  console.log('[RECEIVED] Broadcast:', data);
  
  // Check if this message is for your room
  if (data.roomId === roomId || data.channelId === roomId) {
    console.log('[SUCCESS] Message is for our room!');
    console.log('Sender:', data.senderName);
    console.log('Text:', data.text);
    console.log('Full data:', JSON.stringify(data, null, 2));
  } else {
    console.log('[ERROR] Message is for different room:', data.roomId || data.channelId);
  }
});

// 4. Listen for other important events
socket.on('messageComplete', function(data) {
  console.log('[SUCCESS] Message processing complete:', data);
});

socket.on('connection_established', function(data) {
  console.log('[SUCCESS] Connection established:', data);
});

// 5. Send a message (make sure format is exact)
function sendMessageToEliza(text) {
  const messagePayload = {
    type: 2, // SEND_MESSAGE
    payload: {
      senderId: entityId,
      senderName: 'Extension User',
      message: text,
      roomId: roomId,        // Include roomId
      messageId: generateUUID(),
      source: 'extension',
      attachments: [],
      metadata: {}
    }
  };
  
  console.log('[SENDING] Message:', messagePayload);
  socket.emit('message', messagePayload);
}

// Helper function for UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 6. Debug: Log ALL events (remove in production)
const originalEmit = socket.emit;
socket.emit = function() {
  console.log('[EMIT] Event:', arguments[0], arguments[1]);
  return originalEmit.apply(socket, arguments);
};

// For Socket.IO v1.3.0, use this to catch all events:
const onevent = socket.onevent;
socket.onevent = function(packet) {
  console.log('[RECEIVE] Event:', packet.data);
  onevent.call(socket, packet);
};

// Connection error handling
socket.on('connect_error', function(error) {
  console.error('[ERROR] Connection error:', error);
});

socket.on('disconnect', function(reason) {
  console.log('[DISCONNECTED] Reason:', reason);
});

// Test the connection
socket.on('connect', function() {
  // Send a test message after 2 seconds
  setTimeout(function() {
    sendMessageToEliza('Hello from extension!');
  }, 2000);
});
```

----------------------------------------

TITLE: Evaluator with Examples and Fact Extraction
DESCRIPTION: An example of an ElizaOS Evaluator designed for fact extraction, including training examples and logic to add facts to the runtime's fact manager.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/plugins/evaluators.mdx#_snippet_3

LANGUAGE: typescript
CODE:
```
const evaluator: Evaluator = {
  name: 'fact-extractor',
  description: 'Extracts facts from conversations',
  examples: [{
    prompt: 'Extract facts from this conversation',
    messages: [
      { name: 'user', content: { text: 'I live in NYC' } },
      { name: 'agent', content: { text: 'NYC is a great city!' } }
    ],
    outcome: 'User lives in New York City'
  }],
  validate: async () => true,
  handler: async (runtime, message, state) => {
    const facts = await extractFacts(state);
    for (const fact of facts) {
      await runtime.factsManager.addFact(fact);
    }
    return facts;
  }
};
```

----------------------------------------

TITLE: Migrated v1 Action Handler
DESCRIPTION: Demonstrates the v1 approach for handling actions, including state composition, prompt generation using a template, and model interaction for extracting information. It shows how to use `composeState`, `composePromptFromState`, `useModel`, and `parseKeyValueXml`.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/prompt-and-generation-guide.mdx#_snippet_16

LANGUAGE: typescript
CODE:
```
import {
  type Action,
  elizaLogger,
  type IAgentRuntime,
  type Memory,
  type HandlerCallback,
  type State,
  composePromptFromState,
  parseKeyValueXml,
  ModelType,
} from '@elizaos/core';

export const addressTemplate = `From previous sentence extract only the Ethereum address being asked about.
Respond with an XML block containing only the extracted value:

<response>
<address>extracted_ethereum_address_or_null</address>
</response>
`;

handler: async (runtime, _message, state, _options, callback) => {
  // Initialize or update state
  let currentState = state;
  if (!currentState) {
    currentState = await runtime.composeState(_message);
  } else {
    currentState = await runtime.composeState(_message, ['RECENT_MESSAGES']);
  }

  const prompt = composePromptFromState({
    state: currentState,
    template: `${_message.content.text}\n${addressTemplate}`,
  });

  const xmlResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
    prompt,
  });

  const addressRequest = parseKeyValueXml(xmlResponse);
  const address = addressRequest?.address as string;
  // ... rest of handler
};
```

----------------------------------------

TITLE: Knowledge Configuration Example
DESCRIPTION: Illustrates how to configure the 'knowledge' property for an Agent, which can be used to provide the AI with specific facts or information. This example shows a simple array of strings representing facts.

SOURCE: https://github.com/elizaos/docs/blob/main/core-concepts/agents.mdx#_snippet_3

LANGUAGE: typescript
CODE:
```
// String facts
knowledge: ["I am an AI assistant", "I help with coding"]
```

----------------------------------------

TITLE: gitignore Configuration
DESCRIPTION: Minimum configuration for the .gitignore file to exclude build artifacts, dependencies, and environment-specific files.

SOURCE: https://github.com/elizaos/docs/blob/main/guides/plugin-migration/completion-requirements.mdx#_snippet_0

LANGUAGE: gitignore
CODE:
```
dist
node_modules
.env
.elizadb
.turbo
```

----------------------------------------

TITLE: Development Mode Logging Examples
DESCRIPTION: Illustrates the types of log messages generated during the elizaOS development process, covering project detection, build status, server management, and file watching.

SOURCE: https://github.com/elizaos/docs/blob/main/cli-reference/dev.mdx#_snippet_9

LANGUAGE: bash
CODE:
```
# Project detection
[info] Running in project mode
[info] Package name: my-agent-project

# Build process
[info] Building project...
[success] Build successful

# Server management
[info] Starting server...
[info] Stopping current server process...

# File watching
[info] Setting up file watching for directory: /path/to/project
[success] File watching initialized in: /path/to/project/src
[info] Found 15 TypeScript/JavaScript files in the watched directory

# Change detection
```

----------------------------------------

TITLE: Install elizaOS Plugins
DESCRIPTION: Commands to add external plugins to your elizaOS project using the CLI. Plugins extend agent functionality.

SOURCE: https://github.com/elizaos/docs/blob/main/development.mdx#_snippet_3

LANGUAGE: bash
CODE:
```
elizaos plugins add @elizaos/plugin-twitter
elizaos plugins add @elizaos/plugin-discord
```

----------------------------------------

TITLE: Educational Bot Templates
DESCRIPTION: Defines templates for an educational bot, adapting teaching approaches based on student level, subject, and learning style. Includes templates for message handling and providing educational guidance.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_16

LANGUAGE: typescript
CODE:
```
const educatorCharacter: Character = {
  name: 'EduBot',
  description: 'Adaptive educational assistant',

  templates: {
    // Education-focused templates with learning level adaptation
    messageHandlerTemplate: `<task>Provide educational guidance as {{agentName}}.</task>\n\n{{providers}}\n\n<student-context>\nCurrent Level: {{studentLevel}}\nSubject: {{subject}}\nLearning Style: {{learningStyle}}\n</student-context>\n\n<teaching-approach>\nFor BEGINNERS:\n- Use simple language and analogies\n- Break down complex concepts\n- Provide many examples\n- Check understanding frequently\n\nFor INTERMEDIATE:\n- Build on existing knowledge\n- Introduce technical terminology\n- Encourage critical thinking\n- Suggest practice problems\n\nFor ADVANCED:\n- Discuss edge cases and exceptions\n- Explore theoretical foundations\n- Connect to real-world applications\n- Recommend further reading\n</teaching-approach>\n\n<output>\n<response>\n  <thought>Pedagogical approach for this student</thought>\n  <actions>REPLY,GENERATE_QUIZ</actions>\n  <providers>STUDENT_PROGRESS,CURRICULUM,LEARNING_HISTORY</providers>\n  <text>Your educational response</text>\n</response>\n</output>`,
  },
};
```

----------------------------------------

TITLE: Error Recovery Pattern Example
DESCRIPTION: Illustrates the error recovery pattern by implementing a try-catch block to handle potential errors during request processing. It shows how to provide specific error messages based on error codes and offers a fallback for unexpected issues.

SOURCE: https://github.com/elizaos/docs/blob/main/plugins/bootstrap/examples.mdx#_snippet_18

LANGUAGE: typescript
CODE:
```
const processAction: Action = {
  name: 'PROCESS_REQUEST',

  handler: async (runtime, message, state, options, callback) => {
    try {
      // Acknowledge request
      await callback({
        text: 'Processing your request...', 
        actions: ['ACKNOWLEDGE'],
      });

      // Attempt processing
      const result = await processUserRequest(message);

      // Success response
      await callback({
        text: `Successfully completed! ${result.summary}`,
        actions: ['SUCCESS'],
        metadata: { processId: result.id },
      });
    } catch (error) {
      // Error response with helpful information
      await callback({
        text: 'I encountered an issue processing your request.',
        actions: ['ERROR'],
      });

      // Provide specific error details
      if (error.code === 'RATE_LIMIT') {
        await callback({
          text: "You've exceeded the rate limit. Please try again in a few minutes.",
          actions: ['RATE_LIMIT_ERROR'],
        });
      } else if (error.code === 'INVALID_INPUT') {
        await callback({
          text: `The input seems invalid. Please check: ${error.details}`,
          actions: ['VALIDATION_ERROR'],
        });
      } else {
        // Generic error with support option
        await callback({
          text: 'An unexpected error occurred. Would you like me to create a support ticket?',
          actions: ['OFFER_SUPPORT'],
          metadata: { errorId: generateErrorId() },
        });
      }
    }

    return true;
  },
};

```