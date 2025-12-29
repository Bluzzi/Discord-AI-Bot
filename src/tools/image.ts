import type { ToolSet } from "ai";
import { tool } from "ai";
import dedent from "dedent";
import { z } from "zod";

export const imageTools: ToolSet = {
  searchImage: tool({
    description: dedent`
      Recherche des images en ligne via l'API Brave Search.
    
      Utilise l'API Brave Image Search pour trouver des images pertinentes selon une requête.
      Retourne une liste d'URLs d'images avec leurs métadonnées (titre, dimensions, source).

      Exemples d'utilisation:
      - "logo Nike" → Trouve le logo de Nike
      - "logo Basic-Fit" → Trouve le logo de Basic-Fit
      - "icône téléphone" → Trouve des icônes de téléphone
      - "illustration montagne" → Trouve des illustrations de montagnes

      Ce tool est particulièrement utile pour:
      - Trouver des logos d'entreprises pour les PDFs
      - Chercher des icônes et illustrations
      - Récupérer des images de produits
      - Trouver des photos pour enrichir du contenu
    `,
    inputSchema: z.object({
      query: z.string().describe("La requête de recherche d'image (ex: 'logo Nike', 'icône téléphone', 'illustration montagne')"),
      count: z.number().optional().describe("Nombre de résultats à retourner (1-20, défaut: 5)"),
      safesearch: z.enum(["off", "moderate", "strict"]).optional().describe("Filtre de contenu adulte (défaut: 'strict')"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Si la recherche a réussi"),
      query: z.string().describe("La requête de recherche utilisée"),
      results: z.array(z.object({
        title: z.string().describe("Titre de l'image"),
        url: z.string().describe("URL de l'image en pleine résolution"),
        thumbnailUrl: z.string().describe("URL de la miniature"),
        source: z.string().describe("Domaine source de l'image"),
        width: z.number().describe("Largeur de l'image en pixels"),
        height: z.number().describe("Hauteur de l'image en pixels"),
      })).describe("Liste des résultats d'images"),
    }),
    execute: async ({ query, count = 5, safesearch = "strict" }) => {
      const apiKey = process.env.BRAVE_SEARCH_API_KEY;
      
      if (!apiKey) {
        throw new Error("BRAVE_SEARCH_API_KEY not configured in environment variables");
      }

      const limitedCount = Math.min(Math.max(count, 1), 20);

      const searchUrl = new URL("https://api.search.brave.com/res/v1/images/search");
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("count", limitedCount.toString());
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
        throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        type: string;
        results: Array<{
          type: string;
          title: string;
          url: string;
          source: string;
          page_fetched: string;
          thumbnail: {
            src: string;
            width: number;
            height: number;
          };
          properties: {
            url: string;
            placeholder: string;
            width: number;
            height: number;
          };
        }>;
      };

      if (!data.results || data.results.length === 0) {
        throw new Error(`No images found for query: ${query}`);
      }

      const results = data.results.map((result) => ({
        title: result.title,
        url: result.properties.url,
        thumbnailUrl: result.thumbnail.src,
        source: result.source,
        width: result.properties.width,
        height: result.properties.height,
      }));

      return {
        success: true,
        query: query,
        results: results,
      };
    },
  }),
};
