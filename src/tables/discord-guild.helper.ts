import type { Guild } from "discord.js";
import { postgres } from "#/integrations/postgres.client";
import { tableDiscordGuild } from "#/tables/discord-guild.table";
import { sql } from "drizzle-orm";

export const ensureDiscordGuild = async (guild: Guild): Promise<string> => {
  // Seed the guild and keep its metadata if it already exists:
  const [row] = await postgres.insert(tableDiscordGuild)
    .values({ guildId: guild.id, guildName: guild.name })
    .onConflictDoUpdate({
      target: tableDiscordGuild.guildId,
      set: { updatedAt: sql`${tableDiscordGuild.updatedAt}` },
    }).returning({ id: tableDiscordGuild.id });
  return row!.id;
};
