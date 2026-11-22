import { cleanUpSkills } from "#/features/clean-up-skills";
import { openRouterQuota } from "#/integrations/openrouter";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import dedent from "dedent";

await trigger.cron(
  "skill-cleanup",
  "0 * * * *", // every hour
  async () => {
    // Skip the AI call when OpenRouter has no quota left (the CRON simply stops working):
    if (openRouterQuota.isExhausted()) {
      logger.info("Skill cleanup skipped: OpenRouter quota exhausted");
      return;
    }

    const decisions = await cleanUpSkills();

    if (decisions.length === 0) {
      logger.info("Skill cleanup: no skills consolidated");
      return;
    }

    const deletedSkillCount = decisions.reduce((count, decision) => count + decision.deletedSkillIds.length, 0);
    logger.info(dedent`
      Skill cleanup: ${String(deletedSkillCount)} skill(s) deactivated:
      ${decisions.map((decision) => {
        const action = decision.mergedRule === null ? `kept ${decision.activeSkillId}` : `created ${decision.activeSkillId} (merged rule: ${decision.mergedRule})`;
        return `- ${action}, deactivated [${decision.deletedSkillIds.join(", ")}]: ${decision.reason}`;
      }).join("\n")}
    `);
  },
  {
    triggerAtStartup: true,
  },
);
