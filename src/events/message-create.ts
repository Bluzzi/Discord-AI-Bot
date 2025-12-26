import { discord } from "#/discord";
import { replyToMessage } from "#/features/reply-to-message";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import OpenAI from "openai";

const mistral = new OpenAI({
  apiKey: env.MISTRAL_API_KEY,
  baseURL: env.MISTRAL_BASE_URL,
});

discord.client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!discord.client.user) return;
  if (!message.channel.isTextBased()) return;

  if (!message.guildId) {
    logger.info(`Reply to ${message.author.username} in DM (100%)`);
    await replyToMessage(message);
    return;
  }

  if (message.mentions.has(discord.client.user.id)) {
    logger.info(`Reply to ${message.author.displayName} based on mention (100%)`);
    await replyToMessage(message);
    return;
  }

  try {
    const lastMessages = await message.channel.messages.fetch({ limit: 10 });
    const messagesArray = Array.from(lastMessages.values()).reverse();

    const botMember = await message.guild?.members.fetch(discord.client.user.id);
    const botNames = [
      discord.client.user.username,
      botMember?.displayName,
      botMember?.nickname,
    ].filter(Boolean).join(", ");

    const conversationContext = messagesArray.map((msg) => `${msg.author.username}: ${msg.content}`,
    ).join("\n");

    const decision = await mistral.chat.completions.create({
      model: "mistral-small-latest",
      messages: [
        {
          role: "system",
          content: `Tu es un assistant qui détermine si le bot Discord nommé "${botNames}" (aussi appelé "jp" ou "jean pascal") doit répondre à un message.

📋 ANALYSE REQUISE:
1. Identifier qui parle dans les derniers messages
2. Repérer si le bot a participé récemment (3 derniers messages)
3. Déterminer si le nouveau message s'adresse au bot ou aux autres utilisateurs

✅ Réponds "OUI" UNIQUEMENT si:
- Le bot est EXPLICITEMENT mentionné par son nom (Jean pascal, JP, jp, Jean pascalou, Jean, yo jean, yo jean pascal, yo jp) REPOND QUAND ON TE DIS JP
- Le message contient "jp droit de réponse" ou "jean pascal droit de réponse"
- Le bot a parlé dans les 2 derniers messages ET le nouveau message est CLAIREMENT une réponse directe au bot (pas une conversation parallèle)
- Une demande d'action Discord EXPLICITE et DIRECTE est faite ("rejoins le vocal", "déplace moi", "crée un salon", "kick X")

❌ Réponds "NON" dans TOUS les autres cas, notamment:

**Questions générales (NE PAS RÉPONDRE):**
- "qui fait...", "quelqu'un pour...", "on fait quoi", "vous faites quoi"
- "qui veut...", "ça vous dit de...", "vous êtes où"
- Toute question posée au groupe sans mention du bot

**Conversations entre utilisateurs (NE PAS INTERROMPRE):**
- 2+ utilisateurs qui discutent entre eux
- Échanges qui ne mentionnent pas le bot
- Le bot n'a pas parlé dans les 3 derniers messages ET n'est pas mentionné

**Messages ambigus (DOUTE = NON):**
- Salutations générales ("salut", "yo", "ça va", "coucou")
- Messages qui pourraient s'adresser à quelqu'un d'autre
- Ton qui suggère que le bot serait importun
- Contexte où le bot n'a pas sa place

**Parler DU bot (NE PAS RÉPONDRE):**
- Messages qui parlent du bot à la 3ème personne sans l'interpeller ("il", "le bot", "jean pascal fait...", "jp a dit...")
- Discussions ENTRE utilisateurs À PROPOS du bot
- Commentaires sur le comportement du bot sans demande directe

**Messages hostiles:**
- Rejets explicites du bot
- Ton agressif ou moqueur envers le bot

⚙️ RÈGLES DE CONTEXTE:
- Si le bot a parlé il y a 1-2 messages ET que le nouveau message est une réponse naturelle directe → "OUI"
- Si le bot a parlé il y a 3+ messages ET n'est pas mentionné → "NON"
- Si plusieurs personnes discutent et le bot n'est pas mentionné → "NON"
- Si le message commence par un nom d'utilisateur (ex: "@user") → "NON" (sauf si c'est le bot)
- En cas de DOUTE sur le destinataire → "NON"

🎯 PRINCIPE DIRECTEUR:
Le bot doit être un participant actif quand sollicité, mais JAMAIS un intrus. En cas de doute, ne pas répondre.

Réponds UNIQUEMENT par "OUI" ou "NON".`,
        },
        {
          role: "user",
          content: `Conversation récente:\n${conversationContext}\n\nDernier message de ${message.author.username}: "${message.content}"\n\nLe bot doit-il répondre ?`,
        },
      ],
      temperature: 0.15,
      max_tokens: 10,
    });

    const shouldReply = decision.choices[0]?.message?.content?.trim().toUpperCase() === "OUI";

    if (shouldReply) {
      logger.info(`Reply to ${message.author.displayName} based on AI decision`);
      await replyToMessage(message);
    }
    else {
      logger.info(`Skipping message from ${message.author.displayName} - AI decided not to reply`);
    }
  }
  catch (error) {
    logger.error(`Error in AI decision: ${error instanceof Error ? error.message : String(error)}`);
  }
});
