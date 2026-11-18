import Parser from "rss-parser";

// Parser instance shared by every RSS-based tool:
const parser = new Parser();

export const rssFeeds = {
  france: { url: "https://theconversation.com/fr/articles.atom" },
  monde: { url: "https://theconversation.com/global/home-page.atom" },
  crypto: { url: "https://coinacademy.fr/actu/gn" },
  tech: { url: "https://feeds.feedburner.com/ign/all" },
} as const;

export type RssFeedCategory = keyof typeof rssFeeds;

/** Fetch a curated feed by category */
export const fetchFeed = async (category: RssFeedCategory) => parser.parseURL(rssFeeds[category].url);

/** Fetch any RSS/Atom feed by URL (for feeds outside the curated list) */
export const parseFeed = async (url: string) => parser.parseURL(url);
