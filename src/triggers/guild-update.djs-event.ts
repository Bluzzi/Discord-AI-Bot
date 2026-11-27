import { postgres } from "#/integrations/postgres.client";
import { tableDiscordGuild } from "#/tables/discord-guild.table";
import { trigger } from "#/utils/trigger";
import { sql } from "drizzle-orm";

trigger.discordEvent({
  eventName: "guildUpdate",
  handler: async (oldGuild, guild) => {
    if (oldGuild.name === guild.name) return;
    await postgres.insert(tableDiscordGuild).values({ guildId: guild.id, guildName: guild.name })
      .onConflictDoUpdate({
        target: tableDiscordGuild.guildId,
        set: { guildName: guild.name },
        setWhere: sql`${tableDiscordGuild.guildName} is distinct from excluded.guild_name`,
      });
  },
});
