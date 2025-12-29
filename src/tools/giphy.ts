import type { ToolSet } from "ai";
import { GiphyFetch } from "@giphy/js-fetch-api";
import { env } from "#/utils/env";
import { tool } from "ai";
import { z } from "zod";

const giphyFetch = new GiphyFetch(env.GIPHY_API_KEY || "");

export const giphyTools: ToolSet = {
  searchGif: tool({
    description: "Recherche un GIF sur Giphy selon un mot-clé ou une phrase. Utilise ce tool avec MODÉRATION - uniquement quand un GIF apporte vraiment de la valeur à la conversation (humour, réaction appropriée, etc.). N'abuse PAS de cet outil.",
    inputSchema: z.object({
      query: z.string().describe("Mot-clé ou phrase pour rechercher un GIF (ex: 'happy', 'celebration', 'confused')"),
      limit: z.number().min(1).max(10).default(1).describe("Nombre de GIFs à récupérer (entre 1 et 10, par défaut 1)"),
    }),
    outputSchema: z.object({
      gifs: z.array(z.object({
        id: z.string().describe("ID du GIF"),
        title: z.string().describe("Titre du GIF"),
        url: z.string().describe("URL du GIF sur Giphy"),
        embedUrl: z.string().describe("URL d'embed du GIF"),
      })).describe("Liste des GIFs trouvés"),
      totalFound: z.number().describe("Nombre de GIFs trouvés"),
    }),
    execute: async ({ query, limit = 1 }) => {
      if (!env.GIPHY_API_KEY) {
        throw new Error("GIPHY_API_KEY is not configured");
      }

      const result = await giphyFetch.search(query, {
        limit: limit,
        rating: "pg-13",
        lang: "fr",
      });

      const gifs = result.data.map((gif) => ({
        id: gif.id,
        title: gif.title,
        url: gif.url,
        embedUrl: gif.embed_url,
      }));

      return {
        gifs: gifs,
        totalFound: result.pagination.total_count,
      };
    },
  }),

  getTrendingGifs: tool({
    description: "Récupère les GIFs tendances du moment sur Giphy. Utilise ce tool avec MODÉRATION.",
    inputSchema: z.object({
      limit: z.number().min(1).max(10).default(5).describe("Nombre de GIFs à récupérer (entre 1 et 10, par défaut 5)"),
    }),
    outputSchema: z.object({
      gifs: z.array(z.object({
        id: z.string().describe("ID du GIF"),
        title: z.string().describe("Titre du GIF"),
        url: z.string().describe("URL du GIF sur Giphy"),
        embedUrl: z.string().describe("URL d'embed du GIF"),
      })).describe("Liste des GIFs tendances"),
      totalFound: z.number().describe("Nombre de GIFs trouvés"),
    }),
    execute: async ({ limit = 5 }) => {
      if (!env.GIPHY_API_KEY) {
        throw new Error("GIPHY_API_KEY is not configured");
      }

      const result = await giphyFetch.trending({
        limit: limit,
        rating: "pg-13",
      });

      const gifs = result.data.map((gif) => ({
        id: gif.id,
        title: gif.title,
        url: gif.url,
        embedUrl: gif.embed_url,
      }));

      return {
        gifs: gifs,
        totalFound: result.pagination.total_count,
      };
    },
  }),
};
