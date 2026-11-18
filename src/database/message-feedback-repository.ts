import type { messageFeedbackReactionEnum } from "#/database/schema";
import { postgres } from "#/database/client";
import { tableMessageFeedback } from "#/database/schema";

type MessageFeedbackReaction = typeof messageFeedbackReactionEnum.enumValues[number];

export type MessageFeedbackInput = {
  /** Content of the bot message that received the reaction */
  messageContent: string;
  /** Transcript of the recent conversation preceding the bot message */
  previousMessages: string;
  /** Human feedback reaction */
  reaction: MessageFeedbackReaction;
};

export const messageFeedbackRepository = {
  /** Store a feedback reaction (upvote/downvote) on one of the bot's messages, with the recent conversation as context */
  create: async (feedback: MessageFeedbackInput): Promise<void> => {
    await postgres.insert(tableMessageFeedback).values(feedback);
  },
};
