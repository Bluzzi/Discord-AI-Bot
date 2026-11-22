import type { DiscordToolName } from "#/tools/discord";
import { discordTools, getDiscordToolInputSchema } from "#/tools/discord";
import { tool } from "ai";
import { z } from "zod";

export type DiscordApprovalAction = { toolName: DiscordToolName; input: Record<string, unknown> };

export const createDiscordApprovalTool = (
  names: DiscordToolName[],
  requestApproval: (actions: DiscordApprovalAction[]) => Promise<{ status: "waiting_approval"; approvalMessageUrl: string }>,
) => {
  const [first, ...rest] = names.map((name) => {
    const description = discordTools[name].description;
    return z.object({
      toolName: z.literal(name),
      input: getDiscordToolInputSchema(name).describe(typeof description === "string" ? description : name),
    });
  });
  if (first === undefined) throw new Error("No Discord actions available for approval");

  return tool({
    description: "Ask the requesting member to approve Discord updates or deletions. Submit all intended changes in execution order. Returns immediately with an approval message URL. The actions are still pending.",
    inputSchema: z.object({ actions: z.array(z.discriminatedUnion("toolName", [first, ...rest])).min(1).max(10) }),
    execute: async ({ actions }) => requestApproval(actions),
  });
};
