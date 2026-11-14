# Tools Directory

This directory contains tools for various services/systems intended to be used by AIs.

Each file MUST:
- Export a single object containing the complete list of tools for the related service
- Contain **no additional code or functions outside of this object**

Expected structure:

```ts
export const discordTools = {
  renameMember: tool({
    description: "Rename a guild member",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to rename"),
      nickname: z.string().describe("The new nickname for the member"),
    }),
    outputSchema: z.object({
      oldNickname: z.string().describe("Previous nickname"),
      newNickname: z.string().describe("New nickname"),
      memberId: z.string().describe("Member ID"),
    }),
    execute: async ({ guildId, memberId, nickname }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const member = await guild.members.fetch(memberId);
      if (!member) throw new Error("Member not found");

      const oldNickname = member.nickname ?? member.user.username;
      await member.setNickname(nickname);

      return {
        oldNickname,
        newNickname: nickname,
        memberId: member.id,
      };
    },
  }),
  // ... other tools for this service
} satisfies ToolSet;
```

The toolset MUST be typed with `satisfies ToolSet` instead of a `: ToolSet` annotation. The annotation erases the types inferred from `inputSchema`, `outputSchema` and `contextSchema`, which breaks typed tool inputs at call sites and disables `toolsContext` inference in AI generation calls (AI SDK v7).

If `outputSchema` has no meaningful data to return, it MUST be defined as an empty object:

```ts
z.object({})
```

This rule exists to keep return values consistent across all tools.