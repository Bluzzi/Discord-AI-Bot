# Services Directory

This directory contains small, startable services used by the application (HTTP server, Discord client, etc.).

## Principles

- Services should be minimal and focused on lifecycle/start logic.
- Expose clear startup functions that `main.ts` imports and runs.
- Avoid embedding business logic — services only wire clients and expose start helpers.

## Usage

Start services from `main.ts` (example pattern used in the project):

```ts
await discordClientStart(async () => {
  await import("#/triggers/message-create.djs-event");
});

await serverStart(async () => {
  // register webhook routes here
});
```
