import type { ToolSet } from "ai";
import { env } from "#/utils/env";
import { tool } from "ai";
import { z } from "zod";

export async function getPastebinRawContent(pasteId: string): Promise<string> {
  try {
    const response = await fetch(`https://pastebin.com/raw/${pasteId}`);
    if (!response.ok) return "";
    return await response.text();
  }
  catch {
    return "";
  }
}

export async function createPaste(content: string, title = "Paste"): Promise<string> {
  if (!env.PASTEBIN_API_KEY) {
    throw new Error("PASTEBIN_API_KEY is not configured");
  }

  const formData = new URLSearchParams();
  formData.append("api_dev_key", env.PASTEBIN_API_KEY);
  formData.append("api_option", "paste");
  formData.append("api_paste_code", content);
  formData.append("api_paste_name", title);
  formData.append("api_paste_private", "1");
  formData.append("api_paste_expire_date", "1W");

  const response = await fetch("https://pastebin.com/api/api_post.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to create paste: ${response.status}`);
  }

  const pasteUrl = await response.text();

  if (pasteUrl.startsWith("Bad API request")) {
    throw new Error(`Pastebin API error: ${pasteUrl}`);
  }

  return pasteUrl.trim();
}

export function formatSearchResultsForPaste(results: { title: string; url: string; snippet?: string }[]): string {
  let content = "=== SEARCH RESULTS ===\n\n";

  results.forEach((result, index) => {
    content += `${index + 1}. ${result.title}\n`;
    content += `   URL: ${result.url}\n`;
    if (result.snippet) {
      content += `   Description: ${result.snippet}\n`;
    }
    content += "\n";
  });

  return content;
}

export function formatTextForPaste(text: string, title = "Text Content"): string {
  return `=== ${title.toUpperCase()} ===\n\n${text}`;
}

export const pastebinTools: ToolSet = {
  createPastebin: tool({
    description: `Crée un lien Pastebin pour partager de très gros textes.

⚠️ RÈGLES ABSOLUES:
- Utilise-le quand quelqu'un demande un TRÈS GROS TEXTE (passages de la Bible, longs extraits, code volumineux, listes extensives, etc.)
- Utilise-le quand quelqu'un demande EXPLICITEMENT un pastebin
- Le paste expire après 1 semaine et est privé (lien non-listé)
- Si le texte demandé dépasse 2000 caractères ou si c'est explicitement demandé, utilise createPastebin au lieu de répondre directement

⚠️ IMPORTANT - FORMAT DE RÉPONSE:
- CRITIQUE: Quand tu partages un lien pastebin, tu DOIS envoyer UNIQUEMENT l'URL BRUTE sans AUCUN formatage
- Format INTERDIT: [texte](https://pastebin.com/xxxxx) ❌
- Format OBLIGATOIRE: https://pastebin.com/xxxxx ✅
- Exemple de réponse correcte: "Voilà ton pastebin : https://pastebin.com/xxxxx 😎"
- NE JAMAIS utiliser la syntaxe markdown [lien](url) pour les liens pastebin

⚠️ SI L'UTILISATEUR DEMANDE UN PDF, DONNE LUI UN PDF, PAS UN PASTEBIN`,
    inputSchema: z.object({
      content: z.string().describe("The text content to paste (can be very large)"),
      title: z.string().optional().describe("Title for the paste (e.g., 'Bible - Genesis 1', 'Code Example', etc.)"),
    }),
    outputSchema: z.object({
      url: z.string().describe("Pastebin URL of the created paste"),
      title: z.string().describe("Title of the paste"),
    }),
    execute: async ({ content, title = "Paste" }: { content: string; title?: string }) => {
      const url = await createPaste(content, title);

      return {
        url: url,
        title: title,
      };
    },
  }),
};
