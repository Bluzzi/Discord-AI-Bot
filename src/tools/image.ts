import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";

export const imageTools: ToolSet = {
  searchImage: tool({
    description: "Search for images on the web (Brave Image Search). Add \"PNG transparent\" to the query for logos and icons without background. When the request is to find or send an image, reply with the image URL only, without any text before or after.",
    inputSchema: z.object({
      query: z.string().describe("Image search query (e.g. \"Nike logo PNG transparent\")"),
      count: z.number().int().min(1).max(20).optional().describe("Number of results (default: 5)"),
      safesearch: z.enum(["off", "moderate", "strict"]).optional().describe("Adult content filter (default: strict)"),
    }),
    outputSchema: z.array(z.object({
      title: z.string().describe("Image title"),
      url: z.string().describe("Direct image URL"),
      thumbnailUrl: z.string().describe("Thumbnail URL"),
      source: z.string().describe("Source domain"),
      width: z.number().describe("Image width in pixels"),
      height: z.number().describe("Image height in pixels"),
    })).describe("Image results, best match first"),
    execute: async ({ query, count = 5, safesearch = "strict" }) => {
      const apiKey = process.env.BRAVE_SEARCH_API_KEY;

      if (apiKey === undefined || apiKey === "") {
        throw new Error("BRAVE_SEARCH_API_KEY not configured in environment variables");
      }

      const searchUrl = new URL("https://api.search.brave.com/res/v1/images/search");
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("count", Math.min(Math.max(count, 1), 20).toString());
      searchUrl.searchParams.set("safesearch", safesearch);
      searchUrl.searchParams.set("search_lang", "fr");

      const response = await fetch(searchUrl.toString(), {
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Brave Search API error: ${String(response.status)} ${response.statusText}`);
      }

      const data = await response.json() as {
        results: {
          title: string;
          source: string;
          thumbnail: {
            src: string;
          };
          properties: {
            url: string;
            width: number;
            height: number;
          };
        }[];
      };

      if (data.results.length === 0) {
        throw new Error(`No images found for query: ${query}`);
      }

      return data.results.map((result) => ({
        title: result.title,
        url: result.properties.url,
        thumbnailUrl: result.thumbnail.src,
        source: result.source,
        width: result.properties.width,
        height: result.properties.height,
      }));
    },
  }),
};
