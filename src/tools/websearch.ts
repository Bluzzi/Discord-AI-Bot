import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";

async function searchWithDuckDuckGoInstant(query: string, maxResults: number): Promise<any[]> {
  const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
  const response = await fetch(searchUrl);
  const data: any = await response.json();

  const results = [];

  if (data.AbstractText && data.AbstractURL) {
    results.push({
      title: data.Heading || 'Summary',
      snippet: data.AbstractText,
      url: data.AbstractURL,
    });
  }

  if (data.RelatedTopics && data.RelatedTopics.length > 0) {
    for (const topic of data.RelatedTopics) {
      if (results.length >= maxResults) break;
      
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.split(' - ')[0] || 'Related',
          snippet: topic.Text,
          url: topic.FirstURL,
        });
      } else if (topic.Topics && Array.isArray(topic.Topics)) {
        for (const subTopic of topic.Topics) {
          if (results.length >= maxResults) break;
          if (subTopic.Text && subTopic.FirstURL) {
            results.push({
              title: subTopic.Text.split(' - ')[0] || 'Related',
              snippet: subTopic.Text,
              url: subTopic.FirstURL,
            });
          }
        }
      }
    }
  }

  return results;
}

async function searchWithHTML(query: string, maxResults: number): Promise<any[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    }
  });
  
  const html = await response.text();
  const results = [];

  const resultBlockRegex = /<div class="result[^"]*"[\s\S]*?<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  
  let match;
  while ((match = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
    if (match[1] && match[2]) {
      let url = match[1];
      if (url.includes('//duckduckgo.com/l/?uddg=')) {
        const urlMatch = url.match(/uddg=([^&]+)/);
        if (urlMatch && urlMatch[1]) {
          url = decodeURIComponent(urlMatch[1]);
        }
      }
      
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      const snippet = match[3] ? match[3].replace(/<[^>]*>/g, '').trim() : '';
      
      if (url && title) {
        results.push({
          title: title,
          url: url,
          snippet: snippet || 'No description available'
        });
      }
    }
  }

  return results;
}

export const websearchTools: ToolSet = {
  searchInternet: tool({
    description: "Search the internet for information using DuckDuckGo",
    inputSchema: z.object({
      query: z.string(),
      maxResults: z.number().optional(),
    }),
    execute: async ({ query, maxResults = 5 }) => {
      let results = await searchWithDuckDuckGoInstant(query, maxResults);
      
      if (results.length === 0) {
        results = await searchWithHTML(query, maxResults);
      }

      if (results.length === 0) {
        throw new Error(`No results found for: ${query}`);
      }

      return results.slice(0, maxResults);
    },
  }),
};
