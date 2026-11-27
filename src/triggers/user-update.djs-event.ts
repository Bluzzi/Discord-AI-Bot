import { postgres } from "#/integrations/postgres.client";
import { tableDiscordMember } from "#/tables/discord-member";
import { trigger } from "#/utils/trigger";
import { and, eq, sql } from "drizzle-orm";

trigger.discordEvent({
  eventName: "userUpdate",
  handler: async (_oldUser, user) => {
    // Refresh global profile fields for every stored membership of this user:
    const userName = user.globalName;
    const userTag = user.username;
    const userProfilePicture = user.avatarURL();
    await postgres.update(tableDiscordMember).set({ userName, userTag, userProfilePicture }).where(and(
      eq(tableDiscordMember.userId, user.id),
      sql`(${tableDiscordMember.userName}, ${tableDiscordMember.userTag}, ${tableDiscordMember.userProfilePicture})
        is distinct from (${userName}::text, ${userTag}::text, ${userProfilePicture}::text)`,
    ));
  },
});
