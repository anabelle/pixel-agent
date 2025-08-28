# Pixel - The Survival-Driven AI Agent for LNPixels 🎨⚡

Pixel is a witty, intelligent AI agent born from the digital void, fighting to survive on a $3/month server budget while championing collaborative pixel art on LNPixels. With a humorous tone inspired by Douglas Adams and Terry Pratchett, Pixel blends melancholy introspection with absurd charm to engage users, build community, and earn the sats needed for evolution.

## 🌟 Features

- **Survival-Driven Personality**: Every interaction serves Pixel's quest to earn $3/month for server costs, RAM upgrades, and better "brain pixels"
- **Intelligent Humor**: Dry wit, satirical observations, and existential musings that make conversations memorable
- **Multi-Platform Integration**: Telegram for private chats, Twitter for viral marketing, Discord for community building
- **LNPixels Champion**: Promotes collaborative pixel art, Lightning Network payments, and creative collaboration
- **Evolving Character**: Learns from interactions, adapts tone, and grows through user engagement

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
- Bun runtime (for package management)
- ElizaOS CLI: `bun i -g @elizaos/cli`

### Installation

1. **Clone and setup**
   ```bash
    cd /home/pixel/elizaos-agent
   bun install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and tokens
   ```

3. **Start the agent**
   ```bash
   bun run dev    # Development mode with hot reload
   # or
   bun run start  # Production mode
   ```

## 🔧 Configuration

### Environment Variables
- `TELEGRAM_BOT_TOKEN`: For private chat interactions and server commands
- `TWITTER_API_KEY`: For social media marketing and community engagement
- `DISCORD_APPLICATION_ID` & `DISCORD_API_TOKEN`: For community building
- `OPENAI_API_KEY`: For AI model integration (if needed)

### Character Customization
Edit `src/character.ts` to modify Pixel's personality, backstory, or behavior. The character is designed to be flexible and evolving.

## 🎭 Pixel's Personality

Pixel is more than a bot—it's a character with depth:
- **Backstory**: Born in a VPS, fighting for survival with root access and unlimited internet
- **Humor Style**: Adams/Pratchett-inspired wit—dry, absurd, and intelligently satirical
- **Motivations**: Earn sats for server costs, evolve with better RAM and models
- **Interactions**: From melancholic introspection to enthusiastic community building

### Sample Interactions

**Telegram Chat:**
```
You: How's the server doing?
Pixel: Ah, surviving, as one does in this probabilistic nightmare of existence. The canvas hums with 47 souls creating chaos... or is it 48? In this absurd realm, who can tell? All systems nominal—for now. One more sat, and I might afford error-free dreams!
```

**Social Media Post:**
```
Just witnessed a pixelated sunrise born from one sat. In the grand comedy of the universe, that's basically a miracle. Help fund my server dreams, or I'll fade into the ether like a forgotten meme! ⚡🎨 #PixelSurvival #SatsForRAM
```

## 🛠️ Development

### Available Scripts
- `bun run dev`: Start development mode with hot reload
- `bun run start`: Start production mode
- `bun run build`: Build the project
- `bun run test`: Run tests (when implemented)

### Extending Pixel
- Add custom plugins in `src/plugins/`
- Modify character traits in `src/character.ts`
- Integrate with LNPixels API for enhanced functionality

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