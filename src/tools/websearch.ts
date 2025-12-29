import type { ToolSet } from "ai";
import { webSearch } from "#/utils/web-search";
import { tool } from "ai";
import { z } from "zod";

export const websearchTools: ToolSet = {
  searchInternet: tool({
    description: "Search the internet for information using DuckDuckGo",
    inputSchema: z.object({
      query: z.string().describe("The search query to look up on the internet"),
    }),
    outputSchema: z.object({
      results: z.array(z.object({
        title: z.string().describe("Title of the search result"),
        description: z.string().describe("Description of the search result"),
        url: z.string().describe("URL of the search result"),
      })).describe("Array of search results"),
    }),
    execute: async ({ query }) => {
      const results = await webSearch(query);
      if (results.length === 0) {
        throw new Error(`No results found`);
      }

      return {
        results: results,
      };
    },
  }),
};
