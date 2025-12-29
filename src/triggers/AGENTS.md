This directory contains events, webhooks, and other types of triggers that act as the initial entry point allowing the IA bot to interact with Discord.

The code must remain simple and as close as possible to a straightforward trigger of an AI call, without constraining the AI in how it reacts.

## Discord Events

For Discord events, the file must be named `<event-name>.djs-event.ts` (the event name must be written in kebab-case **in the filename only**).

The event must then be registered using the `trigger.discordEvent` function, which provides top-level error handling. Example:

```ts
// message-create.djs-event.ts
import { trigger } from "#/utils/trigger";

trigger.discordEvent("messageCreate", async (message) => {
  // No need to try/catch here
});
```

## Webhooks

Webhooks must be named `<webhook-source>.webhook.ts`.

At the moment, there are not enough existing webhooks to define a clear standard for how they should be implemented, so the agent is free to choose the implementation approach.

Voici la section à ajouter, cohérente avec le reste du document et sans blabla :

## CRON Jobs

CRON jobs are used for scheduled or recurring triggers that initiate autonomous actions by the bot.

They must be registered using the `trigger.cron` function, which provides top-level error handling and optional immediate execution.

The goal remains the same: keep the logic minimal and focused on triggering an AI call, without embedding complex control flow or constraints.

Example:

```ts
cron(
  "daily-summary",
  "0 8 * * *",
  async () => {
    // Trigger AI logic here
  },
  { instantTrigger: false },
);
```

* `cronName` is a unique, human-readable identifier used for logging.
* `cronPattern` follows standard CRON syntax.
* `fn` contains the logic to execute.
* When `instantTrigger` is set to `true`, the CRON job is executed immediately on startup in addition to its scheduled runs.
