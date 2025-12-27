import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { env } from "#/utils/env";

export async function createPaste(content: string, title: string = "Paste"): Promise<string> {
  if (!env.PASTEBIN_API_KEY) {
    throw new Error("PASTEBIN_API_KEY is not configured");
  }

  const formData = new URLSearchParams();
  formData.append('api_dev_key', env.PASTEBIN_API_KEY);
  formData.append('api_option', 'paste');
  formData.append('api_paste_code', content);
  formData.append('api_paste_name', title);
  formData.append('api_paste_private', '1');
  formData.append('api_paste_expire_date', '1W');

  const response = await fetch('https://pastebin.com/api/api_post.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to create paste: ${response.status}`);
  }

  const pasteUrl = await response.text();
  
  if (pasteUrl.startsWith('Bad API request')) {
    throw new Error(`Pastebin API error: ${pasteUrl}`);
  }

  return pasteUrl.trim();
}

export function formatSearchResultsForPaste(results: any[]): string {
  let content = '=== SEARCH RESULTS ===\n\n';
  
  results.forEach((result, index) => {
    content += `${index + 1}. ${result.title}\n`;
    content += `   URL: ${result.url}\n`;
    if (result.snippet) {
      content += `   Description: ${result.snippet}\n`;
    }
    content += '\n';
  });
  
  return content;
}

export function formatTextForPaste(text: string, title: string = "Text Content"): string {
  return `=== ${title.toUpperCase()} ===\n\n${text}`;
}

export const pastebinTools: ToolSet = {
  createPastebin: tool({
    description: "Create a Pastebin link to share large text content. Use this tool when someone asks for a very large text (Bible passages, long code, extensive lists, etc.) or explicitly requests a pastebin. The paste will expire after 1 week and be unlisted (private link).",
    inputSchema: z.object({
      content: z.string().describe("The text content to paste (can be very large)"),
      title: z.string().optional().describe("Title for the paste (e.g., 'Bible - Genesis 1', 'Code Example', etc.)"),
    }),
    outputSchema: z.object({
      url: z.string().describe("Pastebin URL of the created paste"),
      title: z.string().describe("Title of the paste"),
    }),
    execute: async ({ content, title = "Paste" }) => {
      const url = await createPaste(content, title);
      
      return {
        url: url,
        title: title,
      };
    },
  }),
};
