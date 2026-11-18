import { generatePresence } from "#/features/presence";
import { openRouterQuota } from "#/integrations/openrouter";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";

await trigger.cron(
  "discord-presence",
  "0 * * * *",
  async () => {
    // Skip the AI call when OpenRouter has no quota left (the CRON simply stops working):
    if (openRouterQuota.isExhausted()) {
      logger.info("Discord presence skipped: OpenRouter quota exhausted");
      return;
    }

    await generatePresence();
  },
  {
    triggerAtStartup: true,
  },
);
