import type { ToolSet } from "ai";
import { GiphyFetch } from "@giphy/js-fetch-api";
import { env } from "#/utils/env";
import { tool } from "ai";
import { z } from "zod";

const giphyFetch = new GiphyFetch(env.GIPHY_API_KEY || "");

export const giphyTools: ToolSet = {
  searchGif: tool({
    description: `Recherche un GIF sur Giphy selon un mot-clé ou une phrase.

⚠️ RÈGLES ABSOLUES - MODÉRATION STRICTE:
- Utilise les GIFs avec MODÉRATION - uniquement quand ils apportent vraiment de la valeur
- Situations appropriées: réactions humoristiques, célébrations, émotions fortes
- N'ABUSE PAS: maximum 1 GIF par conversation, sauf si explicitement demandé
- Les GIFs doivent être pertinents et appropriés au contexte

⚠️ COMMENT ENVOYER UN GIF:
1. Appelle searchGif avec le mot-clé (ex: "cat" pour un chat)
2. Récupère l'URL du premier GIF dans le résultat (gifs[0].url)
3. Réponds UNIQUEMENT avec cette URL, RIEN D'AUTRE
4. Format de réponse: juste l'URL brute (ex: https://giphy.com/gifs/xxxxx)
5. PAS de texte avant, PAS de texte après, JUSTE L'URL`,
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
    execute: async ({ query, limit }) => {
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
    execute: async ({ limit }) => {
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
