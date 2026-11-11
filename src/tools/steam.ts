import type { SteamDescription, SteamInventoryResponse, SteamOwnedGamesResponse, SteamPlayerAchievementsResponse, SteamVanityUrlResponse } from "#/utils/steam-api";
import type { ToolSet } from "ai";
import { steamFetch } from "#/utils/steam-api";
import { tool } from "ai";
import { z } from "zod";

const steamIdSchema = z.string().regex(/^\d{17}$/u, "Expected a 64-bit Steam ID (17 digits)").describe("The 64-bit Steam ID of the user (17 digits)");

export const steamTools: ToolSet = {
  resolveSteamUsername: tool({
    description: "Convert a Steam username (vanity URL) to a 64-bit Steam ID. Use this first when you only have a username or profile URL.",
    inputSchema: z.object({
      username: z.string().describe("The Steam username (vanity URL) to resolve"),
    }),
    outputSchema: z.object({
      steamId: z.string().describe("The resolved 64-bit Steam ID"),
      username: z.string().describe("The username that was resolved"),
    }),
    execute: async ({ username }) => {
      const data = await steamFetch(`/ISteamUser/ResolveVanityURL/v1/?vanityurl=${encodeURIComponent(username)}`) as SteamVanityUrlResponse;

      if (data.response.success !== 1) {
        throw new Error("Steam username not found");
      }

      return {
        steamId: data.response.steamid ?? "",
        username,
      };
    },
  }),

  getSteamUserGames: tool({
    description: "Get the list of games owned by a Steam user, with their playtime.",
    inputSchema: z.object({
      steamId: steamIdSchema,
    }),
    outputSchema: z.object({
      gameCount: z.number().describe("Total number of games owned"),
      games: z.array(z.object({
        appid: z.number().describe("Steam app ID"),
        name: z.string().describe("Game name"),
        playtimeHours: z.number().describe("Total playtime in hours"),
        playtime2WeeksHours: z.number().describe("Playtime over the last 2 weeks in hours"),
      })).describe("Games owned"),
    }),
    execute: async ({ steamId }) => {
      const data = await steamFetch(`/IPlayerService/GetOwnedGames/v1/?steamid=${steamId}&include_appinfo=1&include_played_free_games=1`) as SteamOwnedGamesResponse;

      if (data.response.games === undefined) {
        throw new Error("No games found or profile is private");
      }

      return {
        gameCount: data.response.game_count ?? data.response.games.length,
        games: data.response.games.map((game) => ({
          appid: game.appid,
          name: game.name ?? "",
          playtimeHours: Math.round(game.playtime_forever / 60 * 10) / 10,
          playtime2WeeksHours: game.playtime_2weeks !== undefined && game.playtime_2weeks > 0 ? Math.round(game.playtime_2weeks / 60 * 10) / 10 : 0,
        })),
      };
    },
  }),

  getSteamUserGamePlaytime: tool({
    description: "Get the playtime of a Steam user for a specific game they own.",
    inputSchema: z.object({
      steamId: steamIdSchema,
      appId: z.number().int().describe("The Steam app ID of the game"),
    }),
    outputSchema: z.object({
      appid: z.number().describe("Steam app ID"),
      name: z.string().describe("Game name"),
      playtimeHours: z.number().describe("Total playtime in hours"),
      playtime2WeeksHours: z.number().describe("Playtime over the last 2 weeks in hours"),
    }),
    execute: async ({ steamId, appId }) => {
      const data = await steamFetch(`/IPlayerService/GetOwnedGames/v1/?steamid=${steamId}&include_appinfo=1`) as SteamOwnedGamesResponse;

      if (data.response.games === undefined) {
        throw new Error("No games found or profile is private");
      }

      const game = data.response.games.find((entry) => entry.appid === appId);
      if (game === undefined) {
        throw new Error("Game not found in user's library");
      }

      return {
        appid: game.appid,
        name: game.name ?? "",
        playtimeHours: Math.round(game.playtime_forever / 60 * 10) / 10,
        playtime2WeeksHours: game.playtime_2weeks !== undefined && game.playtime_2weeks > 0 ? Math.round(game.playtime_2weeks / 60 * 10) / 10 : 0,
      };
    },
  }),

  getSteamUserAchievements: tool({
    description: "Get the achievement progress of a Steam user for a specific game: completion percentage and recent unlocks.",
    inputSchema: z.object({
      steamId: steamIdSchema,
      appId: z.number().int().describe("The Steam app ID of the game"),
    }),
    outputSchema: z.object({
      gameName: z.string().describe("Game name"),
      totalAchievements: z.number().describe("Total number of achievements"),
      unlockedAchievements: z.number().describe("Number of unlocked achievements"),
      completionPercentage: z.number().describe("Completion percentage (0-100)"),
      recentAchievements: z.array(z.object({
        name: z.string().describe("Achievement name"),
        description: z.string().optional().describe("Achievement description"),
        unlockedAt: z.string().describe("Unlock date (ISO)"),
      })).describe("5 most recent achievements unlocked"),
    }),
    execute: async ({ steamId, appId }) => {
      const data = await steamFetch(`/ISteamUserStats/GetPlayerAchievements/v1/?steamid=${steamId}&appid=${String(appId)}&l=french`) as SteamPlayerAchievementsResponse;

      if (data.playerstats?.achievements === undefined) {
        throw new Error("No achievements found or profile is private");
      }

      const achievements = data.playerstats.achievements;
      const totalAchievements = achievements.length;
      const unlockedAchievements = achievements.filter((achievement) => achievement.achieved === 1).length;
      const completionPercentage = Math.round((unlockedAchievements / totalAchievements) * 100);

      return {
        gameName: data.playerstats.gameName,
        totalAchievements,
        unlockedAchievements,
        completionPercentage,
        recentAchievements: achievements
          .filter((achievement) => achievement.achieved === 1)
          .sort((a, b) => b.unlocktime - a.unlocktime)
          .slice(0, 5)
          .map((achievement) => ({
            name: achievement.name ?? achievement.apiname,
            description: achievement.description,
            unlockedAt: new Date(achievement.unlocktime * 1000).toISOString(),
          })),
      };
    },
  }),

  getSteamUserInventory: tool({
    description: "Get the inventory items of a Steam user, sorted by rarity (default: Counter-Strike 2). Fails if the inventory is private.",
    inputSchema: z.object({
      steamId: steamIdSchema,
      appId: z.number().int().optional().describe("Steam app ID owning the inventory (default: 730 for Counter-Strike 2)"),
    }),
    outputSchema: z.object({
      totalItems: z.number().describe("Total number of items in the inventory"),
      uniqueItems: z.number().describe("Number of distinct items"),
      items: z.array(z.object({
        name: z.string().describe("Item name"),
        type: z.string().describe("Item type"),
        count: z.number().describe("Quantity owned"),
        tradable: z.boolean().describe("Whether the item can be traded"),
        marketable: z.boolean().describe("Whether the item can be sold on the market"),
        rarity: z.string().optional().describe("Item rarity"),
        weapon: z.string().optional().describe("Weapon type"),
      })).describe("Distinct items sorted by rarity (max 15)"),
    }),
    execute: async ({ steamId, appId = 730 }) => {
      const response = await fetch(`https://steamcommunity.com/inventory/${steamId}/${String(appId)}/2?l=french&count=100`);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Inventory is private. The user needs to set their inventory to public in Steam privacy settings.");
        }
        if (response.status === 429) {
          throw new Error("Steam API rate limit reached. Please try again in a few minutes.");
        }
        throw new Error(`Steam API error: ${String(response.status)} ${response.statusText}`);
      }

      const data = await response.json() as SteamInventoryResponse;

      if (data.success === false) {
        throw new Error("Inventory is private or does not exist for this game.");
      }

      if (data.assets === undefined || data.assets.length === 0) {
        throw new Error("No items found in inventory for this game. The inventory might be empty or private.");
      }

      if (data.descriptions === undefined) {
        throw new Error("No inventory data available.");
      }

      const itemCounts = new Map<string, { count: number; description: SteamDescription }>();

      for (const asset of data.assets) {
        const description = data.descriptions.find(
          (entry) => entry.classid === asset.classid && entry.instanceid === asset.instanceid,
        );

        if (description !== undefined) {
          const key = description.market_hash_name ?? description.name ?? "Unknown";
          const existing = itemCounts.get(key);
          if (existing !== undefined) {
            existing.count += 1;
          }
          else {
            itemCounts.set(key, { count: 1, description });
          }
        }
      }

      const items = Array.from(itemCounts.entries()).map(([_name, entry]) => ({
        name: entry.description.name ?? "Unknown",
        type: entry.description.type ?? "Unknown",
        count: entry.count,
        tradable: entry.description.tradable === 1,
        marketable: entry.description.marketable === 1,
        rarity: entry.description.tags?.find((tag) => tag.category === "Rarity")?.localized_tag_name,
        weapon: entry.description.tags?.find((tag) => tag.category === "Weapon")?.localized_tag_name,
      }));

      const rarityOrder: Record<string, number> = {
        "Extraordinaire": 1,
        "Exotique": 2,
        "Classifiée": 3,
        "Restreinte": 4,
        "De qualité militaire": 5,
        "De qualité industrielle": 6,
        "De qualité grand public": 7,
      };

      items.sort((a, b) => (rarityOrder[a.rarity ?? ""] ?? 999) - (rarityOrder[b.rarity ?? ""] ?? 999));

      return {
        totalItems: data.assets.length,
        uniqueItems: items.length,
        items: items.slice(0, 15),
      };
    },
  }),

  findMostPlayedGame: tool({
    description: "Find the most played game of a Steam user: the one with the highest total playtime.",
    inputSchema: z.object({
      steamId: steamIdSchema,
    }),
    outputSchema: z.object({
      name: z.string().describe("Game name"),
      appid: z.number().describe("Steam app ID"),
      playtimeHours: z.number().describe("Total playtime in hours"),
    }),
    execute: async ({ steamId }) => {
      const data = await steamFetch(`/IPlayerService/GetOwnedGames/v1/?steamid=${steamId}&include_appinfo=1&include_played_free_games=1`) as SteamOwnedGamesResponse;

      if (data.response.games === undefined || data.response.games.length === 0) {
        throw new Error("No games found or profile is private");
      }

      const mostPlayed = data.response.games.reduce((max, game) => game.playtime_forever > max.playtime_forever ? game : max);

      return {
        name: mostPlayed.name ?? "",
        appid: mostPlayed.appid,
        playtimeHours: Math.round(mostPlayed.playtime_forever / 60 * 10) / 10,
      };
    },
  }),
};
