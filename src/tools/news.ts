import type { ToolSet } from "ai";
import { rssFeeds } from "#/utils/rss-feeds";
import { rss } from "#/utils/rss-parser";
import { tool } from "ai";
import dedent from "dedent";
import { z } from "zod";

export const newsTools: ToolSet = {
  getNews: tool({
    description: dedent`
      Get the latest news from a curated RSS feed, optionally filtered by keywords.

      Categories:
      - france: French news (The Conversation France)
      - monde: world news (The Conversation Global)
      - crypto: cryptocurrency news (Coin Academy)
      - tech: video games and entertainment news (IGN)

      Present the articles as title + link, 5 to 10 articles maximum unless the user explicitly asks for more.
    `,
    inputSchema: z.object({
      category: z.enum(["france", "monde", "crypto", "tech"]).describe("News category"),
      keywords: z.string().optional().describe("Space-separated keywords to filter articles by title and content (e.g. \"bitcoin IA\")"),
      limit: z.number().int().min(1).max(20).optional().describe("Number of articles to return (default: 5)"),
    }),
    outputSchema: z.array(z.object({
      title: z.string().describe("Article title"),
      link: z.string().describe("Article URL"),
      pubDate: z.string().optional().describe("Publication date"),
      contentSnippet: z.string().optional().describe("Content excerpt"),
    })).describe("Matching articles, most recent first"),
    execute: async ({ category, keywords, limit = 5 }) => {
      const feed = await rss.parseURL(rssFeeds[category].url);

      let items = feed.items;
      if (keywords !== undefined && keywords !== "") {
        const terms = keywords.toLowerCase().split(/\s+/u);
        items = items.filter((item) => {
          const haystack = `${item.title ?? ""} ${item.contentSnippet ?? ""}`.toLowerCase();
          return terms.some((term) => haystack.includes(term));
        });
      }

      return items.slice(0, limit).map((item) => ({
        title: item.title ?? "Untitled",
        link: item.link ?? "",
        pubDate: item.pubDate,
        contentSnippet: item.contentSnippet,
      }));
    },
  }),
};
