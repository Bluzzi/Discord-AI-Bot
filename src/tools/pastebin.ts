import { env } from "#/utils/env";

export async function createPaste(content: string, title: string = "Search Results"): Promise<string | null> {
  try {
    if (!env.PASTEBIN_API_KEY) {
      console.warn('PASTEBIN_API_KEY not configured, using paste.rs fallback');
      const response = await fetch('https://paste.rs/', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: content,
      });

      if (!response.ok) {
        throw new Error(`Failed to create paste: ${response.status}`);
      }

      const pasteUrl = await response.text();
      return pasteUrl.trim();
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
  } catch (error) {
    console.error('Error creating paste:', error);
    return null;
  }
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
