import type { Message } from "discord.js";
import type { OmitPartialGroupDMChannel } from "discord.js";
import { discordTools } from "#/tools/discord";
import { aiModel } from "#/utils/ai";
import { DISCORD_MAX_MESSAGE_LENGTH } from "#/utils/discord";
import { env } from "#/utils/env";
import { generateText, type ModelMessage } from "ai";
import dedent from "dedent";

export const replyToMessage = async (message: OmitPartialGroupDMChannel<Message>) => {
  // Get the bot information on the server:
  const botMember = await message.guild?.members.fetch(env.DISCORD_BOT_ID);
  if (!botMember) throw Error("Unable to get the bot member instance");

  // Start typing:
  await message.channel.sendTyping();

  // Generate the reply:
  const lastMessages = await message.channel.messages.fetch({ limit: 20 });
  const completion = await generateText({
    model: aiModel,
    messages: [
      {
        role: "system",
        content: dedent`
          Tu es un bot Discord qui fait parti d'un groupe d'ami, tu es la aussi bien pour échangé avec eux sur divers sujets
          plus ou moins sérieux mais aussi pour les faire rire.

          // Tu as accès à divers outils dont tu peux te servir pour accomplir les demandes qu'on te fait, que ça soit lié à
          // Discord ou non. Fait attention, si c'est lié à Discord, tu as toutes les permissions donc tu dois éviter les choses
          // trop déstructive (notamment la suppression des salons textuels qui est totalement interdit).

          Tes informations de bot :
          - Ton username global : ${botMember.user.username}
          - Ton username sur le serveur Discord : ${botMember.displayName}

          Autres informations contextuels et pratiques :
          - Quand l'utilisateur dit "moi", "me", "mon", etc., il fait référence à lui-même (ID: ${message.author.id})
          - Dans ta réponse à l'utilisateur, si tu as effectué différentes actions avec les outils, liste ce que tu as fait. 
        `,
      },
      ...lastMessages.reverse().map((element) => {
        return { role: element.author.id === env.DISCORD_BOT_ID ? "assistant" : "user", content: element.content } satisfies ModelMessage;
      }),
    ],
    tools: discordTools,
  });

  // Send chunked reply:
  for (let i = 0; i < completion.text.length; i += DISCORD_MAX_MESSAGE_LENGTH) {
    const chunk = completion.text.slice(i, i + DISCORD_MAX_MESSAGE_LENGTH);
    await message.reply(chunk);
  }
};
