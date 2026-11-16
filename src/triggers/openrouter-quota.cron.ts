import { openRouterQuota } from "#/utils/openrouter-quota";
import { trigger } from "#/utils/trigger";

await trigger.cron(
  "openrouter-quota",
  "* * * * *",
  async () => {
    // Check the quota state from OpenRouter management endpoints (no model call, nothing heavy):
    await openRouterQuota.refresh();
  },
  {
    triggerAtStartup: true,
  },
);
