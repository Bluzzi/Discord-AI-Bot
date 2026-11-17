import { postgres } from "#/postgres/client";
import { tableDiscordSkill } from "#/postgres/schema";
import { asc, eq, sql } from "drizzle-orm";

// Trigger budget: a trigger is a very short condition (a few tokens), rendered in every AI prompt:
export const SKILL_TRIGGER_MAX_LENGTH = 120;
// Rule budget: the rule is the whole behavior to follow once the skill is opened:
export const SKILL_RULE_MAX_LENGTH = 600;

type Skill = {
  id: string;
  trigger: string;
  rule: string;
  createdByUserID: string;
  usageCount: number;
};

type SkillTrigger = Pick<Skill, "id" | "trigger">;

// Triggers are rendered in every AI prompt (reply decision and reply generation): a tiny TTL cache
// avoids a Postgres roundtrip on each message. Creation invalidates it:
const TRIGGER_CACHE_TTL_MS = 30_000;

let triggerCache: { triggers: SkillTrigger[]; fetchedAt: number } | null = null;

// Triggers and rules are rendered one per line inside the "data zone" of the prompts: a newline would
// break the one-line-per-skill format (a classic prompt-injection vector), so every whitespace run is
// collapsed into a single space:
const toSingleLine = (value: string): string => value.replaceAll(/\s+/gu, " ").trim();

export const createSkill = async ({ trigger, rule, authorId }: { trigger: string; rule: string; authorId: string }): Promise<Skill> => {
  const cleanTrigger = toSingleLine(trigger);
  const cleanRule = toSingleLine(rule);

  if (cleanTrigger.length < 3 || cleanTrigger.length > SKILL_TRIGGER_MAX_LENGTH) {
    throw new Error(`Skill trigger must be a single short sentence of 3 to ${String(SKILL_TRIGGER_MAX_LENGTH)} characters (got ${String(cleanTrigger.length)})`);
  }

  if (cleanRule.length < 3 || cleanRule.length > SKILL_RULE_MAX_LENGTH) {
    throw new Error(`Skill rule must be a single sentence of 3 to ${String(SKILL_RULE_MAX_LENGTH)} characters (got ${String(cleanRule.length)})`);
  }

  const rows = await postgres
    .insert(tableDiscordSkill)
    .values({ trigger: cleanTrigger, rule: cleanRule, createdByUserID: authorId })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("Skill creation failed");
  }

  triggerCache = null;

  return { id: row.id, trigger: row.trigger, rule: row.rule, createdByUserID: row.createdByUserID, usageCount: row.usageCount };
};

export const listSkillTriggers = async (): Promise<SkillTrigger[]> => {
  if (triggerCache !== null && Date.now() - triggerCache.fetchedAt < TRIGGER_CACHE_TTL_MS) {
    return triggerCache.triggers;
  }

  const triggers = await postgres
    .select({ id: tableDiscordSkill.id, trigger: tableDiscordSkill.trigger })
    .from(tableDiscordSkill)
    .orderBy(asc(tableDiscordSkill.createdAt));

  triggerCache = { triggers, fetchedAt: Date.now() };

  return triggers;
};

// Opening a skill = reading its full rule to apply it. usage_count tracks these reads (a read almost
// always means an application):
export const openSkill = async ({ skillId }: { skillId: string }): Promise<Skill> => {
  const rows = await postgres
    .update(tableDiscordSkill)
    .set({ usageCount: sql`${tableDiscordSkill.usageCount} + 1` })
    .where(eq(tableDiscordSkill.id, skillId))
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("Skill not found");
  }

  return { id: row.id, trigger: row.trigger, rule: row.rule, createdByUserID: row.createdByUserID, usageCount: row.usageCount };
};
