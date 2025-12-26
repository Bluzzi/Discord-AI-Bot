import { botDiscord } from "../utils/discord";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { day } from "../utils/day";
import OpenAI from "openai";

const mistral = new OpenAI({
  apiKey: env.MISTRAL_API_KEY,
  baseURL: env.MISTRAL_BASE_URL,
});

async function generateMotdStatus(): Promise<{ text: string; emoji: string }> {
  try {
    const currentDate = day().format("dddd D MMMM YYYY");

    const prompt = `Tu es Jean Pascal, un bot Discord drôle et décontracté.

Date actuelle: ${currentDate}

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
  "text": "le texte du status sans emoji",
  "emoji": "un seul emoji unicode pertinent"
}

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;

    const completion = await mistral.chat.completions.create({
      model: "mistral-small-latest",
      messages: [
        {
          role: "system",
          content: "Tu es un générateur de status Discord drôles et courts. Tu détectes automatiquement les fêtes françaises et adaptes le status en conséquence. Réponds uniquement avec un JSON contenant text et emoji."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.9,
      max_tokens: 100,
    });

    const response = completion.choices[0]?.message?.content?.trim() || '{"text":"Je chill tranquille","emoji":"😎"}';
    
    try {
      let jsonStr = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      const parsed = JSON.parse(jsonStr);
      logger.info(`MOTD: Generated status - ${parsed.emoji} ${parsed.text}`);
      return { text: parsed.text, emoji: parsed.emoji };
    } catch (error) {
      logger.warn(`MOTD: Failed to parse JSON response - ${error instanceof Error ? error.message : String(error)}`);
      logger.warn(`MOTD: Raw response was: ${response}`);
      return { text: "Je chill tranquille", emoji: "😎" };
    }

  } catch (error) {
    logger.error("Error generating MOTD status:", error instanceof Error ? error.stack : String(error));
    return { text: "Je chill tranquille", emoji: "😎" };
  }
}

async function updateBotStatus() {
  try {
    const { text, emoji } = await generateMotdStatus();
    
    await botDiscord.user?.setPresence({
      activities: [{
        type: 4,
        state: `${emoji} ${text}`,
        name: "custom"
      }],
      status: "online"
    });

    logger.info(`MOTD: Bot status updated to "${emoji} ${text}"`);
  } catch (error) {
    logger.error("Error updating bot status:", error instanceof Error ? error.stack : String(error));
  }
}

function scheduleMotdUpdate() {
  let next3AM = day().hour(3).minute(0).second(0).millisecond(0);
  
  if (next3AM.isBefore(day())) {
    next3AM = next3AM.add(1, 'day');
  }

  const msUntil3AM = next3AM.diff(day());

  logger.info(`MOTD: Next update scheduled in ${Math.round(msUntil3AM / 1000 / 60)} minutes`);

  setTimeout(() => {
    setInterval(async () => {
      await updateBotStatus();
    }, 24 * 60 * 60 * 1000);
  }, msUntil3AM);
}

export async function setupMotd() {
  logger.info("MOTD: Initializing...");
  
  await updateBotStatus();
  scheduleMotdUpdate();
  
  logger.info("MOTD: Setup complete");
}
