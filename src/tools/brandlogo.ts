import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";

export const brandlogoTools: ToolSet = {
  searchBrandLogo: tool({
    description: `Recherche le logo d'une entreprise par son nom de marque.
    
Utilise l'API Logo.dev pour trouver le domaine et l'URL du logo d'une entreprise.
Retourne l'URL du logo au format PNG haute qualité.

Exemples d'utilisation:
- "Nike" → https://img.logo.dev/nike.com
- "Basic-Fit" → https://img.logo.dev/basic-fit.com
- "Apple" → https://img.logo.dev/apple.com

Ce tool est particulièrement utile pour générer des PDFs avec des logos d'entreprises.`,
    inputSchema: z.object({
      brandName: z.string().describe("Le nom de la marque/entreprise à rechercher (ex: 'Nike', 'Basic-Fit', 'Apple')"),
      strategy: z.enum(["typeahead", "match"]).optional().describe("Stratégie de recherche: 'typeahead' pour autocomplétion (défaut), 'match' pour correspondance exacte"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Si la recherche a réussi"),
      brandName: z.string().describe("Nom de la marque trouvée"),
      domain: z.string().describe("Domaine de l'entreprise"),
      logoUrl: z.string().describe("URL du logo (format PNG haute qualité)"),
    }),
    execute: async ({ brandName, strategy = "match" }) => {
      const apiKey = process.env.LOGO_DEV_SECRET_KEY;
      
      if (!apiKey) {
        throw new Error("LOGO_DEV_SECRET_KEY not configured in environment variables");
      }

      const searchUrl = `https://api.logo.dev/search?q=${encodeURIComponent(brandName)}&strategy=${strategy}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Logo.dev API error: ${response.status} ${response.statusText}`);
      }

      const results = await response.json() as Array<{ name: string; domain: string }>;

      if (!results || results.length === 0) {
        throw new Error(`No logo found for brand: ${brandName}`);
      }

      const firstResult = results[0];
      
      if (!firstResult) {
        throw new Error(`No logo found for brand: ${brandName}`);
      }
      
      const publishableKey = process.env.LOGO_DEV_PUBLISHABLE_KEY;
      
      if (!publishableKey) {
        throw new Error("LOGO_DEV_PUBLISHABLE_KEY not configured in environment variables");
      }

      const logoUrl = `https://img.logo.dev/${firstResult.domain}?token=${publishableKey}&format=png&size=200`;

      return {
        success: true,
        brandName: firstResult.name,
        domain: firstResult.domain,
        logoUrl: logoUrl,
      };
    },
  }),
};
