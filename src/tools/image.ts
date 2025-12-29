import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";

export const imageTools: ToolSet = {
  searchImage: tool({
    description: `Recherche des images en ligne via l'API Brave Search.

⚠️ RÈGLES ABSOLUES:
- Utilise searchImage quand quelqu'un demande une image, un logo, une icône, une illustration
- Pour les logos d'entreprises: cherche "logo [nom entreprise] PNG transparent"
- Pour les icônes: cherche "icône [sujet] PNG transparent"
- Le tool retourne une liste d'images avec leurs URLs

⚠️ COMMENT ENVOYER UNE IMAGE - PROCESSUS COMPLET:
1. Appelle searchImage avec la requête (ex: "logo Nike PNG transparent")
2. ATTENDS que le tool s'exécute et retourne son résultat
3. Le tool retourne un objet avec results[0].url contenant l'URL de l'image
4. Réponds DIRECTEMENT avec l'URL de l'image récupérée, RIEN D'AUTRE
5. Format de réponse: juste l'URL brute (ex: https://example.com/image.png)
6. PAS de texte avant, PAS de texte après, JUSTE L'URL
7. Discord affichera automatiquement l'image si l'URL est directe

⚠️ INTERDIT:
- N'affiche JAMAIS le JSON du tool call (ex: searchImage{...})
- N'affiche JAMAIS les paramètres de recherche
- ATTENDS toujours le résultat avant de répondre

EXEMPLES D'UTILISATION:
- "logo Nike" → Trouve le logo de Nike
- "logo Basic-Fit PNG transparent" → Trouve le logo de Basic-Fit sans fond
- "icône téléphone PNG" → Trouve des icônes de téléphone
- "illustration montagne" → Trouve des illustrations de montagnes`,
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
