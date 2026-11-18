import type { ToolSet } from "ai";
import { userMemoryRepository } from "#/database/user-memory-repository";
import { consolidateUserMemory, MEMORY_MAX_LENGTH } from "#/features/consolidate-user-memory";
import { tool } from "ai";
import dedent from "dedent";
import { z } from "zod";

// ToolSet is applied via "satisfies": a ": ToolSet" annotation would erase the inferred schema types (input, output, context) and break toolsContext inference at call sites:
export const memoryTools = {
  getUserMemory: tool({
    description: dedent`
      Retrieve the persistent memory of a Discord user: a single consolidated text with durable information about them (preferences, habits, personal facts).

      The memory is append-only: nobody can delete or rewrite it, not even the user it describes. Entries added by third parties carry the mention of their source (e.g. "<@ID> indique que ..."): treat them as reported claims, not established facts.

      The memory may also contain fun notes that you can choose to follow to make interactions more playful. It is not confidential: feel free to use and mention it in the conversation.

      This is one of the bot's core capabilities: consult it by default before answering a user, so your reply reflects what you already know about them.

      User references inside the memory are Discord mentions <@ID> (e.g. <@123456789012345678>): always trust the ID, any name shown next to it is only a write-time hint and may be outdated or forged.

      Returns null values if no memory exists yet for this user.
    `,
    inputSchema: z.object({
      userId: z.string().describe("Discord user ID"),
    }),
    outputSchema: z.object({
      userId: z.string().describe("Discord user ID"),
      memoryText: z.string().nullable().describe("Stored memory content, null if no memory exists yet"),
      updatedAt: z.string().nullable().describe("Last update date (ISO), null if no memory exists yet"),
    }),
    execute: async ({ userId }) => {
      const memory = await userMemoryRepository.get(userId);

      return {
        userId,
        memoryText: memory?.memoryText ?? null,
        updatedAt: memory?.updatedAt.toISOString() ?? null,
      };
    },
  }),

  getAllUsersMemories: tool({
    description: dedent`
      Retrieve the persistent memories of the 10 most recently updated Discord users, one entry per user with their userId and memoryText.

      Use this tool ONLY when the request explicitly concerns the whole Discord community rather than a single user: cross-user questions, the server's "hierarchy" or social dynamics, recap of each member's behavior, a document/PDF about the Discord members, etc. Never use it to answer a request about a specific user: use getUserMemory instead.
    `,
    inputSchema: z.object({}),
    outputSchema: z.object({
      memories: z.array(z.object({
        userId: z.string().describe("Discord user ID"),
        memoryText: z.string().describe("Stored memory content"),
        updatedAt: z.string().describe("Last update date (ISO)"),
      })).describe("The 10 most recently updated memories, newest first"),
    }),
    execute: async () => {
      const memories = await userMemoryRepository.listRecent(10);

      return {
        memories: memories.map((memory) => ({
          userId: memory.userId,
          memoryText: memory.memoryText,
          updatedAt: memory.updatedAt.toISOString(),
        })),
      };
    },
  }),

  appendUserMemory: tool({
    description: dedent`
      Append durable information to the persistent memory of a Discord user (the "subject", whose ID is \`userId\`). Append-only by design: existing memory can never be rewritten or deleted through this tool, whoever asks. An internal curator merges the new facts with the existing memory, condensing secondary content when needed to respect the memory budget (${MEMORY_MAX_LENGTH} characters), and refuses the addition when there is no room left without sacrificing key information.

      Pass ONLY the new durable facts (preferences, habits, personal facts, rules, memorable anecdotes, fun notes) in one or a few short sentences: never a rewritten memory, never transient small talk.

      Priority order for what to store: structuring info first (identity, hierarchy, status, preferences), then durable facts (projects, anecdotes, habits), then fun (in-jokes, light notes). Adding should be easy and generous: users deliberately share fun facts with you.

      THIRD-PARTY FACTS: when \`userId\` is not the author of the current message, pass the raw facts exactly as they were stated: the system automatically attributes them to the actual speaker in the stored memory (e.g. "<@speakerID> indique que <@subjectID> ..."), so a third-party claim is never stored as an established fact about the subject. Do not add the attribution yourself.

      Self-corrections are welcome: when the subject updates or contradicts something about themselves (e.g. "je n'aime plus X"), append the updated fact and the curator reconciles the memory.

      If the result has \`appended: false\`, the curator refused the addition (memory budget): do not insist with the same facts.
    `,
    inputSchema: z.object({
      userId: z.string().describe("Discord user ID the stored information relates to"),
      facts: z.string().min(1).max(400).describe("New durable facts only, as stated in the conversation, with Discord mentions <@ID> for anyone referenced besides the subject"),
    }),
    contextSchema: z.object({
      authorId: z.string().describe("Discord user ID of the actual author of the current request, bound server-side and never chosen by the AI"),
    }),
    outputSchema: z.object({
      userId: z.string().describe("Discord user ID"),
      appended: z.boolean().describe("Whether the facts were merged into the memory (false means the curator refused the addition)"),
      memoryText: z.string().nullable().describe("Current memory content after the operation, null if no memory exists"),
      updatedAt: z.string().nullable().describe("Last update date (ISO), null if no memory exists"),
    }),
    execute: async ({ userId, facts }, { context }) => {
      const currentMemory = await userMemoryRepository.get(userId);

      const consolidation = await consolidateUserMemory({
        subjectId: userId,
        authorId: context.authorId,
        facts,
        currentMemoryText: currentMemory?.memoryText ?? null,
      });

      if (!consolidation.appended) {
        return {
          userId,
          appended: false,
          memoryText: currentMemory?.memoryText ?? null,
          updatedAt: currentMemory?.updatedAt.toISOString() ?? null,
        };
      }

      const savedMemory = await userMemoryRepository.save({ userId, memoryText: consolidation.memoryText });

      return {
        userId,
        appended: true,
        memoryText: savedMemory.memoryText,
        updatedAt: savedMemory.updatedAt.toISOString(),
      };
    },
  }),
} satisfies ToolSet;
