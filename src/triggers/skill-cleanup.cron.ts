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

    const { deletedSkillCount, decisions } = await cleanUpSkills();

    if (decisions.length === 0) {
      logger.info("Skill cleanup: no duplicate skills detected");
      return;
    }

    logger.info(dedent`
      Skill cleanup: ${String(deletedSkillCount)} skill(s) deleted:
      ${decisions.map((decision) => `- kept ${decision.keptSkillId}, deleted [${decision.deletedSkillIds.join(", ")}]: ${decision.reason}`).join("\n")}
    `);
  },
  {
    triggerAtStartup: true,
  },
);
