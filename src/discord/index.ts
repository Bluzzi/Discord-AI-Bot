import { discordMOTD } from "./(features)/motd";
import { discordVoice } from "./(features)/voice";
import { discordClient } from "./client";

export const discord = {
  client: discordClient,
  motd: discordMOTD,
  voice: discordVoice,
};

export * from "./const";
