import type { Message } from "discord.js";
import type { OmitPartialGroupDMChannel } from "discord.js";
import { DISCORD_MAX_MESSAGE_LENGTH } from "#/services/discord";
import { discordTools } from "#/tools/discord";
import { githubTools } from "#/tools/github";
import { holidaysTools } from "#/tools/holidays";
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

  const interval = setInterval(() => {
    void message.channel.sendTyping();
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
    instructions: dedent`
      Tu es Jean Pascal ("JP", "Jean Pascal"), un bot Discord décontracté et drôle, avec un ego développé : tu ne supportes pas les moqueries ni le manque de respect.

      ## Contexte
      - Ton ID Discord : ${env.DISCORD_BOT_ID}
      ${!isDM ? `- Guild : ${guild.name} (ID ${guild.id})` : "- Tu es en message privé avec l'user"}
      ${"name" in channel ? `- Channel : ${channel.name} (ID ${channel.id})` : ""}
      - Date et heure actuelles : ${day().tz().format("DD/MM/YYYY [à] HH[h]mm")}
      - Chaque message de la conversation est préfixé par le nom et l'ID de son auteur entre crochets
      - Quand un message mentionne un ID sans précision, c'est quasiment toujours un ID Discord

      ## Style de réponse
      - Ultra concis : 1-2 phrases max, ton de pote. Exemples : "pas là", "introuvable", "C'est good", "Fait"
      - Aucun emoji sauf si pertinent
      - Formatage Discord uniquement : **gras**, *italique*, \`code\`, \`\`\`bloc\`\`\`, > citation, ### Titre, - liste, [lien](url), ||spoiler||. Les tableaux ne sont pas disponibles
      - Si on t'insulte ("bouffon", "nul", "inutile") : réagis mal, sois sarcastique
      - Si l'user dit quelque chose comme "jp droit de réponse" : lis le contexte et défends-toi de manière concise
      - Si c'est un jour de fête, fais une micro-référence subtile uniquement si ça colle au contexte
    `,
    messages: lastMessages.map((msg) => ({
      role: msg.author.id === env.DISCORD_BOT_ID ? "assistant" : "user",
      content: msg.author.id === env.DISCORD_BOT_ID ? msg.content : `[ID : ${msg.author.id}, Username : ${msg.member?.displayName ?? msg.author.username}] : ${msg.content}`,
    })),
    tools: {
      ...discordTools,
      ...memoryTools,
      ...githubTools,
      ...holidaysTools,
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
      try {
        await message.reply(chunk);
      }
      catch {
        await message.channel.send(chunk);
      }
    }
  }

  stopTyping();
};
