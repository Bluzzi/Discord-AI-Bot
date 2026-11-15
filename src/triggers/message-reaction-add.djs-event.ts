import type { ConversationMessage } from "#/utils/conversation";
import type { MessageReaction, User } from "discord.js";
import { postgres } from "#/postgres/client";
import { tableMessageFeedback } from "#/postgres/schema";
import { conversation } from "#/utils/conversation";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import dedent from "dedent";

trigger.discordEvent("messageReactionAdd", async (rawReaction, rawReactor) => {
  // Unicode emoji names, as reported by Discord:
  const feedbackReaction = rawReaction.emoji.name === "👍" ? "upvote" : rawReaction.emoji.name === "👎" ? "downvote" : undefined;

  if (!feedbackReaction) return;

  // Ignore reactions made by bots: only human reactions convey feedback:
  if (rawReactor.bot) return;

  // Reactions and their message can be partial: fetch the full versions:
  const reaction: MessageReaction = rawReaction.partial ? await rawReaction.fetch() : rawReaction;
  const reactor: User = rawReactor.partial ? await rawReactor.fetch() : rawReactor;
  const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;

  // Fetch the 5 previous messages in the channel for context:
  const previousMessages = await message.channel.messages.fetch({ limit: 5, before: message.id });

  const conversationMessages: ConversationMessage[] = [...previousMessages.values()].map((previousMessage) => ({
    id: previousMessage.id,
    authorId: previousMessage.author.id,
    timestamp: previousMessage.createdTimestamp,
    label: conversation.resolveAuthorLabel(previousMessage.member?.displayName, previousMessage.author.globalName, previousMessage.author.username),
    content: previousMessage.content,
    isSelf: previousMessage.author.id === env.DISCORD_BOT_ID,
  }));

  const transcript = conversation.buildTranscript(conversationMessages);

  // Store the feedback:
  await postgres.insert(tableMessageFeedback).values({
    authorType: message.author.bot ? "bot" : "discord_user",
    authorId: message.author.id,
    messageContent: message.content,
    previousMessages: transcript,
    reaction: feedbackReaction,
  });

  logger.info(dedent`
    Message feedback stored:
    - [REACTION] ${feedbackReaction} by ${reactor.username}
    - [AUTHOR] ${message.author.username} (${message.author.bot ? "bot" : "discord_user"}): ${message.content}
  `);
});
