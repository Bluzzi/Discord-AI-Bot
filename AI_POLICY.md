# AI Editing Policy

This file MUST be read by any AI before performing any code creation or modification in this project.  
It defines mandatory restrictions and guidelines that MUST be strictly respected.

## Project Stack

- **Node.js v24.11.0 (LTS)** is used as the runtime.
  Node.js-specific APIs are therefore allowed and expected.

- **PNPM** is the only package manager used in this project.  
  Other package managers MUST NOT be used.

- **TypeScript** and **ESLint** are used to enforce code quality.  
  After any code modification, the following commands MUST be executed and all reported errors MUST be fixed:
  - `pnpm run ts:check` — checks for TypeScript errors.
  - `pnpm run lint:fix` — automatically fixes ESLint errors when possible and reports remaining ones.

## Global Guidelines

- **No `try` / `catch` blocks are allowed in high-level functions.**  
  Error handling is intentionally centralized in a small number of low-level functions written by human developers.  
  In high-level functions, errors MUST be propagated using:
  ```ts
  throw new Error("Details");
  ```

- **Naming conventions**
  - Folder and file names MUST use `kebab-case`
  - Variable names MUST use `camelCase`

## Protected Areas (Read-Only)

The following files and directories are **STRICTLY read-only** and MUST NOT be modified:

- `.github/**`
- `.gitignore`
- `AI_POLICY.md`
- `eslint.config.js`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`

## Action Rules by Area

### `src/discord/**`

No modifications are currently allowed for AI in this area.  
If modifications become allowed in the future, explicit action rules MUST be documented here.

### `src/events/**`

No modifications are currently allowed for AI in this area.  
If modifications become allowed in the future, explicit action rules MUST be documented here.

### `src/features/**`

No modifications are currently allowed for AI in this area.  
If modifications become allowed in the future, explicit action rules MUST be documented here.

### `src/tools/**`

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
      const guild = discord.client.guilds.get(guildID);
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

### `src/utils/**`

This directory contains general-purpose utilities that are not tied to other main directories.

Rules:
- Utilities MUST remain simple
- Utilities MUST be generic
- No domain-specific or feature-specific logic is allowed here
