import type { ToolSet } from "ai";
import { rss } from "#/utils/rss-parser";
import { tool } from "ai";
import { z } from "zod";

const RSS_FEEDS = {
  france: {
    url: "https://theconversation.com/fr/articles.atom",
    description: "Actualités françaises - The Conversation France",
  },
  monde: {
    url: "https://theconversation.com/global/home-page.atom",
    description: "Actualités mondiales - The Conversation Global",
  },
  crypto: {
    url: "https://coinacademy.fr/actu/gn",
    description: "Actualités crypto-monnaies - Coin Academy",
  },
  tech: {
    url: "https://feeds.feedburner.com/ign/all",
    description: "Actualités technologie - IGN",
  },
} as const;

type RssFeedKey = keyof typeof RSS_FEEDS;

export const newsTools: ToolSet = {
  getLatestNews: tool({
    description: `Récupère les dernières actualités depuis différents flux RSS.

CATÉGORIES DISPONIBLES:
- "france": Actualités françaises (The Conversation France)
- "monde": Actualités mondiales (The Conversation Global)
- "crypto": Actualités crypto-monnaies (Coin Academy)
- "tech": Actualités technologie (IGN)

⚠️ RÈGLES:
- Utilise getLatestNews pour avoir un aperçu général des dernières actualités d'une catégorie
- Présente les résultats de manière concise avec titre + lien
- NE récupère PAS tout le flux, utilise la limite appropriée (5-10 articles max sauf demande spécifique)`,
    inputSchema: z.object({
      category: z.enum(["france", "monde", "crypto", "tech"]).describe("Catégorie d'actualités à récupérer: 'france' pour actualités françaises, 'monde' pour actualités mondiales, 'crypto' pour crypto-monnaies, 'tech' pour technologie"),
      limit: z.number().min(1).max(20).default(5).describe("Nombre d'articles à récupérer (entre 1 et 20, par défaut 5)"),
    }),
    outputSchema: z.object({
      category: z.string().describe("Catégorie des actualités"),
      articles: z.array(z.object({
        title: z.string().describe("Titre de l'article"),
        link: z.string().describe("Lien vers l'article"),
        pubDate: z.string().optional().describe("Date de publication"),
        contentSnippet: z.string().optional().describe("Extrait du contenu"),
      })).describe("Liste des articles récupérés"),
      totalArticles: z.number().describe("Nombre total d'articles récupérés"),
    }),
    execute: async ({ category, limit }) => {
      const feedConfig = RSS_FEEDS[category];

      if (!feedConfig) {
        throw new Error(`Catégorie invalide: ${category}`);
      }

      const feed = await rss.parseURL(feedConfig.url);

      const articles = feed.items.slice(0, limit).map((item) => ({
        title: item.title || "Sans titre",
        link: item.link || "",
        pubDate: item.pubDate,
        contentSnippet: item.contentSnippet,
      }));

      return {
        category: category,
        articles: articles,
        totalArticles: articles.length,
      };
    },
  }),

  searchNewsInFeed: tool({
    description: `Recherche des actualités spécifiques dans un flux RSS en filtrant par mots-clés.

⚠️ RÈGLES:
- Utilise searchNewsInFeed quand on cherche des news sur un sujet précis (ex: "actualités sur Bitcoin", "news IA")
- Présente les résultats de manière concise avec titre + lien`,
    inputSchema: z.object({
      category: z.enum(["france", "monde", "crypto", "tech"]).describe("Catégorie d'actualités à rechercher"),
      keywords: z.string().describe("Mots-clés à rechercher dans les titres et contenus des articles (ex: 'bitcoin', 'IA', 'politique')"),
      limit: z.number().min(1).max(20).default(10).describe("Nombre maximum d'articles à analyser (entre 1 et 20, par défaut 10)"),
    }),
    outputSchema: z.object({
      category: z.string().describe("Catégorie des actualités"),
      keywords: z.string().describe("Mots-clés recherchés"),
      articles: z.array(z.object({
        title: z.string().describe("Titre de l'article"),
        link: z.string().describe("Lien vers l'article"),
        pubDate: z.string().optional().describe("Date de publication"),
        contentSnippet: z.string().optional().describe("Extrait du contenu"),
      })).describe("Liste des articles correspondant aux mots-clés"),
      totalFound: z.number().describe("Nombre d'articles trouvés"),
    }),
    execute: async ({ category, keywords, limit }) => {
      const feedConfig = RSS_FEEDS[category];

      if (!feedConfig) {
        throw new Error(`Catégorie invalide: ${category}`);
      }

      const feed = await rss.parseURL(feedConfig.url);

      const searchTerms = keywords.toLowerCase().split(/\s+/);

      const matchingArticles = feed.items
        .slice(0, limit)
        .filter((item) => {
          const title = (item.title || "").toLowerCase();
          const content = (item.contentSnippet || "").toLowerCase();
          const combined = `${title} ${content}`;

          return searchTerms.some((term) => combined.includes(term));
        })
        .map((item) => ({
          title: item.title || "Sans titre",
          link: item.link || "",
          pubDate: item.pubDate,
          contentSnippet: item.contentSnippet,
        }));

      return {
        category: category,
        keywords: keywords,
        articles: matchingArticles,
        totalFound: matchingArticles.length,
      };
    },
  }),
};
