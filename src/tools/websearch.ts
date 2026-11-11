import type { ToolSet } from "ai";
import { webSearch } from "#/utils/web-search";
import { tool } from "ai";
import { z } from "zod";

export const websearchTools: ToolSet = {
  searchInternet: tool({
    description: "Search the internet for current information (DuckDuckGo). Returns page titles, descriptions and URLs.",
    inputSchema: z.object({
      query: z.string().describe("The search query"),
    }),
    outputSchema: z.array(z.object({
      title: z.string().describe("Result title"),
      description: z.string().describe("Result description"),
      url: z.string().describe("Result URL"),
    })).describe("Search results, most relevant first"),
    execute: async ({ query }) => {
      const results = await webSearch(query);

      if (results.length === 0) {
        throw new Error("No results found for this query");
      }

      return results;
    },
  }),
};
