This directory contains events, webhooks, and other types of triggers that act as the initial entry point allowing the IA bot to interact with Discord.

The code must remain simple and as close as possible to a straightforward trigger of an AI call, without constraining the AI in how it reacts.

## Discord Events

For Discord events, the file must be named `<event-name>.djs-event.ts` (the event name must be written in kebab-case **in the filename only**).

The event must then be registered using the `discordEvent` function, which provides top-level error handling. Example:

```ts
// message-create.djs-event.ts
import { discordEvent } from "#/discord";

discordEvent("messageCreate", async (message) => {
  // No need to try/catch here
});
```

## Webhooks

Webhooks must be named `<webhook-source>.webhook.ts`.

At the moment, there are not enough existing webhooks to define a clear standard for how they should be implemented, so the agent is free to choose the implementation approach.
