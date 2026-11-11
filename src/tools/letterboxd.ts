import type { ToolSet } from "ai";
import { rss } from "#/utils/rss-parser";
import { tool } from "ai";
import { z } from "zod";

const letterboxdReviewSchema = z.object({
  title: z.string().describe("Film title and rating"),
  link: z.string().describe("Review URL"),
  pubDate: z.string().describe("Publication date"),
  content: z.string().describe("Review content (HTML)"),
  rating: z.string().optional().describe("Rating as stars (e.g. ★★★☆)"),
  creator: z.string().describe("Reviewer username"),
});

export const letterboxdTools: ToolSet = {
  getLatestLetterboxdReview: tool({
    description: "Get the latest review or diary entry from a Letterboxd user's RSS feed.",
    inputSchema: z.object({
      username: z.string().describe("The Letterboxd username"),
    }),
    outputSchema: letterboxdReviewSchema,
    execute: async ({ username }) => {
      const feed = await rss.parseURL(`https://letterboxd.com/${encodeURIComponent(username)}/rss/`);

      if (feed.items.length === 0) {
        throw new Error("No reviews found for this user");
      }

      const latestItem = feed.items[0];
      if (latestItem?.title === undefined || latestItem.title === "" || latestItem.link === undefined || latestItem.link === "") {
        throw new Error("Invalid RSS feed item");
      }

      const ratingMatch = (/★+/u).exec(latestItem.title);

      return {
        title: latestItem.title,
        link: latestItem.link,
        pubDate: latestItem.pubDate ?? "Unknown",
        content: latestItem.content ?? latestItem.contentSnippet ?? "",
        rating: ratingMatch === null ? undefined : ratingMatch[0],
        creator: latestItem.creator ?? username,
      };
    },
  }),

  searchLetterboxdReview: tool({
    description: "Search a Letterboxd user's reviews for a specific film. Returns found: false when the user has not reviewed it.",
    inputSchema: z.object({
      username: z.string().describe("The Letterboxd username"),
      filmTitle: z.string().describe("The title of the film to search for"),
    }),
    outputSchema: z.object({
      found: z.boolean().describe("Whether a matching review was found"),
      title: z.string().optional().describe("Film title and rating"),
      link: z.string().optional().describe("Review URL"),
      pubDate: z.string().optional().describe("Publication date"),
      content: z.string().optional().describe("Review content (HTML)"),
      rating: z.string().optional().describe("Rating as stars (e.g. ★★★☆)"),
      creator: z.string().optional().describe("Reviewer username"),
    }),
    execute: async ({ username, filmTitle }) => {
      const feed = await rss.parseURL(`https://letterboxd.com/${encodeURIComponent(username)}/rss/`);

      if (feed.items.length === 0) {
        return { found: false };
      }

      const searchTerm = filmTitle.toLowerCase().trim();

      const matchingItem = feed.items.find((item) => {
        if (item.title === undefined || item.title === "") {
          return false;
        }
        const itemTitle = item.title.toLowerCase();
        return itemTitle.includes(searchTerm) || searchTerm.includes(itemTitle.replace(/★+/gu, "").trim());
      });

      if (matchingItem?.title === undefined || matchingItem.title === "" || matchingItem.link === undefined || matchingItem.link === "") {
        return { found: false };
      }

      const ratingMatch = (/★+/u).exec(matchingItem.title);

      return {
        found: true,
        title: matchingItem.title,
        link: matchingItem.link,
        pubDate: matchingItem.pubDate ?? "Unknown",
        content: matchingItem.content ?? matchingItem.contentSnippet ?? "",
        rating: ratingMatch === null ? undefined : ratingMatch[0],
        creator: matchingItem.creator ?? username,
      };
    },
  }),
};
