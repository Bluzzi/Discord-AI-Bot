import { searchDuckDuckGo } from "ts-duckduckgo-search";

export const webSearch = async (query: string) => {
  const results = await searchDuckDuckGo(query, {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  });

  return results;
};
