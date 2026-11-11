export const rssFeeds = {
  france: { url: "https://theconversation.com/fr/articles.atom" },
  monde: { url: "https://theconversation.com/global/home-page.atom" },
  crypto: { url: "https://coinacademy.fr/actu/gn" },
  tech: { url: "https://feeds.feedburner.com/ign/all" },
} as const;

export type RssFeedCategory = keyof typeof rssFeeds;
