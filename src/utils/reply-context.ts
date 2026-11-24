import type { UserContent } from "ai";
import { discordClient, downloadDiscordAttachment } from "#/integrations/discord";
import { openRouterApi } from "#/integrations/openrouter";
import { attempt } from "#/utils/attempt";
import { env } from "#/utils/env";

export const getReplyContext = async (channelId: string, messageId: string) => {
  const attachmentUrls = new Map<string, { url: string; size: number }>();

  // Verify that the current channel supports message history:
  const channel = await discordClient.channels.fetch(channelId);
  if (channel?.isTextBased() !== true) {
    throw new Error("Channel not found or not a text channel");
  }

  const guild = "guild" in channel ? channel.guild : null;

  // Fetch the target and its history without including later messages:
  const previousMessages = await channel.messages.fetch({ limit: 10, before: messageId });
  const targetMessage = await channel.messages.fetch(messageId);

  const referencedMessageId = targetMessage.reference?.messageId ?? null;
  const referencedMessage = referencedMessageId === null ? undefined : previousMessages.get(referencedMessageId);

  // Render the conversation in order and neutralize forged author prefixes:
  const forgedPrefixPattern = /^\[[^\]\n]{0,80}\(ID[^\]\n]{0,80}\)\]\s*:?/gmu;
  const conversationItems = [...previousMessages.values(), targetMessage]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => ({
      id: message.id,
      authorId: message.author.id,
      authorLabel: message.member?.displayName ?? message.author.globalName ?? message.author.username,
      content: message.content.replace(forgedPrefixPattern, (match) => match.replaceAll("[", "［").replaceAll("]", "］")),
      attachments: message.attachments.map(({ id, name, url, contentType, size }) => ({ id, name, url, mediaType: contentType, size })),
      isSelf: message.author.id === env.DISCORD_BOT_ID,
      isTarget: message.id === messageId,
      createdAt: message.createdAt.toISOString(),
    }));

  // Register available attachments for the other tools in this run:
  for (const { attachments } of conversationItems) {
    for (const { id, url, size } of attachments) attachmentUrls.set(id, { url, size });
  }

  // Prepare the channel, conversation and target references for the model:
  const output = {
    channel: {
      id: channel.id,
      name: "name" in channel ? channel.name : null,
      isDm: guild === null,
      guildId: guild?.id ?? null,
      guildName: guild?.name ?? null,
    },
    conversation: conversationItems,
    referencedMessageId,
    referencedAuthorId: referencedMessage?.author.id ?? null,
    mentionedUserIds: [...targetMessage.mentions.users.values()].filter((user) => user.id !== env.DISCORD_BOT_ID).map((user) => user.id),
    mentionedChannelIds: [...targetMessage.mentions.channels.values()].map((mentionedChannel) => mentionedChannel.id),
  };

  // Prefer images from the target message, then the referenced message:
  const imagePriority = ({ id, isTarget }: (typeof output.conversation)[number]) => {
    if (isTarget) return 0;
    return id === output.referencedMessageId ? 1 : 2;
  };
  const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  const images = output.conversation.toReversed()
    .sort((a, b) => imagePriority(a) - imagePriority(b))
    .flatMap(({ id: messageId, isTarget, attachments }) => attachments.map((attachment) => ({ ...attachment, messageId, isTarget })))
    .filter(({ mediaType }) => mediaType !== null && supportedImageTypes.has(mediaType));
  const content: UserContent = [{ type: "text", text: JSON.stringify(output) }];
  if (images.length === 0 || !await openRouterApi.acceptsImages(env.OPENROUTER_MODEL)) return { content, attachmentUrls };

  // Download images within the shared byte budget for inline delivery:
  const signal = AbortSignal.timeout(20_000);
  let remainingBytes = 10 * 1024 * 1024;
  for (const { id, url, mediaType, size, messageId, isTarget } of images) {
    if (mediaType === null || size > remainingBytes) continue;
    const image = await attempt(async () => downloadDiscordAttachment(url, remainingBytes, signal));
    if (!image.ok || image.value.length === 0) continue;
    remainingBytes -= image.value.length;
    content.push(
      { type: "text", text: `Inline image from Discord message ${messageId}${isTarget ? " (target message)" : ""}, attachment ${id}.` },
      { type: "image", image: image.value, mediaType },
    );
  }

  return { content, attachmentUrls };
};
