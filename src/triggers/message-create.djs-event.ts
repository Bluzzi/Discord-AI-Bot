import { replyToMessage } from "#/features/reply-to-message";
import { discordClient } from "#/services/discord";
import { memoryTools } from "#/tools/memory";
import { aiModel } from "#/utils/ai-model";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import { generateText, Output, stepCountIs } from "ai";
import dedent from "dedent";

trigger.discordEvent("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!discordClient.user) return;
  if (!message.channel.isTextBased()) return;

  // Always reply in DM:
  if (!message.guildId) {
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
    stopWhen: stepCountIs(10),
    output: Output.choice({
      options: ["OUI", "NON"],
    }),
    system: dedent`
      Tu es un assistant qui détermine si le bot Discord nommé "${botNames}" (aussi appelé "jp" ou "jean pascal") doit répondre à un message.

      📋 ANALYSE REQUISE :
      1. Identifier qui parle dans les derniers messages
      2. Repérer si le bot a participé récemment (3 derniers messages)
      3. Déterminer si le nouveau message s'adresse au bot ou continue une conversation avec lui

      !! UTILISER LA mémoire
      - Tu as accès à plusieurs outils permettant la récupération d'information dans des mémoires (mémoires : utilisateurs (user), salons (channels) et serveurs (guilds)). 
      - Avant de répondre, tu dois impérativement récupérer les informations de :
        - Utilisateur : getUserMemory avec l'ID ${message.author.id}
        - getChannelMemory : getGuildMemory avec l'ID ${message.channel.id}
        ${message.guild?.id ? `- Serveur : getGuildMemory avec l'ID ${message.guild.id}` : ""}
      Certaines informations en mémoire peuvent affecter les cas ou tu dois répondre ou non.

      ✅ Réponds "OUI" si :
      - Le bot est EXPLICITEMENT mentionné par son nom (Jean pascal, JP, jp, Jean pascalou, Jean, yo jean, yo jean pascal, yo jp)
      - Le message contient "jp droit de réponse" ou "jean pascal droit de réponse"
      - Le bot a parlé dans les 2 DERNIERS messages ET le nouveau message est une réponse directe (même sans mention explicite)
      - Le bot vient de poser une question ET l'utilisateur y répond
      - Une demande d'action Discord EXPLICITE et DIRECTE est faite ("rejoins le vocal", "déplace moi", "crée un salon", "kick X")

      🔥 CAS SPÉCIAL - CONTINUITÉ DE CONVERSATION :
      Si le DERNIER message est du bot ET qu'il pose une question ou engage la conversation (ex: "T'as besoin d'un truc ou t'es juste en mode small talk ?"), alors le message suivant de l'utilisateur est FORCÉMENT une réponse au bot → "OUI"

      Exemples de continuité :
      - Bot: "T'as besoin d'un truc ?" → User: "ouais en mode small talk" → OUI
      - Bot: "Ça va ?" → User: "ouais tranquille" → OUI
      - Bot: "Tu veux quoi ?" → User: "rien juste parler" → OUI

      ❌ Réponds "NON" dans ces cas :

      **Questions générales au groupe (NE PAS RÉPONDRE) :**
      - "qui fait...", "quelqu'un pour...", "on fait quoi", "vous faites quoi"
      - "qui veut...", "ça vous dit de...", "vous êtes où"
      - Toute question posée au groupe sans mention du bot

      **Conversations entre utilisateurs (NE PAS INTERROMPRE) :**
      - 2+ utilisateurs qui discutent entre eux SANS que le bot ait participé récemment
      - Échanges qui ne mentionnent pas le bot ET le bot n'a pas parlé dans les 3 derniers messages

      **Messages ambigus SANS contexte (DOUTE = NON) :**
      - Salutations générales ("salut", "yo", "ça va", "coucou") SAUF si le bot vient de parler
      - Messages qui pourraient s'adresser à quelqu'un d'autre
      - Contexte où le bot n'a clairement pas sa place

      **Parler DU bot sans l'interpeller (NE PAS RÉPONDRE) :**
      - Messages qui parlent du bot à la 3ème personne ("il", "le bot", "jean pascal fait...")
      - Discussions ENTRE utilisateurs À PROPOS du bot
      - Commentaires sur le comportement du bot sans demande directe

      ⚙️ RÈGLES DE CONTEXTE :
      - Si le DERNIER message est du bot → le message suivant est probablement pour lui → "OUI"
      - Si le bot a parlé il y a 2 messages → vérifier si c'est une réponse naturelle → "OUI" si oui
      - Si le bot a parlé il y a 3+ messages ET n'est pas mentionné → "NON"
      - Si plusieurs personnes discutent et le bot n'a pas parlé récemment → "NON"
      - Si le message commence par un nom d'utilisateur (ex: "@user") → "NON" (sauf si c'est le bot)

      🎯 PRINCIPE DIRECTEUR :
      Le bot doit maintenir les conversations qu'il a initiées ou auxquelles il participe activement. Si le bot vient de parler, il doit écouter la réponse.
    `,
    prompt: dedent`
      Conversation récente :
      ${conversation}
      
      Dernier message de ${message.author.username}: "${message.content}"
      
      Le bot doit-il répondre ?
    `,
    tools: {
      ...memoryTools,
    },
  });

  if (decision.output === "OUI") {
    logger.info(`Reply to ${message.author.displayName} based on AI decision`);
    await replyToMessage(message);
  }
});
