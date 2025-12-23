import { aiModel } from "#/utils/ai";
import { botDiscord } from "#/utils/discord";
import { generateText, Output } from "ai";
import dedent from "dedent";
import { MessageType } from "discord.js";
import z from "zod";

/**
 * Check if the IA need to reply to the message or not.
 */
botDiscord.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guildId) return;
  if (!botDiscord.user?.bot) return;

  // Based on the last 20 channel messages:
  const lastMessages = await message.channel.messages.fetch({ limit: 20 });

  const completion = await generateText({
    model: aiModel,
    prompt: dedent`
      Voici les 20 derniers messages de la conversation, tu dois me renvoyer le pourcentage 
      pertinence que le bot (nommé "${botDiscord.user.username}") aurait à 
      répondre quelque chose à la suite de ces messages.

      Le pourcentage augmente fortement si le bot est inclu dans la conversation, par exemple,
      s'il a déjà parlé ou était mentionné et qu'il est logique qu'il réponde. 

      Le pourcentage baisse fortement s'il s'agit d'une discussion ou le bot n'est pas du tout
      inclu ou mentionné.

      Voici la conversation :
      ${lastMessages.map((element) => `${element.author.username}: ${element.content}`).join("\n")}
    `,
    output: Output.object({ schema: z.object({
      needToReplyPercent: z.number().min(0).max(1).meta({ description: "Pourcentage allant de 0 à 1" }),
    }) }),
  });

  if (completion.output.needToReplyPercent > 0.7) {
    // Pass
  }

  // Based on bot mention:
  if (message.mentions.has(botDiscord.user.id)) {
    // Pass
  }

  // Based on a reply to the bot:
  if (message.type === MessageType.Reply && message.reference?.messageId) {
    const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);

    if (repliedMessage.author.id === botDiscord.user.id) {
      // Pass
    }
  }
});
