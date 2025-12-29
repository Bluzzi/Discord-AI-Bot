This directory contains all entry points used to trigger the bot: Discord events, webhooks, and scheduled jobs.

Code in this directory must stay minimal. Its only responsibility is to trigger an AI call.
Do not embed complex logic or constrain how the AI reacts.

## Discord Events

Discord event files must be named `<event-name>.djs-event.ts`, using kebab-case **in the filename only**.

Events are registered through `trigger.discordEvent`, which handles top-level error management.

Example:

```ts
// message-create.djs-event.ts
import { trigger } from "#/utils/trigger";

trigger.discordEvent("messageCreate", async (message) => {
  // No try/catch needed here
});
```

## Webhooks

Webhook files must be named `<webhook-source>.webhook.ts`.

There is currently no strict standard for webhook implementation. The agent is free to choose an appropriate structure, as long as the code remains simple and focused on triggering the AI.

## CRON Jobs

CRON jobs are used for scheduled or recurring triggers. 

File name must use kebab-case and clearly describe the job’s intent: <job-name.cron.ts>.

They must be registered using `trigger.cron`, which provides centralized error handling and optional immediate execution.

Example:

```ts
// daily-summary.cron.ts
trigger.cron(
  "daily-summary",
  "0 8 * * *",
  async () => {
    // Trigger AI logic here
  },
  { 
    instantTrigger: false
  },
);
```
