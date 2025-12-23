import type { ToolSet } from "ai";
import { tool } from "ai";
import z from "zod";

export const discordTools: ToolSet = {
  test: tool({
    description: "Get the weather in a location",
    inputSchema: z.object({
      location: z.string().describe("The location to get the weather for"),
    }),
    execute: ({ location }) => ({
      location,
      temperature: 72 + Math.floor(Math.random() * 21) - 10,
    }),
  }),
};
