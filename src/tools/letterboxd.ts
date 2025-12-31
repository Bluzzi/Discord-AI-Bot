import type { ToolSet } from "ai";
import { tool } from "ai";
import Parser from "rss-parser";
import { z } from "zod";

const parser = new Parser();

export const letterboxdTools: ToolSet = {
  getLatestLetterboxdReview: tool({
    description: "Get the latest review from a Letterboxd user's RSS feed",
    inputSchema: z.object({
      username: z.string().describe("The Letterboxd username"),
    }),
    outputSchema: z.object({
      title: z.string().describe("Title of the film reviewed"),
      link: z.string().describe("Link to the review"),
      pubDate: z.string().describe("Publication date"),
      content: z.string().describe("Review content (HTML)"),
      rating: z.string().optional().describe("Rating if available"),
      creator: z.string().describe("Username of the reviewer"),
    }),
    execute: async ({ username }) => {
      const rssUrl = `https://letterboxd.com/${username}/rss/`;

      const feed = await parser.parseURL(rssUrl);

      if (!feed.items || feed.items.length === 0) {
        throw new Error("No reviews found for this user");
      }

      const latestItem = feed.items[0];

      if (!latestItem || !latestItem.title || !latestItem.link) {
        throw new Error("Invalid RSS feed item");
      }

      const ratingMatch = (/★+/).exec(latestItem.title);
      const rating = ratingMatch ? ratingMatch[0] : undefined;

      return {
        title: latestItem.title,
        link: latestItem.link,
        pubDate: latestItem.pubDate || "Unknown",
        content: latestItem.content || latestItem.contentSnippet || "",
        rating: rating,
        creator: latestItem.creator || username,
      };
    },
  }),

  searchLetterboxdReview: tool({
    description: "Search for a review of a specific film in a Letterboxd user's RSS feed",
    inputSchema: z.object({
      username: z.string().describe("The Letterboxd username"),
      filmTitle: z.string().describe("The title of the film to search for"),
    }),
    outputSchema: z.object({
      found: z.boolean().describe("Whether a review was found"),
      title: z.string().optional().describe("Title of the film reviewed"),
      link: z.string().optional().describe("Link to the review"),
      pubDate: z.string().optional().describe("Publication date"),
      content: z.string().optional().describe("Review content (HTML)"),
      rating: z.string().optional().describe("Rating if available"),
      creator: z.string().optional().describe("Username of the reviewer"),
    }),
    execute: async ({ username, filmTitle }) => {
      const rssUrl = `https://letterboxd.com/${username}/rss/`;

      const feed = await parser.parseURL(rssUrl);

      if (!feed.items || feed.items.length === 0) {
        return {
          found: false,
        };
      }

      const searchTerm = filmTitle.toLowerCase().trim();

      const matchingItem = feed.items.find((item) => {
        if (!item.title) return false;
        const itemTitle = item.title.toLowerCase();
        return itemTitle.includes(searchTerm) || searchTerm.includes(itemTitle.replace(/★+/g, "").trim());
      });

      if (!matchingItem || !matchingItem.title || !matchingItem.link) {
        return {
          found: false,
        };
      }

      const ratingMatch = (/★+/).exec(matchingItem.title);
      const rating = ratingMatch ? ratingMatch[0] : undefined;

      return {
        found: true,
        title: matchingItem.title,
        link: matchingItem.link,
        pubDate: matchingItem.pubDate || "Unknown",
        content: matchingItem.content || matchingItem.contentSnippet || "",
        rating: rating,
        creator: matchingItem.creator || username,
      };
    },
  }),
};
