import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { env } from "../utils/env";

const STEAM_API_KEY = process.env.STEAM_API_KEY || "";

export const steamTools: ToolSet = {
  resolveSteamUsername: tool({
    description: "Convert a Steam username (vanity URL) to a Steam ID 64-bit. Use this when you have a username instead of a Steam ID.",
    inputSchema: z.object({
      username: z.string().describe("The Steam username (vanity URL) to convert to Steam ID"),
    }),
    outputSchema: z.object({
      steamid: z.string().describe("The 64-bit Steam ID"),
      username: z.string().describe("The username that was resolved"),
    }),
    execute: async ({ username }) => {
      if (!STEAM_API_KEY) {
        throw new Error("Steam API key not configured");
      }

      const response = await fetch(
        `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${username}`
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
        username: username,
      };
    },
  }),

  getSteamUserGames: tool({
    description: "Get the list of games owned by a Steam user. Returns game names and playtime.",
    inputSchema: z.object({
      steamId: z.string().describe("The Steam ID 64-bit of the user"),
    }),
    outputSchema: z.object({
      gameCount: z.number().describe("Total number of games owned"),
      games: z.array(z.object({
        appid: z.number().describe("Steam app ID"),
        name: z.string().describe("Game name"),
        playtimeHours: z.number().describe("Total playtime in hours"),
        playtime2WeeksHours: z.number().describe("Playtime in the last 2 weeks in hours"),
      })).describe("List of games owned"),
    }),
    execute: async ({ steamId }) => {
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

      const games = data.response.games.map((game: any) => ({
        appid: game.appid,
        name: game.name,
        playtimeHours: Math.round(game.playtime_forever / 60 * 10) / 10,
        playtime2WeeksHours: game.playtime_2weeks ? Math.round(game.playtime_2weeks / 60 * 10) / 10 : 0
      }));

      return {
        gameCount: data.response.game_count,
        games: games,
      };
    },
  }),

  getSteamUserGamePlaytime: tool({
    description: "Get the playtime (hours) for a specific game owned by a Steam user.",
    inputSchema: z.object({
      steamId: z.string().describe("The Steam ID 64-bit of the user"),
      appId: z.number().describe("The Steam app ID of the game"),
    }),
    outputSchema: z.object({
      appid: z.number().describe("Steam app ID"),
      name: z.string().describe("Game name"),
      playtimeHours: z.number().describe("Total playtime in hours"),
      playtime2WeeksHours: z.number().describe("Playtime in the last 2 weeks in hours"),
    }),
    execute: async ({ steamId, appId }) => {
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

      const game = data.response.games.find((g: any) => g.appid === appId);

      if (!game) {
        throw new Error("Game not found in user's library");
      }

      return {
        appid: game.appid,
        name: game.name,
        playtimeHours: Math.round(game.playtime_forever / 60 * 10) / 10,
        playtime2WeeksHours: game.playtime_2weeks ? Math.round(game.playtime_2weeks / 60 * 10) / 10 : 0
      };
    },
  }),

  getSteamUserAchievements: tool({
    description: "Get the achievements for a specific game owned by a Steam user. Shows completion percentage and recent unlocks.",
    inputSchema: z.object({
      steamId: z.string().describe("The Steam ID 64-bit of the user"),
      appId: z.number().describe("The Steam app ID of the game"),
    }),
    outputSchema: z.object({
      gameName: z.string().describe("Name of the game"),
      totalAchievements: z.number().describe("Total number of achievements"),
      unlockedAchievements: z.number().describe("Number of unlocked achievements"),
      completionPercentage: z.number().describe("Completion percentage (0-100)"),
      recentAchievements: z.array(z.object({
        name: z.string().describe("Achievement name"),
        description: z.string().optional().describe("Achievement description"),
        unlockedAt: z.string().describe("ISO timestamp when unlocked"),
      })).describe("5 most recent achievements unlocked"),
    }),
    execute: async ({ steamId, appId }) => {
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

      const achievements = data.playerstats.achievements;
      const totalAchievements = achievements.length;
      const unlockedAchievements = achievements.filter((a: any) => a.achieved === 1).length;
      const percentage = Math.round((unlockedAchievements / totalAchievements) * 100);

      return {
        gameName: data.playerstats.gameName,
        totalAchievements: totalAchievements,
        unlockedAchievements: unlockedAchievements,
        completionPercentage: percentage,
        recentAchievements: achievements
          .filter((a: any) => a.achieved === 1)
          .sort((a: any, b: any) => b.unlocktime - a.unlocktime)
          .slice(0, 5)
          .map((a: any) => ({
            name: a.name || a.apiname,
            description: a.description,
            unlockedAt: new Date(a.unlocktime * 1000).toISOString()
          }))
      };
    },
  }),

  getSteamUserInventory: tool({
    description: "Get the inventory items for a Steam user. By default shows CS:GO inventory (appId 730).",
    inputSchema: z.object({
      steamId: z.string().describe("The Steam ID 64-bit of the user"),
      appId: z.number().optional().describe("Optional Steam app ID for the inventory (default: 730 for CS:GO)"),
    }),
    execute: async ({ steamId, appId = 730 }) => {
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
        totalItems: data.assets.length,
        uniqueItems: items.length,
        items: items.slice(0, 15)
      };
    },
  }),

  findMostPlayedGame: tool({
    description: "Find the most played game of a Steam user. Returns the game with the highest playtime.",
    inputSchema: z.object({
      steamId: z.string().describe("The Steam ID 64-bit of the user"),
    }),
    outputSchema: z.object({
      name: z.string().describe("Game name"),
      appid: z.number().describe("Steam app ID"),
      playtimeHours: z.number().describe("Total playtime in hours"),
    }),
    execute: async ({ steamId }) => {
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

      const games = data.response.games.map((game: any) => ({
        appid: game.appid,
        name: game.name,
        playtimeHours: Math.round(game.playtime_forever / 60 * 10) / 10,
      }));

      if (games.length === 0) {
        throw new Error("No games found");
      }

      const mostPlayed = games.reduce((max: any, game: any) => 
        game.playtimeHours > max.playtimeHours ? game : max
      );

      return {
        name: mostPlayed.name,
        appid: mostPlayed.appid,
        playtimeHours: mostPlayed.playtimeHours
      };
    },
  }),
};
