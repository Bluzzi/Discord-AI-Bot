import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { discord } from "#/discord";

const STEAM_API_KEY = process.env.STEAM_API_KEY || "";

interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
  playtime_2weeks?: number;
  img_icon_url?: string;
  img_logo_url?: string;
}

interface SteamAchievement {
  apiname: string;
  achieved: number;
  unlocktime: number;
  name?: string;
  description?: string;
}

async function resolveVanityUrl(vanityUrl: string): Promise<any> {
  if (!STEAM_API_KEY) {
    throw new Error("Steam API key not configured");
  }

  const response = await fetch(
    `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${vanityUrl}`
  );

  if (!response.ok) {
    throw new Error(`Steam API error: ${response.statusText}`);
  }

  const data: any = await response.json();

  if (!data.response || data.response.success !== 1) {
    throw new Error("Username not found");
  }

  return {
    steamid: data.response.steamid,
    success: true
  };
}

async function getUserGames(steamId: string): Promise<any> {
  if (!STEAM_API_KEY) {
    throw new Error("Steam API key not configured");
  }

  const response = await fetch(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`
  );

  if (!response.ok) {
    throw new Error(`Steam API error: ${response.statusText}`);
  }

  const data: any = await response.json();

  if (!data.response || !data.response.games) {
    throw new Error("No games found or profile is private");
  }

  const games: SteamGame[] = data.response.games;
  const gameCount = data.response.game_count;

  return {
    game_count: gameCount,
    games: games.map((game: SteamGame) => ({
      appid: game.appid,
      name: game.name,
      playtime_hours: Math.round(game.playtime_forever / 60 * 10) / 10,
      playtime_2weeks_hours: game.playtime_2weeks ? Math.round(game.playtime_2weeks / 60 * 10) / 10 : 0
    }))
  };
}

async function getUserGamePlaytime(steamId: string, appId: number): Promise<any> {
  if (!STEAM_API_KEY) {
    throw new Error("Steam API key not configured");
  }

  const response = await fetch(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1&format=json`
  );

  if (!response.ok) {
    throw new Error(`Steam API error: ${response.statusText}`);
  }

  const data: any = await response.json();

  if (!data.response || !data.response.games) {
    throw new Error("No games found or profile is private");
  }

  const game = data.response.games.find((g: SteamGame) => g.appid === appId);

  if (!game) {
    throw new Error("Game not found in user's library");
  }

  return {
    appid: game.appid,
    name: game.name,
    playtime_hours: Math.round(game.playtime_forever / 60 * 10) / 10,
    playtime_2weeks_hours: game.playtime_2weeks ? Math.round(game.playtime_2weeks / 60 * 10) / 10 : 0
  };
}

async function getUserAchievements(steamId: string, appId: number): Promise<any> {
  if (!STEAM_API_KEY) {
    throw new Error("Steam API key not configured");
  }

  const response = await fetch(
    `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${STEAM_API_KEY}&steamid=${steamId}&appid=${appId}&l=french`
  );

  if (!response.ok) {
    throw new Error(`Steam API error: ${response.statusText}`);
  }

  const data: any = await response.json();

  if (!data.playerstats || !data.playerstats.achievements) {
    throw new Error("No achievements found or profile is private");
  }

  const achievements: SteamAchievement[] = data.playerstats.achievements;
  const totalAchievements = achievements.length;
  const unlockedAchievements = achievements.filter(a => a.achieved === 1).length;
  const percentage = Math.round((unlockedAchievements / totalAchievements) * 100);

  return {
    game_name: data.playerstats.gameName,
    total_achievements: totalAchievements,
    unlocked_achievements: unlockedAchievements,
    completion_percentage: percentage,
    recent_achievements: achievements
      .filter(a => a.achieved === 1)
      .sort((a, b) => b.unlocktime - a.unlocktime)
      .slice(0, 5)
      .map(a => ({
        name: a.name || a.apiname,
        description: a.description,
        unlocked_at: new Date(a.unlocktime * 1000).toISOString()
      }))
  };
}

