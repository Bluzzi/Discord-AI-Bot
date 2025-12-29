# Features Directory

This directory contains reusable AI generation logic extracted from triggers.

## Purpose

The `/src/features` directory serves as a home for AI generation code that has been abstracted from `/src/triggers` when:

- The AI generation logic needs to be reused across multiple triggers
- The AI generation code becomes lengthy (several hundred lines)
- Complex AI workflows require better organization and maintainability

## Relationship with Triggers

As described in `/src/triggers/AGENTS.md`, the architecture follows this principle:

- **`/src/triggers`**: Contains the TRIGGER logic (Discord events, webhooks, CRON jobs) and conditional logic to determine if AI should be invoked
- **`/src/features`**: Contains the AI GENERATION logic (prompts, tool definitions, content processing)

This separation allows triggers to remain lightweight while keeping complex AI logic organized and reusable.

## Structure

Each feature is a single file that exports a function handling a specific AI generation task.

**File naming convention**: `<feature-name>.ts`

**Example structure**:
```
/src/features/
  ├── generate-message-reply.ts
  ├── generate-presence-status.ts
  ├── generate-daily-summary.ts
  └── moderate-content.ts
```

## Implementation Pattern

A typical feature file contains:

1. **Prompt definition** - The system and user prompts for the AI
2. **Tool configuration** - Available tools the AI can use
3. **AI invocation** - Call to `generateText` from the `ai` package
4. **Response processing** - Handling the AI-generated content
5. **Discord action** - Executing the Discord API action with the generated content

**Example** (`generate-presence-status.ts`):
```ts
import { generateText } from "ai";
import { ActivityType } from "discord.js";
import { aiModels } from "#/config/ai";
import { discordClient } from "#/config/discord";
import { newsTools } from "#/tools/news";
import { z } from "zod";

export const generatePresenceStatus = async () => {
  if (!discordClient.user) {
    throw new Error("Discord bot user is not available");
  }

  // AI GENERATION: Generate status content
  const result = await generateText({
    model: aiModels.mistralLarge,
    output: Output.object({
      schema: z.object({
        emoji: z.string().describe("A single relevant Unicode emoji"),
        text: z.string().describe("Status text without emoji (40 characters max)"),
      }),
    }),
    prompt: `
      You are the Discord status generator for **Jean Pascal**, a funny, casual Discord bot.
      
      Current date: ${new Date().toLocaleString()}
      
      Generate a short, punchy, and funny status adapted to today's context.
      Use a humorous, slightly edgy tone.
    `,
    tools: {
      ...newsTools,
    },
  });

  // DISCORD ACTION: Update bot presence
  discordClient.user.setPresence({
    status: "online",
    activities: [{
      name: "Custom",
      type: ActivityType.Custom,
      state: `${result.output.emoji} ${result.output.text}`,
    }],
  });
};
```

## Usage from Triggers

Triggers import and invoke feature functions as needed:
```ts
// In /src/triggers/daily-status-update.cron.ts
import { trigger } from "#/utils/trigger";
import { generatePresenceStatus } from "#/features/generate-presence-status";

trigger.cron(
  "daily-status-update",
  "0 8 * * *",
  async () => {
    // TRIGGER logic: no conditions needed for scheduled job
    
    // AI GENERATION: delegate to feature
    await generatePresenceStatus();
  },
  { 
    triggerAtStartup: true
  },
);
```