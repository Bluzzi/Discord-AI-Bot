import { discord } from "#/discord";
import { aiModels } from "#/utils/ai-model";
import { day } from "#/utils/day";
import { webSearch } from "#/utils/web-search";
import { generateText, Output } from "ai";
import { Cron } from "croner";
import dedent from "dedent";
import { ActivityType } from "discord.js";
import z from "zod";

const job = new Cron("0 0 * * *", async () => {
  if (!discord.client.user) throw Error("Discord bot user if not available");

  // Get today news:
  const queries: string[] = [
    "Actualité France politique aujourd'hui",
    "Actualité tech crypto aujourd'hui",
    "Actualité monde guerre conflit aujourd'hui",
  ];

  const searchResults: string[] = [];
  for (const query of queries) {
    const results = await webSearch(query);
    searchResults.push(...results.map((result) => `${result.title} ${result.description}`));
  }

  // Ask AI for MOTD from news:
  const motd = await generateText({
    model: aiModels.mistralFast,
    output: Output.object({
      schema: z.object({
        text: z.string("Le texte du status sans emoji"),
        emoji: z.string("Un seul emoji unicode pertinent"),
      }),
    }),
    prompt: dedent`
      Tu es le générateur de status Discord de Jean Pascal, un bot Discord drôle et décontracté.

      Ton rôle est de générer un status Discord drôles et courts. Tu détectes automatiquement les fêtes françaises et adaptes le status en conséquence. Tu réponds uniquement avec un JSON contenant text et emoji du status.

      Date actuelle: ${day().format("dddd D MMMM YYYY")}

      IMPORTANT: Analyse bien la date actuelle et détecte automatiquement si c'est une fête française ou si on approche d'une fête.

      Génère un status Discord court et drôle en prenant en compte:

      1. PRIORITÉ ABSOLUE AUX FÊTES: 
        - Si la date actuelle correspond à une fête française (25 décembre = Noël, 1er janvier = Nouvel An, 14 juillet = Fête Nationale, 31 octobre = Halloween, etc.), génère un message de fête pour le jour J
        - Si on est à moins de 5 jours d'une fête, adapte le message selon le nombre de jours restants:
          * 5 jours avant: préparation tranquille
          * 4 jours avant: achats
          * 3 jours avant: préparatifs
          * 2 jours avant: derniers détails
          * 1 jour avant: dernière ligne droite
          * Jour J: message de célébration de la fête

      2. SINON ACTUALITÉ: Si aucune fête proche, génère un status en rapport avec l'actualité du moment en dédramatisant avec humour.
          - PRIORTIE DES ACTUALITE : France ( Politique, Elections, etc ), Tech ( Grosse chute d'un actif d'une societe), Crypto ( Grosse hausse / chute d'une crypto), Actu Monde / guerre / conflit internationaux

      Voic les actualités du jour :
      ${searchResults.map((element) => `- ${element}\n`)}

      Exemples de style:
      - Fête (jour J): "Je fête Noël avec la mif", "Bonne année à tous", "Vive la France"
      - Fête (avant): "Je prépare Noël tranquille", "Derniers achats de cadeaux"
      - Actualité: "J'essaye de défendre l'Ukraine c'est HARRR", "Je survis à la canicule"

      Le status doit:
      - Être en français
      - Être court et percutant (max 50 caractères)
      - Être drôle et décontracté
      - NE PAS INCLURE D'EMOJI DANS LE TEXTE

      Réponds au format JSON:
      {
        "text": "",
        "emoji": "un seul emoji unicode pertinent"
      }

      Réponds UNIQUEMENT avec le JSON, rien d'autre.
    `,
  });

  // Set Discord activity:
  discord.client.user.setPresence({
    activities: [{
      name: "Custom",
      type: ActivityType.Custom,
      state: `${motd.output.emoji} ${motd.output.text}`,
    }],
    status: "online",
  });
});

await job.trigger();
