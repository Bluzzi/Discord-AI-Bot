import { postgres } from "#/integrations/postgres.client";
import { defaultDiscordGuildTimezone, tableDiscordGuild } from "#/tables/discord-guild.table";
import { tableDiscordMember } from "#/tables/discord-member.table";
import { tableDiscordVoiceMinute } from "#/tables/discord-voice-minute.table";
import { day } from "#/utils/day";
import { getDiscordReplyGuildId } from "#/utils/discord-reply-context";
import { tool } from "ai";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

export const discordMetricTools = {
  getMembersVoiceMinutesPerDay: tool({
    description: "Get recorded voice minutes by member and day in the guild timezone. Defaults to 30 days ago through today.",
    inputSchema: z.strictObject({
      dateRange: z.strictObject({
        startDate: z.iso.date().default(() => day().subtract(30, "day").format("YYYY-MM-DD")),
        endDate: z.iso.date().default(() => day().format("YYYY-MM-DD")),
      }).refine(({ startDate, endDate }) => startDate <= endDate, {
        message: "startDate must be on or before endDate",
      }).prefault({}).describe("Inclusive date range (YYYY-MM-DD)"),
    }),
    execute: async ({ dateRange: { startDate, endDate } }) => {
      // Read the timezone for the current guild:
      const [guild] = await postgres.select({ id: tableDiscordGuild.id, timezone: tableDiscordGuild.timezone })
        .from(tableDiscordGuild)
        .where(eq(tableDiscordGuild.guildId, getDiscordReplyGuildId()));
      if (!guild) return { startDate, endDate, timezone: defaultDiscordGuildTimezone, entries: [] };

      // Convert local day boundaries to UTC timestamps for PostgreSQL:
      const startAt = day.tz(startDate, guild.timezone).startOf("day").utc().toDate();
      const endAt = day.tz(endDate, guild.timezone).endOf("day").utc().toDate();

      // Count recorded minutes per member and local day in the current guild:
      const date = sql<string>`to_char(${tableDiscordVoiceMinute.createdAt} at time zone 'UTC' at time zone ${guild.timezone}, 'YYYY-MM-DD')`.as("voice_date");
      const entries = await postgres.select({
        date,
        userId: tableDiscordMember.userId,
        displayName: sql<string>`coalesce(${tableDiscordMember.memberName}, ${tableDiscordMember.userName}, ${tableDiscordMember.userTag})`,
        minutes: count(),
      }).from(tableDiscordVoiceMinute)
        .innerJoin(tableDiscordMember, and(eq(tableDiscordVoiceMinute.memberId, tableDiscordMember.id), eq(tableDiscordVoiceMinute.guildId, tableDiscordMember.guildId)))
        .where(and(eq(tableDiscordVoiceMinute.guildId, guild.id), gte(tableDiscordVoiceMinute.createdAt, startAt), lte(tableDiscordVoiceMinute.createdAt, endAt)))
        .groupBy(date, tableDiscordMember.id)
        .orderBy(date, tableDiscordMember.userId);

      return { startDate, endDate, timezone: guild.timezone, entries };
    },
  }),
};
