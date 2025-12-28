import type { ToolSet } from "ai";
import { env } from "../utils/env";
import { tool } from "ai";
import { z } from "zod";

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (env.IGDB_ACCESS_TOKEN) {
    return env.IGDB_ACCESS_TOKEN;
  }

  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  if (!env.IGDB_CLIENT_ID || !env.IGDB_CLIENT_SECRET) {
    throw new Error("IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are required when IGDB_ACCESS_TOKEN is not provided");
  }

  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${env.IGDB_CLIENT_ID}&client_secret=${env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000;

  return cachedAccessToken;
}

async function igdbRequest(endpoint: string, body: string): Promise<any> {
  const accessToken = await getAccessToken();

  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": env.IGDB_CLIENT_ID,
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "text/plain",
    },
    body: body,
  });

  if (!response.ok) {
    throw new Error(`IGDB API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const igdbTools: ToolSet = {
  searchGame: tool({
    description: "Search for a game on IGDB by name",
    inputSchema: z.object({
      gameName: z.string().describe("The name of the game to search for"),
      limit: z.number().optional().describe("Optional maximum number of results to return (default: 5)"),
    }),
    outputSchema: z.object({
      games: z.array(z.object({
        id: z.number().describe("IGDB game ID"),
        name: z.string().describe("Game name"),
        releaseDate: z.string().describe("Release date in French format"),
        summary: z.string().describe("Game summary/description"),
        rating: z.number().nullable().describe("User rating (0-100)"),
        ratingCount: z.number().describe("Number of ratings"),
        coverUrl: z.string().nullable().describe("URL to game cover image"),
        platforms: z.string().describe("Comma-separated list of platforms"),
        genres: z.string().describe("Comma-separated list of genres"),
        developers: z.string().describe("Comma-separated list of developers"),
        publishers: z.string().describe("Comma-separated list of publishers"),
      })).describe("List of games found"),
      count: z.number().describe("Number of games found"),
    }),
    execute: async ({ gameName, limit = 5 }) => {
      const query = `
        search "${gameName}";
        fields name, first_release_date, summary, rating, rating_count, cover.url, platforms.name, genres.name, involved_companies.company.name, involved_companies.developer, involved_companies.publisher;
        limit ${limit};
      `;

      const results = await igdbRequest("games", query);

      if (!results || results.length === 0) {
        throw new Error("No games found with that name");
      }

      const games = results.map((game: any) => {
        const releaseDate = game.first_release_date
          ? new Date(game.first_release_date * 1000).toLocaleDateString("fr-FR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : "Date inconnue";

        const developers = game.involved_companies
          ?.filter((ic: any) => ic.developer)
          .map((ic: any) => ic.company.name)
          .join(", ") || "Inconnu";

        const publishers = game.involved_companies
          ?.filter((ic: any) => ic.publisher)
          .map((ic: any) => ic.company.name)
          .join(", ") || "Inconnu";

        return {
          id: game.id,
          name: game.name,
          releaseDate: releaseDate,
          summary: game.summary || "Pas de description disponible",
          rating: game.rating ? Math.round(game.rating) : null,
          ratingCount: game.rating_count || 0,
          coverUrl: game.cover?.url ? `https:${game.cover.url.replace("t_thumb", "t_cover_big")}` : null,
          platforms: game.platforms?.map((p: any) => p.name).join(", ") || "Inconnu",
          genres: game.genres?.map((g: any) => g.name).join(", ") || "Inconnu",
          developers: developers,
          publishers: publishers,
        };
      });

      return {
        games,
        count: games.length,
      };
    },
  }),

  getGameDetails: tool({
    description: "Get detailed information about a specific game by its IGDB ID",
    inputSchema: z.object({
      gameId: z.number().describe("The IGDB game ID to get details for"),
    }),
    outputSchema: z.object({
      id: z.number().describe("IGDB game ID"),
      name: z.string().describe("Game name"),
      releaseDate: z.string().describe("Release date in French format"),
      summary: z.string().describe("Game summary/description"),
      storyline: z.string().nullable().describe("Game storyline"),
      rating: z.number().nullable().describe("User rating (0-100)"),
      ratingCount: z.number().describe("Number of user ratings"),
      aggregatedRating: z.number().nullable().describe("Aggregated critic rating (0-100)"),
      aggregatedRatingCount: z.number().describe("Number of critic ratings"),
      coverUrl: z.string().nullable().describe("URL to game cover image"),
      screenshots: z.array(z.string()).describe("Array of screenshot URLs"),
      platforms: z.string().describe("Comma-separated list of platforms"),
      genres: z.string().describe("Comma-separated list of genres"),
      themes: z.string().nullable().describe("Comma-separated list of themes"),
      gameModes: z.string().nullable().describe("Comma-separated list of game modes"),
      perspectives: z.string().nullable().describe("Comma-separated list of player perspectives"),
      developers: z.string().describe("Comma-separated list of developers"),
      publishers: z.string().describe("Comma-separated list of publishers"),
      officialWebsite: z.string().nullable().describe("Official website URL"),
      youtubeVideo: z.string().nullable().describe("YouTube video URL"),
    }),
    execute: async ({ gameId }) => {
      const query = `
        fields name, first_release_date, summary, storyline, rating, rating_count, aggregated_rating, aggregated_rating_count, cover.url, screenshots.url, platforms.name, genres.name, themes.name, game_modes.name, player_perspectives.name, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, websites.url, websites.category, videos.video_id;
        where id = ${gameId};
      `;

      const results = await igdbRequest("games", query);

      if (!results || results.length === 0) {
        throw new Error("Game not found");
      }

      const game = results[0];

      const releaseDate = game.first_release_date
        ? new Date(game.first_release_date * 1000).toLocaleDateString("fr-FR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "Date inconnue";

      const developers = game.involved_companies
        ?.filter((ic: any) => ic.developer)
        .map((ic: any) => ic.company.name)
        .join(", ") || "Inconnu";

      const publishers = game.involved_companies
        ?.filter((ic: any) => ic.publisher)
        .map((ic: any) => ic.company.name)
        .join(", ") || "Inconnu";

      const officialWebsite = game.websites?.find((w: any) => w.category === 1);
      const youtubeVideo = game.videos?.[0]?.video_id
        ? `https://www.youtube.com/watch?v=${game.videos[0].video_id}`
        : null;

      return {
        id: game.id,
        name: game.name,
        releaseDate: releaseDate,
        summary: game.summary || "Pas de description disponible",
        storyline: game.storyline || null,
        rating: game.rating ? Math.round(game.rating) : null,
        ratingCount: game.rating_count || 0,
        aggregatedRating: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
        aggregatedRatingCount: game.aggregated_rating_count || 0,
        coverUrl: game.cover?.url ? `https:${game.cover.url.replace("t_thumb", "t_cover_big")}` : null,
        screenshots: game.screenshots?.map((s: any) => `https:${s.url.replace("t_thumb", "t_screenshot_big")}`).slice(0, 3) || [],
        platforms: game.platforms?.map((p: any) => p.name).join(", ") || "Inconnu",
        genres: game.genres?.map((g: any) => g.name).join(", ") || "Inconnu",
        themes: game.themes?.map((t: any) => t.name).join(", ") || null,
        gameModes: game.game_modes?.map((gm: any) => gm.name).join(", ") || null,
        perspectives: game.player_perspectives?.map((pp: any) => pp.name).join(", ") || null,
        developers: developers,
        publishers: publishers,
        officialWebsite: officialWebsite?.url || null,
        youtubeVideo: youtubeVideo,
      };
    },
  }),
};