async function getUserInventory(steamId: string, appId: number = 730): Promise<any> {
  const response = await fetch(
    `https://steamcommunity.com/inventory/${steamId}/${appId}/2?l=french&count=100`
  );

  if (!response.ok) {
    throw new Error(`Steam API error: ${response.statusText}`);
  }

  const data: any = await response.json();

  if (!data.assets || !data.descriptions) {
    throw new Error("No inventory found or profile is private");
  }

  const itemCounts = new Map<string, { count: number; description: any }>();

  data.assets.forEach((asset: any) => {
    const description = data.descriptions.find(
      (d: any) => d.classid === asset.classid && d.instanceid === asset.instanceid
    );

    if (description) {
      const key = description.market_hash_name || description.name;
      if (itemCounts.has(key)) {
        itemCounts.get(key)!.count++;
      } else {
        itemCounts.set(key, { count: 1, description });
      }
    }
  });

  const items = Array.from(itemCounts.entries()).map(([name, data]) => ({
    name: data.description.name || "Unknown",
    type: data.description.type || "Unknown",
    count: data.count,
    tradable: data.description.tradable === 1,
    marketable: data.description.marketable === 1,
    rarity: data.description.tags?.find((t: any) => t.category === 'Rarity')?.localized_tag_name,
    weapon: data.description.tags?.find((t: any) => t.category === 'Weapon')?.localized_tag_name,
  }));

  const rarityOrder: { [key: string]: number } = {
    'Extraordinaire': 1,
    'Exotique': 2,
    'Classifiée': 3,
    'Restreinte': 4,
    'De qualité militaire': 5,
    'De qualité industrielle': 6,
    'De qualité grand public': 7
  };

  items.sort((a, b) => {
    const rarityA = rarityOrder[a.rarity || ''] || 999;
    const rarityB = rarityOrder[b.rarity || ''] || 999;
    return rarityA - rarityB;
  });

  return {
    total_items: data.assets.length,
    unique_items: items.length,
    items: items.slice(0, 15)
  };
}

export const steamTools: ToolSet = {
  resolveSteamUsername: tool({
    description: "Convert a Steam username (vanity URL) to a Steam ID 64-bit. Use this when you have a username instead of a Steam ID.",
    inputSchema: z.object({
      username: z.string(),
    }),
    execute: async ({ username }) => {
      return await resolveVanityUrl(username);
    },
  }),

  getSteamUserGames: tool({
    description: "Get the list of games owned by a Steam user. Returns game names and playtime.",
    inputSchema: z.object({
      steamId: z.string(),
    }),
    execute: async ({ steamId }) => {
      return await getUserGames(steamId);
    },
  }),

  getSteamUserGamePlaytime: tool({
    description: "Get the playtime (hours) for a specific game owned by a Steam user.",
    inputSchema: z.object({
      steamId: z.string(),
      appId: z.number(),
    }),
    execute: async ({ steamId, appId }) => {
      return await getUserGamePlaytime(steamId, appId);
    },
  }),

  getSteamUserAchievements: tool({
    description: "Get the achievements for a specific game owned by a Steam user. Shows completion percentage and recent unlocks.",
    inputSchema: z.object({
      steamId: z.string(),
      appId: z.number(),
    }),
    execute: async ({ steamId, appId }) => {
      return await getUserAchievements(steamId, appId);
    },
  }),

  getSteamUserInventory: tool({
    description: "Get the inventory items for a Steam user. By default shows CS:GO inventory (appId 730).",
    inputSchema: z.object({
      steamId: z.string(),
      appId: z.number().optional(),
    }),
    execute: async ({ steamId, appId = 730 }) => {
      return await getUserInventory(steamId, appId);
    },
  }),

  findMostPlayedGame: tool({
    description: "Find the most played game of a Steam user. Returns the game with the highest playtime.",
    inputSchema: z.object({
      steamId: z.string(),
    }),
    execute: async ({ steamId }) => {
      const gamesResult = await getUserGames(steamId);

      if (!gamesResult.games || gamesResult.games.length === 0) {
        throw new Error("No games found");
      }

      const mostPlayed = gamesResult.games.reduce((max: any, game: any) => 
        game.playtime_hours > max.playtime_hours ? game : max
      );

      return {
        name: mostPlayed.name,
        appid: mostPlayed.appid,
        playtime_hours: mostPlayed.playtime_hours
      };
    },
  }),
};
