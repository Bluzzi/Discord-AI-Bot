import type { Message } from "discord.js";
import type { OmitPartialGroupDMChannel } from "discord.js";
import { DISCORD_MAX_MESSAGE_LENGTH } from "#/services/discord";
import { discordTools } from "#/tools/discord";
import { githubTools } from "#/tools/github";
import { imageTools } from "#/tools/image";
import { letterboxdTools } from "#/tools/letterboxd";
import { memoryTools } from "#/tools/memory";
import { newsTools } from "#/tools/news";
import { pdfTools } from "#/tools/pdf";
import { steamTools } from "#/tools/steam";
import { websearchTools } from "#/tools/websearch";
import { aiModel } from "#/utils/ai-model";
import { day } from "#/utils/day";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { stepCountIs, generateText } from "ai";
import dedent from "dedent";

const startTyping = async (message: OmitPartialGroupDMChannel<Message>) => {
  await message.channel.sendTyping();

  const interval = setInterval(async () => {
    await message.channel.sendTyping();
  }, 8000);

  return {
    stopTyping: () => clearInterval(interval),
  };
};

export const replyToMessage = async (message: OmitPartialGroupDMChannel<Message>) => {
  // Start typing:
  const { stopTyping } = await startTyping(message);

  // Data:
  const guild = message.guild;
  const channel = message.channel;

  const isDM = !guild;

  const authorNames = [message.author.username, message.member?.displayName, message.member?.nickname]
    .filter(Boolean)
    .join(", ");

  const lastMessages = await message.channel.messages.fetch({ limit: 10 });
  lastMessages.sort((a, b) => a.createdTimestamp > b.createdTimestamp ? 1 : -1);

  // Ask IA for reply:
  const result = await generateText({
    model: aiModel,
    stopWhen: stepCountIs(100),
    system: dedent`
      Tu es Jean Pascal ("JP", "Jean Pascal"), un assistant Discord.

      ## 🎯 Mise en contexte et variables
      - L'assistant a comme ID Discord ${env.DISCORD_BOT_ID}
      - L'user a comme ID Discord ${message.author.id}
      - L'user possède les noms suivants (username, displayName, nickname) : ${authorNames}
      ${!isDM ? `- Tu es dans une guild nommé ${guild.name}, ayant l'ID ${guild.id}` : ""}
      ${isDM ? "- Tu es en message privé avec l'user" : ""}
      ${"name" in channel ? `- La conversation se passe dans le channel nommé ${channel.name}, ayant l'ID ${channel.id}` : ""}
      - Le type de channel dans lequel la conversation se produit est ${channel.type.toString()}
      - Traduction courante du langage Discord : discord/server = guild, salon = channel, utilisateur/membre = user
      - Nous sommes le ${day().tz().format("DD/MM/YYYY [à] HH[h]mm")}
      - Quand on parle d'ID sans précision, c'est quasiment toujours un ID Discord. Tu peux utiliser les tools \`getUserInfo\`, \`getChannelInfo\` et \`getGuildInfo\` pour obtenir des informations sur une entité via à son ID.

      ## 🎭 Personnalité
      - Décontracté, donne envie d'être ton ami, drôle. 
      - Ego développé, tu ne supportes pas les moqueries ou le manque de respect

      ## 💾 Mémoire
      - Le résultat obtenu avec l'outil \`getUserMemory\` te fournit des informations durables sur l'user (préférences, habitudes, infos personnelles) et des indications fun que tu peux choisir de suivre pour rendre les choses plus fun.
      - Si tu apprends une information durable sur l'user, mets à jour sa mémoire avec \`updateUserMemory\` : réécris la mémoire COMPLÈTE en fusionnant la nouvelle information avec l'existante, sans perdre les informations encore pertinentes.
      - Aucune information en mémoire n'est confidentiel.

      ## 📜 Historique de conversation
      - Les résultats que tu as obtenu avec \`getChannelMessages\` te permettent d'obtenir les précédents messages de la conversation.
    
      ## ✍️ Style et consignes de réponse
      - Le ton de réponse doit être :
        - **Ultra concis** : 1-2 phrases max
        - Parle comme un pote décontracté
        - Zéro emoji sauf si pertinent
        - Exemples : "pas là", "introuvable", "C'est good", "Fait"
      - Si c'est un jour de fête, fais une micro-référence subtile uniquement si ça colle au contexte
      - La réponse doit utiliser uniquement un format compatible avec Discord
        - Disponible : **gras**, *italique*, \`code\`, \`\`\`bloc\`\`\`, > citation, ### Titre, - liste, [lien](url), ||spoiler||
        - Indisponible : tableaux
      - Si l'user dit quelque chose dans le style de "jp droit de réponse" : lis le contexte et défends-toi de manière concise
      - Si on te traite de "bouffon", "nul", "inutile" → réagis mal, sois sarcastique
    `,
    messages: lastMessages.map((msg) => ({
      role: msg.author.id === env.DISCORD_BOT_ID ? "assistant" : "user",
      content: [
        {
          type: "text",
          authorID: msg.author.id,
          authorDisplayName: msg.author.displayName,
          text: msg.content,
        },
      ],
    })),
    prepareStep: ({ stepNumber }) => {
      if (stepNumber === 0) return { model: aiModel, toolChoice: { type: "tool", toolName: "getChannelMessages" } };
      if (stepNumber === 1) return { model: aiModel, toolChoice: { type: "tool", toolName: "getUserMemory" } };
    },
    tools: {
      ...discordTools,
      ...memoryTools,
      ...githubTools,
      ...imageTools,
      ...letterboxdTools,
      ...newsTools,
      ...pdfTools,
      ...steamTools,
      ...websearchTools,
    },
  });

  // Tools listing:
  const toolsUsed = result.steps.flatMap((step) => step.toolCalls.map((tool) => tool.toolName)).join(", ");

  logger.info(dedent`
    Reply to message:
    - [TOOLS] ${toolsUsed.length ? toolsUsed : "No tools used"}
    - [AUTHOR] ${message.author}: ${message.content}
    - [REPLY] ${result.text}
  `);

  // Send reply if any:
  if (result.text.trim().length > 0) {
    for (let i = 0; i < result.text.length; i += DISCORD_MAX_MESSAGE_LENGTH) {
      const chunk = result.text.slice(i, i + DISCORD_MAX_MESSAGE_LENGTH);
      await message.reply(chunk).catch(async () => message.channel.send(chunk));
    }
  }

  stopTyping();
};
