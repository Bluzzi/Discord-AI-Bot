import { replyToMessage } from "#/features/reply-to-message";
import { aiModel } from "#/utils/ai";
import { botDiscord } from "#/utils/discord";
import { logger } from "#/utils/logger";
import { generateText, Output } from "ai";
import dedent from "dedent";
import { MessageType } from "discord.js";
import z from "zod";

/**
 * Check if the AI need to reply to the message or not.
 */
botDiscord.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guildId) return;
  if (!botDiscord.user?.bot) return;
  if (!message.channel.isTextBased()) return;

  // Based on bot mention:
  if (message.mentions.has(botDiscord.user.id)) {
    logger.info(`Reply to ${message.author.displayName} based on mention`);
    await replyToMessage(message);
    return;
  }

  // Based on a reply to the bot:
  if (message.type === MessageType.Reply && message.reference?.messageId) {
    const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);

    if (repliedMessage.author.id === botDiscord.user.id) {
      logger.info(`Reply to ${message.author.displayName} based on a reply to the bot`);
      await replyToMessage(message);
    }
  }

  // Based on the last 5 channel messages:
  const lastMessages = await message.channel.messages.fetch({ limit: 5 });
  const botMember = await message.guild?.members.fetch(botDiscord.user.id);

  const completion = await generateText({
    model: aiModel,
    prompt: dedent`
      Voici les 5 derniers messages de la conversation, tu dois me renvoyer le pourcentage
      pertinence que le bot (nommé "${botDiscord.user.username}", ou "${botMember?.displayName}") aurait à
      répondre quelque chose à la suite de ces messages.

      Le pourcentage augmente fortement si le bot est inclu dans la conversation, par exemple,
      s'il a déjà parlé ou était mentionné et qu'il est logique qu'il réponde.

      Le pourcentage baisse fortement s'il s'agit d'une discussion ou le bot n'est pas du tout
      inclu ou mentionné.

      Voici la conversation :
      ${lastMessages.map((element) => `${element.author.username}: ${element.content}`).join("\n")}
    `,
    output: Output.object({
      schema: z.object({
        needToReplyPercent: z.number().min(0).max(1).describe("Pourcentage allant de 0 à 1"),
      }),
    }),
  });

  logger.info(`Need to reply percent: ${String(completion.output.needToReplyPercent * 100)}%`);
  if (completion.output.needToReplyPercent > 0.7) {
    logger.info(`Reply to ${message.author.displayName} based on the last 5 messages`);
    await replyToMessage(message);
  }
});
