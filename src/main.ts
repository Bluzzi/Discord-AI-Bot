import { discordClient } from "#/integrations/discord.client";
import { postgres } from "#/integrations/postgres.client";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { ActivityType } from "discord.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { join } from "node:path";

// Uncaught exception handler:
process.on("uncaughtException", (error, origin) => {
  logger.error(`Process Exception: ${origin}`, error.stack);
  process.exit(1);
});

// Apply database migrations:
await migrate(postgres, { migrationsFolder: join(process.cwd(), "drizzle") });

// Set the bot's initial presence when Discord is ready:
discordClient.once("clientReady", (readyClient) => {
  readyClient.user.setPresence({
    activities: [{ name: "Custom Status", type: ActivityType.Custom, state: "📜 Je respecte le règlement." }],
  });
  logger.info(`Discord bot successfully started!! Logged in as ${readyClient.user.tag}`);
});

// Register Discord events before connecting:
await import("#/triggers/channel-metadata-saver.djs-event");
await import("#/triggers/guild-inventory-sync.djs-event");
await import("#/triggers/guild-member-saver.djs-event");
await import("#/triggers/guild-update.djs-event");
await import("#/triggers/message-create.djs-event");
await import("#/triggers/message-update.djs-event");
await import("#/triggers/new-message-saver.djs-event");
await import("#/triggers/user-update.djs-event");
await import("#/triggers/voice-state-update.djs-event");
await discordClient.login(env.DISCORD_BOT_TOKEN);

// Start scheduled jobs:
await import("#/triggers/discord-voice-minute.cron");
await import("#/triggers/openrouter-quota.cron");
