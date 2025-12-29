# Tools Directory

This directory contains tools for various services/systems intended to be used by AIs.

Each file MUST:
- Export a single object containing the complete list of tools for the related service
- Contain **no additional code or functions outside of this object**

Expected structure:

```ts
export const discordTools: ToolSet = {
  renameMember: tool({
    description: "Rename a guild member",
    inputSchema: z.object({
      guildID: z.string().describe("The Discord guild/server ID"),
      memberID: z.string().describe("The Discord member ID to rename"),
      nickname: z.string().describe("The new nickname for the member"),
    }),
    outputSchema: z.object({ 
      oldNickname: z.string().describe("Previous nickname"),
      newNickname: z.string().describe("New nickname"),
      memberID: z.string().describe("Member ID"),
    }),
    execute: async ({ guildID, userID, nickname }) => {
      const guild = discordClient.guilds.get(guildID);
      if (!guild) throw new Error("Guild not found");

      const member = await guild.members.fetch(memberID);
      if (!member) throw new Error("Member not found");

      const oldNickname = member.nickname || member.user.username;
      await member.setNickname(nickname);

      return {
        oldNickname,
        newNickname: nickname,
        memberId: member.id,
      };
    },
  }),
  // ... other tools for this service
};
```

If `outputSchema` has no meaningful data to return, it MUST be defined as an empty object:

```ts
z.object({})
```

This rule exists to keep return values consistent across all tools.