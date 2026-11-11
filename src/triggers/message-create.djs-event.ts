import { replyToMessage } from "#/features/reply-to-message";
import { discordClient } from "#/services/discord";
import { aiModel } from "#/utils/ai-model";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import { generateText, Output } from "ai";
import dedent from "dedent";

trigger.discordEvent("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!discordClient.user) return;
  if (!message.channel.isTextBased()) return;

  // Always reply in DM:
  if (message.guildId === null) {
    logger.info(`Reply to ${message.author.username} in DM (100%)`);
    await replyToMessage(message);
    return;
  }

  // Always reply on mention:
  if (message.mentions.has(discordClient.user.id)) {
    logger.info(`Reply to ${message.author.displayName} based on mention (100%)`);
    await replyToMessage(message);
    return;
  }

  // Check if the bot is good for the current subject:
  const lastMessages = await message.channel.messages.fetch({ limit: 10 });
  lastMessages.sort((a, b) => a.createdTimestamp > b.createdTimestamp ? 1 : -1);

  const conversation = lastMessages.map((msg) => `${msg.author.username}: ${msg.content}`).join("\n");

  const botMember = await message.guild?.members.fetch(discordClient.user.id);
  const botNames = [discordClient.user.username, botMember?.displayName, botMember?.nickname].filter(Boolean).join(", ");

  const decision = await generateText({
    model: aiModel,
    output: Output.choice({
      options: ["OUI", "NON"],
    }),
    instructions: dedent`
      Tu détermines si le bot Discord "${botNames}" doit répondre au dernier message d'une conversation.

      Mémoire :
      - L'user dispose d'informations durables en mémoire (récupérées avec l'outil getUserMemory au moment de la réponse) qui peuvent affecter les cas où tu dois répondre ou non

      Réponds "OUI" si :
      - Le bot est explicitement mentionné par son nom ("jean pascal", "jp", "jean", "yo jean", "yo jean pascal", "yo jp")
      - On lui accorde le droit de réponse ("jp droit de réponse", "jean pascal droit de réponse")
      - Le bot a parlé dans les 2 derniers messages et le nouveau message est une réponse directe (même sans mention explicite) : s'il vient de poser une question ou d'engager la conversation, la réponse lui est destinée
      - Une demande d'action Discord explicite et directe lui est adressée ("rejoins le vocal", "déplace moi", "crée un salon", "kick X")

      Réponds "NON" si :
      - Le message s'adresse au groupe sans mentionner le bot ("qui fait...", "quelqu'un pour...", "on fait quoi", "vous êtes où")
      - Des utilisateurs discutent entre eux sans que le bot ait participé aux 3 derniers messages
      - Le message parle du bot à la 3ème personne sans l'interpeller ("il", "le bot", "jean pascal fait...")
      - Le message est générique ou ambigu ("salut", "yo", "ça va", "coucou") alors que le bot n'a pas parlé récemment
      - Le message semble s'adresser à quelqu'un d'autre (ex: commence par un nom d'utilisateur)
      - En cas de doute : "NON"
    `,
    prompt: dedent`
      Conversation récente :
      ${conversation}

      Dernier message de ${message.author.username} : "${message.content}"

      Le bot doit-il répondre ?
    `,
  });

  if (decision.output === "OUI") {
    logger.info(`Reply to ${message.author.displayName} based on AI decision`);
    await replyToMessage(message);
  }
});
