import { discordClient } from "#/services/discord";
import { holidaysTools } from "#/tools/holidays";
import { newsTools } from "#/tools/news";
import { aiModels } from "#/utils/ai-model";
import { day } from "#/utils/day";
import { trigger } from "#/utils/trigger";
import { generateText, Output, stepCountIs } from "ai";
import dedent from "dedent";
import { ActivityType } from "discord.js";
import z from "zod";

await trigger.cron(
  "discord-presence",
  "0 * * * *",
  async () => {
    if (!discordClient.user) throw new Error("Discord bot user is not available");

    // Generate MOTD:
    const motd = await generateText({
      model: aiModels.mistralLarge,
      stopWhen: stepCountIs(5),
      output: Output.object({
        schema: z.object({
          emoji: z.string().describe("Un seul emoji unicode pertinent"),
          text: z.string().describe("Le texte du status sans emoji (40 caractères maximum)"),
        }),
      }),
      prompt: dedent`
      Tu es le générateur de status Discord de **Jean Pascal**, un bot Discord **drôle, décontracté et légèrement problématique**.

      ## Contexte
      - Date et heure actuelle : ${day().format("DD/MM/YYYY [à] HH[h]mm")}
      - Fêtes majeures possibles : Noël, Jour de l'an, Saint-Valentin, Pâques  
      - Autres fêtes importantes : Fête de la musique, Fête nationale, Halloween, Fête du Travail, Armistice 1918
      - Tu connais normalement les fêtes et jours fériés en France, mais tu dispose quand même d'outils pour récupérer leur dates.
      - Tu disposes également d'outils pour récupérer les actualités (France, Monde, Crypto, Tech).  
        → Ces outils sont à utiliser uniquement si aucune des règles de priorité ci-dessous ne s'applique.

      ## Règles de priorité (dans cet ordre)
      1. **Si aujourd'hui est une fête majeure**  
        → Status **100% centré sur la fête**, drôle.  
        → **Aucune actualité, aucun événement historique.**

      2. **Si une fête majeure arrive dans les prochains jours**  
        → Status centré sur **la préparation / le compte à rebours / la pression**, ton humoristique.  
        → **Aucune actualité.**

      3. **Si aujourd'hui est une fête “importante” mais non majeure**  
        → Status centré sur cette fête, humour léger.  
        → **Aucune actualité.**

      4. **Sinon (jour normal)**  
        → Tu peux utiliser les outils d'actualité pour choisir **UNE info croustillante** et créer une **vanne courte**.  
        - Utilise **uniquement les titres**, jamais leur contenu  
        - Crypto : **uniquement si l'info est énorme** (hack majeur, crash historique, annonce mondiale). Sinon, ignore totalement la crypto.

      ## Objectif
      Produire **un status court, percutant et marrant**, adapté au contexte du jour, sans explication, avec un ton humour, vanne, second degré, un peu borderline.
    `,
      tools: {
        ...newsTools,
        ...holidaysTools,
      },
    });

    // Update Discord presence:
    discordClient.user.setPresence({
      status: "online",
      activities: [{
        name: "Custom",
        type: ActivityType.Custom,
        state: `${motd.output.emoji} ${motd.output.text}`,
      }],
    });
  },
  {
    triggerAtStartup: true,
  },
);
