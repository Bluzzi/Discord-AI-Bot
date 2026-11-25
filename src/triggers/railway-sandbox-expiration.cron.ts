import { postgres } from "#/integrations/postgres.client";
import { tableRailwaySandbox } from "#/tables/railway-sandbox";
import { env } from "#/utils/env";
import { trigger } from "#/utils/trigger";
import { and, eq, lte } from "drizzle-orm";
import { Sandbox } from "railway";

await trigger.cron({
  cronName: "railway-sandbox-expiration",
  cronPattern: "* * * * *",
  options: { triggerAtStartup: true },
  handler: async () => {
    // Find VMs whose fixed deadline has passed:
    const token = env.RAILWAY_TOKEN;
    if (token === undefined) return;
    const expired = await postgres.select({ sandboxId: tableRailwaySandbox.sandboxId })
      .from(tableRailwaySandbox)
      .where(and(eq(tableRailwaySandbox.isDestroy, false), lte(tableRailwaySandbox.expiresAt, new Date())));

    for (const { sandboxId } of expired) {
      // Destroy the VM if needed and record the outcome:
      const sandbox = await Sandbox.connect(sandboxId, { token, authType: "project-token" });
      if (sandbox.status !== "DESTROYED" && sandbox.status !== "DESTROYING") await sandbox.destroy();
      await postgres.update(tableRailwaySandbox).set({ isDestroy: true }).where(eq(tableRailwaySandbox.sandboxId, sandboxId));
    }
  },
});
