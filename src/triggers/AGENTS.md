# Triggers Directory

This directory contains all entry points used to trigger the bot.

## Core Concepts

It's important to distinguish between two key components:

- **TRIGGER**: Discord events, webhooks, and scheduled jobs. This includes conditional logic that optionally determines whether the AI should be invoked.
- **AI GENERATION**: Direct AI invocation, where the prompt is defined, tools are made available, and the AI-generated content is processed. This typically uses the `generateText` function from the `ai` package.

## Design Principles

Code should remain as close as possible to a simple `TRIGGER` that launches `AI GENERATION`, allowing maximum autonomy to the AI. Algorithmic constraints should be minimized.

When the AI generation code needs to be reused across multiple `TRIGGER` files or becomes lengthy (several hundred lines), it should be moved to `/src/features`, while keeping the `TRIGGER` logic in `/src/triggers`. The `/src/triggers/message-create.djs-event.ts` and `/src/features/reply-to-message.ts` files is a good example of this principle.

Each `TRIGGER` type has a specific function for implementation, described below. These functions all handle errors globally according to the code in `/src/utils/trigger.ts`.

All trigger files must be initialized at project startup in `/src/main.ts` under the appropriate comment.

## Discord Events

Creates a listener for a specific Discord event.

**File naming convention**: `<event-name>.djs-event.ts`

**Example** (`message-create.djs-event.ts`):
```ts
import { trigger } from "#/utils/trigger";

trigger.discordEvent("messageCreate", async (message) => {
  // TRIGGER and AI GENERATION
});
```

## Webhooks

Webhooks allow subscription to events from external sources.

**File naming convention**: `<webhook-source>.webhook.ts`

**Example** (`counter-strike-game-end.webhook.ts`):
```ts
import { trigger } from "#/utils/trigger";

trigger.webhook("counter-strike-game-end", "/counter-strike/game-end", async () => {
  // TRIGGER and AI GENERATION
});
```

## CRON Jobs

CRON jobs are used for scheduled or recurring triggers.

**File naming convention**: `<job-name>.cron.ts`

**Example** (`daily-summary.cron.ts`):
```ts
import { trigger } from "#/utils/trigger";

trigger.cron(
  "daily-summary",
  "0 8 * * *",
  async () => {
    // TRIGGER and AI GENERATION
  },
  { 
    triggerAtStartup: false
  },
);
```