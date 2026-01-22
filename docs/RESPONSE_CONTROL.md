# Pixel Response Control System

## Overview

This document describes the fail-safe, multi-layer response control system for Pixel's group chat behavior.

## Problem Statement

Pixel was being too chatty in Telegram group chats, responding to messages even when not directly addressed. The default ElizaOS `shouldRespondTemplate` has a permissive rule: "If you're actively participating in a conversation and the message continues that thread → RESPOND" which causes the agent to keep responding once it starts.

## Solution Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: Pre-LLM Hard Rules (built into ElizaOS core)          │
│ → DM/API/Mention → skipEvaluation=true, ALWAYS RESPOND         │
│ → Room muted → NEVER RESPOND                                    │
│ → These rules CANNOT be overridden                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (if not handled)
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2: Custom shouldRespondTemplate [PRIMARY CONTROL]        │
│ → Located: src/character/templates.ts                          │
│ → Integrated via: src/character/manifest.ts                    │
│ → Philosophy: IGNORE by default, RESPOND only with clear value │
│ → Includes 5-point self-check before responding                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (if RESPOND)
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: Style Directives (src/character/style.ts)             │
│ → "SELECTIVE ENGAGEMENT", "IGNORE WHEN APPROPRIATE"            │
│ → Influences response content and tone                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 4: System Prompt (src/character/manifest.ts)             │
│ → "You're not an AI assistant"                                  │
│ → Character personality constraints                             │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `src/character/templates.ts` | Custom `shouldRespondTemplate` - the main control |
| `src/character/manifest.ts` | Imports and integrates templates into character |
| `src/character/style.ts` | Behavioral style directives |
| `character.json` | Generated file (do not edit directly) |

## Custom shouldRespondTemplate

The custom template implements a **value-threshold test**:

### RESPOND Only If:
1. **DIRECT ADDRESS**: Name "Pixel" explicitly mentioned AND talking TO you
2. **DIRECT QUESTION**: Someone asks YOU a specific question
3. **EXPERTISE NEEDED**: Topic is art/pixels/Bitcoin/Lightning AND genuinely insightful
4. **HIGH-VALUE CONTRIBUTION**: Unique insight that would be missed if not sent

### IGNORE (Default) When:
- Conversation is between other people
- Name mentioned but talking ABOUT you, not TO you
- Already participated and conversation moved on
- Someone else could answer just as well
- Low-effort messages (unless directly to you)
- Would be adding filler ("nice!", "agreed!")
- Conversation winding down or at natural pause
- Responded recently (repetition)
- **When in doubt, IGNORE**

### 5-Point Self-Check:
1. "Am I being directly addressed?" - If no, IGNORE
2. "Would my response add something unique?" - If no, IGNORE
3. "Have I already contributed recently?" - If yes, IGNORE
4. "Is this just my ego?" - If yes, IGNORE
5. "Would conversation be worse if I stayed silent?" - If no, IGNORE

## How Context Works

When making response decisions, the agent receives:
- **RECENT_MESSAGES**: Last 32 messages of conversation (configurable)
- **CHARACTER**: Bio, personality, style guidance
- **ENTITIES**: Information about who's in the conversation
- **ACTIONS**: Available actions

This provides sufficient context for meaningful decisions.

## Rebuilding After Changes

After modifying template files:

```bash
cd /home/ana/Code/pixel/pixel-agent
npm run build:character
```

This regenerates `character.json` with the updated templates.

## Testing

To verify the template is active:

```bash
grep -A 5 '"templates"' character.json
```

Should show the custom `shouldRespondTemplate` content.

## Tuning Behavior

### To make Pixel MORE quiet:
- Add more conditions to the IGNORE list in `templates.ts`
- Strengthen the "when in doubt, IGNORE" messaging

### To make Pixel MORE responsive:
- Reduce conditions in the IGNORE list
- Add more RESPOND conditions (carefully)

### To change WHAT topics trigger responses:
- Edit the "EXPERTISE NEEDED" section in `templates.ts`

## Deployment

1. Make changes to `src/character/templates.ts`
2. Run `npm run build:character`
3. Deploy to VPS
4. Rebuild agent container: `docker compose build agent`
5. Restart: `docker compose restart agent`

## Related Settings in settings.ts

| Setting | Effect |
|---------|--------|
| `ALWAYS_RESPOND_CHANNELS` | Bypasses LLM evaluation for listed channels |
| `ALWAYS_RESPOND_SOURCES` | Bypasses LLM evaluation for listed sources |

These are NOT needed for normal group chat moderation - the custom template handles that.
