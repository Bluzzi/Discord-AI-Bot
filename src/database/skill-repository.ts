import { postgres } from "#/database/client";
import { tableDiscordSkill } from "#/database/schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

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
  createdAt: Date;
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

  return { id: row.id, trigger: row.trigger, rule: row.rule, createdByUserID: row.createdByUserID, usageCount: row.usageCount, createdAt: row.createdAt };
};

// Deleted skills (deletedAt defined) are invisible everywhere: never listed in prompts, never openable:
export const listSkillTriggers = async (): Promise<SkillTrigger[]> => {
  if (triggerCache !== null && Date.now() - triggerCache.fetchedAt < TRIGGER_CACHE_TTL_MS) {
    return triggerCache.triggers;
  }

  const triggers = await postgres
    .select({ id: tableDiscordSkill.id, trigger: tableDiscordSkill.trigger })
    .from(tableDiscordSkill)
    .where(isNull(tableDiscordSkill.deletedAt))
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
    .where(and(eq(tableDiscordSkill.id, skillId), isNull(tableDiscordSkill.deletedAt)))
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("Skill not found");
  }

  return { id: row.id, trigger: row.trigger, rule: row.rule, createdByUserID: row.createdByUserID, usageCount: row.usageCount, createdAt: row.createdAt };
};

// Full view of the active skills (trigger + rule), used by the daily cleanup to detect conflicting rules:
export const listSkills = async (): Promise<Skill[]> => {
  const rows = await postgres
    .select()
    .from(tableDiscordSkill)
    .where(isNull(tableDiscordSkill.deletedAt))
    .orderBy(asc(tableDiscordSkill.createdAt));

  return rows.map((row) => ({ id: row.id, trigger: row.trigger, rule: row.rule, createdByUserID: row.createdByUserID, usageCount: row.usageCount, createdAt: row.createdAt }));
};

// Soft delete: deletedAt is defined, the row stays for audit. Deletion must be reflected in every
// prompt immediately, so the trigger cache is invalidated:
export const deleteSkills = async ({ skillIds }: { skillIds: string[] }): Promise<void> => {
  if (skillIds.length === 0) {
    return;
  }

  await postgres
    .update(tableDiscordSkill)
    .set({ deletedAt: new Date() })
    .where(inArray(tableDiscordSkill.id, skillIds));

  triggerCache = null;
};
