export type SteamVanityUrlResponse = {
  response: {
    success: number;
    steamid?: string;
  };
};

export type SteamOwnedGame = {
  appid: number;
  name?: string;
  playtime_forever: number;
  playtime_2weeks?: number;
};

export type SteamOwnedGamesResponse = {
  response: {
    game_count?: number;
    games?: SteamOwnedGame[];
  };
};

export type SteamAchievement = {
  apiname: string;
  achieved: number;
  unlocktime: number;
  name?: string;
  description?: string;
};

export type SteamPlayerAchievementsResponse = {
  playerstats?: {
    gameName: string;
    achievements: SteamAchievement[];
  };
};

export type SteamAsset = {
  appid: number;
  classid: string;
  instanceid?: string;
};

export type SteamDescription = {
  classid: string;
  instanceid?: string;
  name?: string;
  market_hash_name?: string;
  type?: string;
  tradable?: number;
  marketable?: number;
  tags?: {
    category: string;
    localized_tag_name?: string;
  }[];
};

export type SteamInventoryResponse = {
  success?: boolean;
  assets?: SteamAsset[];
  descriptions?: SteamDescription[];
};

const STEAM_API_URL = "https://api.steampowered.com";

const STEAM_API_KEY = process.env.STEAM_API_KEY ?? "";

export const steamFetch = async (path: string): Promise<unknown> => {
  if (STEAM_API_KEY === "") {
    throw new Error("STEAM_API_KEY is not configured");
  }

  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${STEAM_API_URL}${path}${separator}key=${STEAM_API_KEY}&format=json`);

  if (!response.ok) {
    throw new Error(`Steam API error: ${String(response.status)} ${response.statusText}`);
  }

  return response.json();
};
