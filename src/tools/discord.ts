import type { ToolSet } from "ai";
import type { ActivitiesOptions, APIActionRowComponent, APIButtonComponent, APIButtonComponentWithURL, GuildVoiceChannelResolvable, RouteLike } from "discord.js";
import { createAudioResource, entersState, joinVoiceChannel, StreamType, VoiceConnectionStatus } from "@discordjs/voice";
import { discordClient, fetchDiscordChannel, fetchDiscordTextChannel, fetchDiscordSendableChannel, fetchDiscordVoiceConnection, getDiscordAudioPlayer, replaceDiscordAudio, sanitizeDiscordMessage, splitDiscordMessage } from "#/integrations/discord";
import { tool } from "ai";
import { ActivityType, AuditLogEvent, ButtonStyle, ChannelType, ComponentType, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, InviteTargetType, MessageFlags, MessagePayload, parseEmoji, RequestMethod, Routes, ThreadAutoArchiveDuration, WebhookClient } from "discord.js";
import { Readable } from "node:stream";
import { z } from "zod";

const id = z.string().regex(/^\d{1,20}$/u);
const pathSegment = z.string().min(1).regex(/^[\w-]+$/u);
const text = z.string();
const integer = z.number().int();
const flag = z.boolean();
const date = z.iso.datetime({ offset: true });
const jsonObject = z.record(z.string(), z.json());
const ids = z.array(id);
const limit = integer.min(1).max(100).optional();
const page = z.object({ limit, before: id.optional(), after: id.optional() });
const reason = text.max(512).optional();
const image = z.string().regex(/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/u);
const mediaUrl = z.url({ protocol: /^https?$/u });
const webhookFields = z.object({ name: text, avatar: text.nullable(), channel_id: id }).partial();
const entityType = integer.min(1).max(3);

type ActionOptions = {
  query?: z.ZodObject;
  body?: z.ZodType;
  audit?: boolean;
};

const action = (description: string, method: RequestMethod, path: RouteLike, { query, body, audit }: ActionOptions = {}) => {
  const segments = Array.from(path.matchAll(/:([a-z]\w*)/gu), ([, key]) => key!);
  const params = z.object(Object.fromEntries(segments.map((key) => [key, key.endsWith("Id") && key !== "instanceId" ? id : pathSegment])));
  const inputSchema = params.extend({
    ...(query === undefined ? {} : { query: query.safeParse({}).success ? query.optional() : query }),
    ...(body === undefined ? {} : { body }),
    ...(audit === true ? { reason } : {}),
  });

  return tool({
    description,
    inputSchema,
    execute: async (input) => {
      const route = path.replace(/:([a-z]\w*)/gu, (_match, key: string) => encodeURIComponent(params.shape[key]!.parse(input[key]))) as RouteLike;
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(query?.parse(input.query ?? {}) ?? {})) {
        if (value !== undefined) {
          const items = Array.isArray(value) && key !== "include_roles" ? value : [value];
          for (const item of items) {
            searchParams.append(key, String(item));
          }
        }
      }

      const result = await discordClient.rest.request({
        method,
        fullRoute: route,
        body: body?.parse(input.body),
        query: searchParams,
        reason: audit === true ? reason.parse(input.reason) : undefined,
      });

      if (result instanceof ArrayBuffer) {
        return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      }
      return result ?? {};
    },
  });
};

const { Get, Post, Patch, Put, Delete } = RequestMethod;
const memberSearch = z.object({ query: text.min(1), limit });
const permissionOverwrite = z.object({
  id,
  type: z.union([z.literal(0), z.literal(1)]),
  allow: z.string().regex(/^\d+$/u).optional(),
  deny: z.string().regex(/^\d+$/u).optional(),
});
const forumTag = z.object({
  id: id.optional(),
  name: text.min(1).max(20),
  moderated: flag.optional(),
  emoji_id: id.nullable().optional(),
  emoji_name: text.nullable().optional(),
});
const roleFields = z.object({
  name: text.max(100),
  permissions: z.string().regex(/^\d+$/u),
  colors: z.object({ primary_color: integer, secondary_color: integer.optional(), tertiary_color: integer.optional() }),
  hoist: flag,
  mentionable: flag,
  icon: image.nullable(),
  unicode_emoji: text.nullable(),
}).partial();
const stageFields = z.object({
  topic: text.min(1).max(120),
  privacy_level: z.literal(2).optional(),
});
const autoModFields = z.object({
  name: text.min(1),
  event_type: integer,
  trigger_metadata: jsonObject,
  actions: z.array(z.object({ type: integer, metadata: jsonObject.optional() })),
  enabled: flag,
  exempt_roles: ids,
  exempt_channels: ids,
});
const eventFields = z.object({
  name: text.min(1).max(100),
  description: text.max(1000).nullable(),
  scheduled_start_time: date,
  scheduled_end_time: date.nullable(),
  channel_id: id.nullable(),
  entity_type: entityType,
  entity_metadata: z.object({ location: text.max(100) }).nullable(),
  privacy_level: z.literal(2),
  status: integer.min(1).max(4),
  image: image.nullable(),
  recurrence_rule: jsonObject.nullable(),
}).partial();
const stickerFields = z.object({ name: text.min(2).max(30), description: text.max(100).nullable(), tags: text.max(200) });
const guildWebhooks = z.object({ guildId: id });
const webhookId = z.object({ webhookId: id });
const webhookMessage = webhookId.extend({ messageId: id, threadId: id.optional() });
const messageTarget = z.object({ channelId: id, messageId: id });
const reactionTarget = messageTarget.extend({ emoji: text.min(1).describe("Unicode emoji, name:id or custom emoji markup") });
const threadFields = z.object({
  name: text.min(1).max(100),
  auto_archive_duration: z.union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)]).optional(),
  rate_limit_per_user: integer.min(0).max(21600).optional(),
});
const messageFields = z.object({
  content: text.max(2000),
  embeds: z.array(jsonObject).max(10),
  components: z.array(jsonObject),
  sticker_ids: ids.max(3),
  flags: integer.nonnegative(),
}).partial();
const allowedMentions = { parse: ["users", "roles"] };

const reactionIdentifier = (emoji: string) => {
  const resolved = parseEmoji(emoji);
  if (resolved === null) {
    throw new Error("Invalid emoji");
  }
  return encodeURIComponent(resolved.id === undefined ? resolved.name : `${resolved.name}:${resolved.id}`);
};

const webhookSummary = (webhook: { id: string; name: string | null; channelId: string; type: number; avatarURL: () => string | null }) => ({
  id: webhook.id,
  name: webhook.name,
  channelId: webhook.channelId,
  type: webhook.type,
  avatarUrl: webhook.avatarURL(),
});

export const discordTools = {
  // Guilds And Members
  getBotGuilds: action("List guilds the bot belongs to.", Get, "/users/@me/guilds", {
    query: page.extend({ limit: integer.min(1).max(200).optional(), with_counts: flag.optional() }),
  }),
  getGuildDetails: action("Get full guild settings and features.", Get, "/guilds/:guildId", { query: z.object({ with_counts: flag.optional() }) }),
  editGuild: action("Edit guild settings.", Patch, "/guilds/:guildId", {
    audit: true,
    body: z.object({
      name: text.min(2).max(100),
      description: text.max(120).nullable(),
      verification_level: integer.min(0).max(4),
      default_message_notifications: integer.min(0).max(1),
      explicit_content_filter: integer.min(0).max(2),
      afk_channel_id: id.nullable(),
      afk_timeout: integer,
      icon: image.nullable(),
      splash: image.nullable(),
      discovery_splash: image.nullable(),
      banner: image.nullable(),
      system_channel_id: id.nullable(),
      system_channel_flags: integer,
      rules_channel_id: id.nullable(),
      public_updates_channel_id: id.nullable(),
      safety_alerts_channel_id: id.nullable(),
      preferred_locale: text,
      features: z.array(text),
      premium_progress_bar_enabled: flag,
    }).partial(),
  }),
  leaveGuild: action("Make the bot leave a guild.", Delete, "/users/@me/guilds/:guildId"),
  listGuildMembers: action("List guild members by user ID page.", Get, "/guilds/:guildId/members", {
    query: z.object({ limit: integer.min(1).max(1000).optional(), after: id.optional() }),
  }),
  searchGuildMembers: action("Find guild members by username or nickname prefix.", Get, "/guilds/:guildId/members/search", {
    query: memberSearch.extend({ limit: integer.min(1).max(1000).optional() }),
  }),
  getGuildMember: action("Get a guild member, including assigned role IDs.", Get, "/guilds/:guildId/members/:userId"),
  getGuildMemberPermissions: action("Get a member's computed guild permissions.", Get, "/guilds/:guildId/permissions/member/:userId"),
  getGuildRolePermissions: action("Get a role's computed guild permissions.", Get, "/guilds/:guildId/permissions/role/:roleId"),
  setMemberRoles: action("Replace a guild member's complete list of roles.", Patch, "/guilds/:guildId/members/:userId", {
    audit: true,
    body: z.object({ roles: ids }),
  }),
  removeMemberTimeout: action("Remove a guild member's timeout.", Patch, "/guilds/:guildId/members/:userId", {
    audit: true,
    body: z.object({ communication_disabled_until: z.null().default(null) }).default({ communication_disabled_until: null }),
  }),
  kickMember: action("Remove a member from a guild.", Delete, "/guilds/:guildId/members/:userId", { audit: true }),
  getGuildBans: action("List guild bans.", Get, "/guilds/:guildId/bans", { query: page.extend({ limit: integer.min(1).max(1000).optional() }) }),
  getGuildBan: action("Get a guild ban.", Get, "/guilds/:guildId/bans/:userId"),
  banMember: action("Ban a user from a guild.", Put, "/guilds/:guildId/bans/:userId", {
    audit: true,
    body: z.object({ delete_message_seconds: integer.min(0).max(604800).optional() }).default({}),
  }),
  bulkBanMembers: action("Ban up to 200 users from a guild.", Post, "/guilds/:guildId/bulk-ban", {
    audit: true,
    body: z.object({ user_ids: ids.min(1).max(200), delete_message_seconds: integer.min(0).max(604800).optional() }),
  }),
  unbanMember: action("Remove a user's guild ban.", Delete, "/guilds/:guildId/bans/:userId", { audit: true }),
  getPruneCount: action("Count inactive members a prune would remove.", Get, "/guilds/:guildId/prune", {
    query: z.object({ days: integer.min(1).max(30).optional(), include_roles: ids.optional().describe("Role IDs as an array") }),
  }),
  pruneMembers: action("Remove inactive guild members.", Post, "/guilds/:guildId/prune", {
    audit: true,
    body: z.object({ days: integer.min(1).max(30), compute_prune_count: flag.optional(), include_roles: ids.optional() }),
  }),
  editGuildIncidentActions: action("Temporarily pause guild invites or DMs. Null resumes them.", Put, "/guilds/:guildId/incident-actions", {
    body: z.object({ invites_disabled_until: date.nullable(), dms_disabled_until: date.nullable() }).partial(),
  }),

  // Channels And Threads
  getChannelDetails: action("Get full channel settings and permission overwrites.", Get, "/channels/:channelId"),
  editChannel: action("Edit a channel or thread.", Patch, "/channels/:channelId", {
    audit: true,
    body: z.object({
      name: text.min(1).max(100),
      type: integer,
      position: integer.nonnegative(),
      topic: text.max(4096).nullable(),
      nsfw: flag,
      rate_limit_per_user: integer.min(0).max(21600),
      bitrate: integer,
      user_limit: integer,
      permission_overwrites: z.array(permissionOverwrite),
      parent_id: id.nullable(),
      rtc_region: text.nullable(),
      video_quality_mode: integer.min(1).max(2),
      default_auto_archive_duration: z.union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)]),
      flags: integer.nonnegative(),
      available_tags: z.array(forumTag),
      applied_tags: ids,
      default_reaction_emoji: z.object({ emoji_id: id.nullable().optional(), emoji_name: text.nullable().optional() }).nullable(),
      default_thread_rate_limit_per_user: integer.min(0).max(21600),
      default_sort_order: integer.min(0).max(1).nullable(),
      default_forum_layout: integer.min(0).max(2),
      archived: flag,
      auto_archive_duration: integer,
      locked: flag,
      invitable: flag,
    }).partial(),
  }),
  deleteChannel: action("Delete a guild channel or close a DM.", Delete, "/channels/:channelId", { audit: true }),
  reorderChannels: action("Reorder or move guild channels.", Patch, "/guilds/:guildId/channels", {
    audit: true,
    body: z.array(z.object({ id, position: integer.nonnegative().nullable().optional(), lock_permissions: flag.nullable().optional(), parent_id: id.nullable().optional() })).min(1),
  }),
  setChannelPermission: action("Set a channel permission overwrite. Allow and deny are decimal bitsets.", Put, "/channels/:channelId/permissions/:overwriteId", {
    audit: true,
    body: permissionOverwrite.omit({ id: true }),
  }),
  deleteChannelPermission: action("Delete a channel permission overwrite.", Delete, "/channels/:channelId/permissions/:overwriteId", { audit: true }),
  getChannelMemberPermissions: action("Get a member's computed permissions in a channel.", Get, "/channels/:channelId/permissions/member/:userId", {
    query: z.object({ implicit: flag.optional() }),
  }),
  getChannelRolePermissions: action("Get a role's computed permissions in a channel.", Get, "/channels/:channelId/permissions/role/:roleId", {
    query: z.object({ implicit: flag.optional() }),
  }),
  followAnnouncementChannel: action("Forward announcements to a destination channel.", Post, "/channels/:channelId/followers", {
    body: z.object({ webhook_channel_id: id }),
  }),
  triggerTyping: action("Show the bot's typing indicator in a channel.", Post, "/channels/:channelId/typing"),
  createPrivateThread: action("Create a private thread in a guild text channel.", Post, "/channels/:channelId/threads", {
    audit: true,
    body: threadFields.extend({ type: z.literal(12).default(12), invitable: flag.optional() }),
  }),
  createForumPost: tool({
    description: "Create a post in a forum or media channel.",
    inputSchema: z.object({ channelId: id, body: threadFields.extend({ message: messageFields, applied_tags: ids.max(5).optional() }), reason }),
    execute: async ({ channelId, body, reason }) => discordClient.rest.post(Routes.threads(channelId), {
      body: { ...body, message: { ...body.message, allowed_mentions: allowedMentions } },
      reason,
    }),
  }),
  getActiveThreads: action("List active guild threads visible to the bot.", Get, "/guilds/:guildId/threads/active"),
  getPublicArchivedThreads: action("List archived public threads in a channel.", Get, "/channels/:channelId/threads/archived/public", {
    query: z.object({ limit, before: date.optional() }),
  }),
  getPrivateArchivedThreads: action("List archived private threads in a channel.", Get, "/channels/:channelId/threads/archived/private", {
    query: z.object({ limit, before: date.optional() }),
  }),
  getJoinedArchivedThreads: action("List archived private threads the bot joined.", Get, "/channels/:channelId/users/@me/threads/archived/private", {
    query: z.object({ limit, before: id.optional() }),
  }),
  joinThread: action("Join a thread.", Put, "/channels/:threadId/thread-members/@me"),
  leaveThread: action("Leave a thread.", Delete, "/channels/:threadId/thread-members/@me"),
  addThreadMember: action("Add a guild member to a thread.", Put, "/channels/:threadId/thread-members/:userId"),
  removeThreadMember: action("Remove a member from a thread.", Delete, "/channels/:threadId/thread-members/:userId"),
  getThreadMember: action("Get a thread member.", Get, "/channels/:threadId/thread-members/:userId", {
    query: z.object({ with_member: flag.optional() }),
  }),
  getThreadMembers: action("List thread members.", Get, "/channels/:threadId/thread-members", {
    query: z.object({ with_member: flag.optional(), after: id.optional(), limit }),
  }),

  // Messages And Polls
  getMessage: action("Get a message by ID.", Get, "/channels/:channelId/messages/:messageId"),
  searchGuildMessages: action("Search indexed guild messages.", Get, "/guilds/:guildId/messages/search", {
    query: z.object({
      content: text.max(1024),
      channel_id: ids.max(500),
      author_id: ids.max(100),
      author_type: z.array(text),
      mentions: ids.max(100),
      mentions_role_id: ids.max(100),
      mention_everyone: flag,
      pinned: flag,
      has: z.array(text),
      embed_type: z.array(text),
      embed_provider: z.array(text).max(100),
      link_hostname: z.array(text).max(100),
      attachment_filename: z.array(text).max(100),
      attachment_extension: z.array(text).max(100),
      replied_to_user_id: ids.max(100),
      replied_to_message_id: ids.max(100),
      include_nsfw: flag,
      sort_by: z.enum(["timestamp", "relevance"]),
      sort_order: z.enum(["asc", "desc"]),
      slop: integer.min(0).max(100),
      limit: integer.min(1).max(25),
      offset: integer.min(0).max(9975),
      min_id: id,
      max_id: id,
    }).partial(),
  }),
  sendRichMessage: tool({
    description: "Send a Discord message with embeds, components, stickers, TTS or files.",
    inputSchema: z.object({
      channelId: id,
      body: messageFields.extend({ tts: flag.optional(), files: z.array(z.object({ url: mediaUrl, name: text.min(1) })).max(10).optional() }),
    }),
    execute: async ({ channelId, body: { files, ...body } }) => {
      return discordClient.rest.post(Routes.channelMessages(channelId), {
        body: { ...body, attachments: files?.map(({ name }, index) => ({ id: index, filename: name })), allowed_mentions: allowedMentions },
        files: files === undefined ? undefined : await Promise.all(files.map(async ({ url, name }) => MessagePayload.resolveFile({ attachment: url, name }))),
      });
    },
  }),
  editRichMessage: tool({
    description: "Edit the text, embeds, components or retained attachments of the bot's message.",
    inputSchema: messageTarget.extend({
      body: messageFields.omit({ sticker_ids: true }).extend({
        content: text.max(2000).nullable().optional(),
        attachments: z.array(z.object({ id, description: text.max(1024).optional() })).optional(),
      }),
    }),
    execute: async ({ channelId, messageId, body }) => discordClient.rest.patch(Routes.channelMessage(channelId, messageId), {
      body: { ...body, allowed_mentions: allowedMentions },
    }),
  }),
  sendVoiceMessage: tool({
    description: "Send a voice message using an Ogg Opus audio URL and its waveform.",
    inputSchema: z.object({ channelId: id, url: mediaUrl, durationSeconds: z.number().positive(), waveform: text.min(1).max(344) }),
    execute: async ({ channelId, url, durationSeconds, waveform }) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Could not download the voice message (HTTP ${String(response.status)})`);
      }
      return discordClient.rest.post(Routes.channelMessages(channelId), {
        files: [{ data: Buffer.from(await response.arrayBuffer()), name: "voice-message.ogg", contentType: "audio/ogg" }],
        body: {
          flags: MessageFlags.IsVoiceMessage,
          attachments: [{ id: 0, filename: "voice-message.ogg", duration_secs: durationSeconds, waveform }],
        },
      });
    },
  }),
  forwardMessage: tool({
    description: "Forward an existing message to another channel.",
    inputSchema: messageTarget.extend({ toChannelId: id, guildId: id.optional() }),
    execute: async ({ channelId, messageId, toChannelId, guildId }) => discordClient.rest.post(Routes.channelMessages(toChannelId), {
      body: { message_reference: { type: 1, channel_id: channelId, message_id: messageId, guild_id: guildId }, allowed_mentions: { parse: [] } },
    }),
  }),
  crosspostMessage: action("Publish an announcement message to following channels.", Post, "/channels/:channelId/messages/:messageId/crosspost"),
  bulkDeleteMessages: action("Delete 2–100 guild messages less than two weeks old.", Post, "/channels/:channelId/messages/bulk-delete", {
    audit: true,
    body: z.object({ messages: ids.min(2).max(100) }),
  }),
  unpinMessage: action("Unpin a message.", Delete, "/channels/:channelId/messages/pins/:messageId", { audit: true }),
  getReactionUsers: tool({
    description: "List users who used an emoji reaction.",
    inputSchema: reactionTarget.extend({ after: id.optional(), limit, type: z.union([z.literal(0), z.literal(1)]).optional().describe("0 normal, 1 super reaction") }),
    execute: async ({ channelId, messageId, emoji, after, limit, type }) => {
      const query = new URLSearchParams();
      if (after !== undefined) query.set("after", after);
      if (limit !== undefined) query.set("limit", String(limit));
      if (type !== undefined) query.set("type", String(type));
      return discordClient.rest.get(Routes.channelMessageReaction(channelId, messageId, reactionIdentifier(emoji)), { query });
    },
  }),
  removeReaction: tool({
    description: "Remove the bot's reaction or a specified user's reaction.",
    inputSchema: reactionTarget.extend({ userId: id.optional() }),
    execute: async ({ channelId, messageId, emoji, userId }) => {
      const reaction = reactionIdentifier(emoji);
      const route = userId === undefined ? Routes.channelMessageOwnReaction(channelId, messageId, reaction) : Routes.channelMessageUserReaction(channelId, messageId, reaction, userId);
      await discordClient.rest.delete(route);
      return {};
    },
  }),
  clearEmojiReactions: tool({
    description: "Remove all reactions with one emoji from a message.",
    inputSchema: reactionTarget,
    execute: async ({ channelId, messageId, emoji }) => {
      await discordClient.rest.delete(Routes.channelMessageReaction(channelId, messageId, reactionIdentifier(emoji)));
      return {};
    },
  }),
  clearMessageReactions: action("Remove all reactions from a message.", Delete, "/channels/:channelId/messages/:messageId/reactions"),
  endPoll: action("End a poll created by the bot.", Post, "/channels/:channelId/polls/:messageId/expire"),
  getPollVoters: action("List voters for a specific poll answer.", Get, "/channels/:channelId/polls/:messageId/answers/:answer", {
    query: z.object({ after: id.optional(), limit }),
  }),

  // Roles And Auto Mod
  getRole: action("Get a guild role and its permissions.", Get, "/guilds/:guildId/roles/:roleId"),
  editRole: action("Edit a guild role.", Patch, "/guilds/:guildId/roles/:roleId", { audit: true, body: roleFields }),
  deleteRole: action("Delete a guild role.", Delete, "/guilds/:guildId/roles/:roleId", { audit: true }),
  reorderRoles: action("Reorder guild roles.", Patch, "/guilds/:guildId/roles", {
    audit: true,
    body: z.array(z.object({ id, position: integer.min(1) })).min(1),
  }),
  getRoleMemberCounts: action("Get member counts by role in a guild.", Get, "/guilds/:guildId/roles/member-counts"),
  listAutoModerationRules: action("List guild AutoMod rules.", Get, "/guilds/:guildId/auto-moderation/rules"),
  getAutoModerationRule: action("Get an AutoMod rule.", Get, "/guilds/:guildId/auto-moderation/rules/:ruleId"),
  createAutoModerationRule: action("Create an AutoMod rule.", Post, "/guilds/:guildId/auto-moderation/rules", {
    audit: true,
    body: autoModFields.partial().required({ name: true, event_type: true, actions: true }).extend({ trigger_type: integer }),
  }),
  editAutoModerationRule: action("Edit an AutoMod rule.", Patch, "/guilds/:guildId/auto-moderation/rules/:ruleId", {
    audit: true,
    body: autoModFields.partial(),
  }),
  deleteAutoModerationRule: action("Delete an AutoMod rule.", Delete, "/guilds/:guildId/auto-moderation/rules/:ruleId", { audit: true }),

  // Voice And Stage
  controlVoiceAudio: tool({
    description: "Pause, resume or stop the bot's audio.",
    inputSchema: z.object({ guildId: id, operation: z.enum(["pause", "resume", "stop"]) }),
    execute: ({ guildId, operation }) => {
      const player = getDiscordAudioPlayer(fetchDiscordVoiceConnection(guildId));
      if (player === undefined) {
        throw new Error("No audio player in this guild");
      }
      const changed = operation === "pause" ? player.pause() : operation === "resume" ? player.unpause() : player.stop(true);
      return { changed };
    },
  }),
  setBotVoiceMute: tool({
    description: "Set the bot's own mute or deafen state in voice.",
    inputSchema: z.object({ guildId: id, mute: flag.optional(), deaf: flag.optional() }),
    execute: ({ guildId, mute, deaf }) => {
      const connection = fetchDiscordVoiceConnection(guildId);
      if (!connection.rejoin({
        channelId: connection.joinConfig.channelId,
        selfMute: mute ?? connection.joinConfig.selfMute,
        selfDeaf: deaf ?? connection.joinConfig.selfDeaf,
      })) {
        throw new Error("Voice state update failed");
      }
      return {};
    },
  }),
  getBotVoiceState: action("Get the bot's voice state in a guild.", Get, "/guilds/:guildId/voice-states/@me"),
  getMemberVoiceState: action("Get a member's voice state.", Get, "/guilds/:guildId/voice-states/:userId"),
  editBotStageVoiceState: action("Suppress the bot on stage or request to speak.", Patch, "/guilds/:guildId/voice-states/@me", {
    body: z.object({ channel_id: id, suppress: flag.optional(), request_to_speak_timestamp: date.nullable().optional() }),
  }),
  setStageMemberSuppressed: action("Set whether a stage member is suppressed.", Patch, "/guilds/:guildId/voice-states/:userId", {
    body: z.object({ channel_id: id, suppress: flag }),
  }),
  setVoiceChannelStatus: action("Set or clear a voice channel status.", Put, "/channels/:channelId/voice-status", {
    audit: true,
    body: z.object({ status: text.max(500).nullable() }),
  }),
  createStageInstance: action("Open a stage with a topic.", Post, "/stage-instances", {
    audit: true,
    body: stageFields.extend({ channel_id: id, send_start_notification: flag.optional(), guild_scheduled_event_id: id.optional() }),
  }),
  getStageInstance: action("Get the active stage in a channel.", Get, "/stage-instances/:channelId"),
  editStageInstance: action("Edit a stage instance.", Patch, "/stage-instances/:channelId", { audit: true, body: stageFields.partial() }),
  deleteStageInstance: action("Close a stage instance.", Delete, "/stage-instances/:channelId", { audit: true }),
  sendSoundboardSound: action("Play a soundboard sound in the bot's voice channel.", Post, "/channels/:channelId/send-soundboard-sound", {
    body: z.object({ sound_id: id, source_guild_id: id.optional() }),
  }),
  getDefaultSoundboardSounds: action("List default Discord soundboard sounds.", Get, "/soundboard-default-sounds"),
  getGuildSoundboardSounds: action("List guild soundboard sounds.", Get, "/guilds/:guildId/soundboard-sounds"),
  getGuildSoundboardSound: action("Get a guild soundboard sound.", Get, "/guilds/:guildId/soundboard-sounds/:soundId"),
  // Invites And Webhooks
  getInvite: action("Get an invite by code.", Get, "/invites/:code", {
    query: z.object({ with_counts: flag.optional(), with_expiration: flag.optional(), guild_scheduled_event_id: id.optional() }),
  }),
  getChannelInvites: action("List channel invites.", Get, "/channels/:channelId/invites"),
  getGuildInvites: action("List guild invites.", Get, "/guilds/:guildId/invites"),
  deleteInvite: action("Revoke an invite.", Delete, "/invites/:code", { audit: true }),
  getGuildWebhooks: tool({
    description: "List guild webhooks.",
    inputSchema: guildWebhooks,
    execute: async ({ guildId }) => {
      const guild = await discordClient.guilds.fetch(guildId);
      return (await guild.fetchWebhooks()).map(webhookSummary);
    },
  }),
  getWebhook: tool({
    description: "Get webhook details.",
    inputSchema: webhookId,
    execute: async ({ webhookId }) => webhookSummary(await discordClient.fetchWebhook(webhookId)),
  }),
  editWebhook: tool({
    description: "Edit a webhook's name, avatar or channel.",
    inputSchema: webhookId.extend({ body: webhookFields, reason }),
    execute: async ({ webhookId, body, reason }) => {
      const webhook = await discordClient.fetchWebhook(webhookId);
      return webhookSummary(await webhook.edit({ name: body.name, avatar: body.avatar, channel: body.channel_id, reason }));
    },
  }),
  deleteWebhook: action("Delete a webhook.", Delete, "/webhooks/:webhookId", { audit: true }),
  getWebhookMessage: tool({
    description: "Get a message sent by a webhook.",
    inputSchema: webhookMessage,
    execute: async ({ webhookId, messageId, threadId }) => {
      const webhook = await discordClient.fetchWebhook(webhookId);
      const message = await webhook.fetchMessage(messageId, { threadId });
      return { id: message.id, content: message.content, channelId: message.channelId, createdAt: message.createdAt.toISOString() };
    },
  }),
  editWebhookMessage: tool({
    description: "Edit the text of a webhook message.",
    inputSchema: webhookMessage.extend({ content: text.max(2000).nullable() }),
    execute: async ({ webhookId, messageId, threadId, content }) => {
      const webhook = await discordClient.fetchWebhook(webhookId);
      const message = await webhook.editMessage(messageId, { content, threadId, allowedMentions: { parse: ["users", "roles"] } });
      return { messageId: message.id };
    },
  }),
  deleteWebhookMessage: tool({
    description: "Delete a message sent by a webhook.",
    inputSchema: webhookMessage,
    execute: async ({ webhookId, messageId, threadId }) => {
      const webhook = await discordClient.fetchWebhook(webhookId);
      await webhook.deleteMessage(messageId, threadId);
      return {};
    },
  }),

  // Expressions and events
  getGuildEmoji: action("Get a custom guild emoji.", Get, "/guilds/:guildId/emojis/:emojiId"),
  editEmoji: action("Edit a guild emoji's name or allowed roles.", Patch, "/guilds/:guildId/emojis/:emojiId", {
    audit: true,
    body: z.object({ name: text.min(2).max(32), roles: ids.nullable() }).partial(),
  }),
  deleteEmoji: action("Delete a custom guild emoji.", Delete, "/guilds/:guildId/emojis/:emojiId", { audit: true }),
  getApplicationEmojis: action("List emojis owned by the application.", Get, "/applications/:applicationId/emojis"),
  getApplicationEmoji: action("Get an application emoji.", Get, "/applications/:applicationId/emojis/:emojiId"),
  getSticker: action("Get a sticker by ID.", Get, "/stickers/:stickerId"),
  getGuildStickers: action("List custom guild stickers.", Get, "/guilds/:guildId/stickers"),
  getGuildSticker: action("Get a custom guild sticker.", Get, "/guilds/:guildId/stickers/:stickerId"),
  createSticker: tool({
    description: "Create a guild sticker from a PNG, APNG, GIF or Lottie URL.",
    inputSchema: z.object({ guildId: id, url: mediaUrl, name: text.min(2).max(30), tags: text.max(200), description: text.max(100).optional(), reason }),
    execute: async ({ guildId, url, name, tags, description, reason }) => {
      const guild = await discordClient.guilds.fetch(guildId);
      const sticker = await guild.stickers.create({ file: url, name, tags, description, reason });
      return { id: sticker.id, name: sticker.name, url: sticker.url };
    },
  }),
  editSticker: action("Edit a custom guild sticker.", Patch, "/guilds/:guildId/stickers/:stickerId", { audit: true, body: stickerFields.partial() }),
  deleteSticker: action("Delete a custom guild sticker.", Delete, "/guilds/:guildId/stickers/:stickerId", { audit: true }),
  getGuildEvents: action("List scheduled guild events.", Get, "/guilds/:guildId/scheduled-events", {
    query: z.object({ with_user_count: flag.optional() }),
  }),
  getGuildEvent: action("Get a scheduled guild event.", Get, "/guilds/:guildId/scheduled-events/:eventId", {
    query: z.object({ with_user_count: flag.optional() }),
  }),
  editGuildEvent: action("Edit an event or change its status (1 scheduled, 2 active, 3 completed, 4 canceled).", Patch, "/guilds/:guildId/scheduled-events/:eventId", {
    audit: true,
    body: eventFields,
  }),
  deleteGuildEvent: action("Delete a scheduled guild event.", Delete, "/guilds/:guildId/scheduled-events/:eventId", { audit: true }),
  getGuildEventSubscribers: action("List users interested in a scheduled guild event.", Get, "/guilds/:guildId/scheduled-events/:eventId/users", {
    query: page.extend({ with_member: flag.optional() }),
  }),
  // Direct messages
  openDm: action("Open a direct message channel with a user.", Post, "/users/@me/channels", { body: z.object({ recipient_id: id }) }),

  // Guilds:

  getGuildInfo: tool({
    description: "Get a guild summary.",
    inputSchema: z.object({
      guildId: z.string(),
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      memberCount: z.number(),
      ownerId: z.string(),
      iconUrl: z.string().nullable(),
      createdAt: z.string(),
    }),
    execute: async ({ guildId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      return {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
        iconUrl: guild.iconURL(),
        createdAt: guild.createdAt.toISOString(),
      };
    },
  }),

  getAuditLog: tool({
    description: "List recent guild audit log entries.",
    inputSchema: z.object({
      guildId: z.string(),
      limit: z.number().int().min(1).max(100).optional().describe("Number of entries to fetch (default: 10)"),
      actionType: z.enum(AuditLogEvent).optional(),
      userId: z.string().optional(),
      before: z.string().optional(),
      after: z.string().optional(),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      action: z.string(),
      actionType: z.string(),
      executorId: z.string().nullable(),
      executorUsername: z.string().nullable(),
      targetId: z.string().nullable(),
      reason: z.string().nullable(),
      createdAt: z.string(),
    })),
    execute: async ({ guildId, limit = 10, actionType, userId, before, after }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const auditLogs = await guild.fetchAuditLogs({ limit, type: actionType, user: userId, before, after });

      return auditLogs.entries.map((entry) => ({
        id: entry.id,
        action: AuditLogEvent[entry.action],
        actionType: entry.actionType,
        executorId: entry.executorId,
        executorUsername: entry.executor?.username ?? null,
        targetId: entry.targetId,
        reason: entry.reason,
        createdAt: entry.createdAt.toISOString(),
      }));
    },
  }),

  // Channels:

  getChannels: tool({
    description: "List guild channels, optionally filtered by name.",
    inputSchema: z.object({
      guildId: z.string(),
      nameFilter: z.string().optional().describe("Filter channels by name (case-insensitive, spaces ignored)"),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
    })),
    execute: async ({ guildId, nameFilter }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      let channels = (await guild.channels.fetch()).filter((channel) => channel !== null).map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: ChannelType[channel.type],
      }));

      if (nameFilter !== undefined && nameFilter !== "") {
        const filter = nameFilter.toLowerCase().replace(/\s+/gu, "");
        channels = channels.filter((channel) => {
          const channelName = channel.name.toLowerCase().replace(/\s+/gu, "");
          return channelName.includes(filter);
        });
      }

      return channels;
    },
  }),

  getChannelInfo: tool({
    description: "Get a channel summary.",
    inputSchema: z.object({
      channelId: z.string(),
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string().nullable(),
      type: z.string(),
      guildId: z.string().nullable(),
      parentId: z.string().nullable(),
      nsfw: z.boolean().optional(),
      topic: z.string().nullable(),
    }),
    execute: async ({ channelId }) => {
      const channel = await fetchDiscordChannel(channelId);

      return {
        id: channel.id,
        name: "name" in channel ? channel.name : null,
        type: ChannelType[channel.type],
        guildId: "guild" in channel ? channel.guild.id : null,
        parentId: "parentId" in channel ? channel.parentId : null,
        nsfw: "nsfw" in channel ? channel.nsfw : undefined,
        topic: "topic" in channel ? channel.topic : null,
      };
    },
  }),

  createChannel: tool({
    description: "Create a guild channel.",
    inputSchema: z.object({
      guildId: z.string(),
      name: z.string().describe("The name for the new channel"),
      type: z.enum(["text", "voice", "category", "announcement", "stage", "forum", "media"]),
      categoryId: z.string().optional().describe("Category ID to place the channel under"),
    }),
    outputSchema: z.object({
      channelId: z.string(),
      channelName: z.string(),
      channelType: z.string(),
    }),
    execute: async ({ guildId, name, type, categoryId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const channelTypes = {
        text: ChannelType.GuildText,
        voice: ChannelType.GuildVoice,
        category: ChannelType.GuildCategory,
        announcement: ChannelType.GuildAnnouncement,
        stage: ChannelType.GuildStageVoice,
        forum: ChannelType.GuildForum,
        media: ChannelType.GuildMedia,
      } as const;

      const channel = await guild.channels.create({
        name,
        type: channelTypes[type],
        parent: categoryId ?? undefined,
      });

      return {
        channelId: channel.id,
        channelName: channel.name,
        channelType: type,
      };
    },
  }),

  renameChannel: tool({
    description: "Rename a channel.",
    inputSchema: z.object({
      channelId: z.string(),
      newName: z.string(),
    }),
    outputSchema: z.object({
      channelId: z.string(),
      oldName: z.string().nullable(),
      newName: z.string(),
    }),
    execute: async ({ channelId, newName }) => {
      const channel = await fetchDiscordChannel(channelId);
      if (!("setName" in channel)) {
        throw new Error("This channel type cannot be renamed");
      }

      const oldName = "name" in channel ? channel.name : null;
      await channel.setName(newName);

      return {
        channelId: channel.id,
        oldName,
        newName,
      };
    },
  }),

  setChannelTopic: tool({
    description: "Set or clear a channel topic.",
    inputSchema: z.object({
      channelId: z.string(),
      topic: z.string().max(1024).describe("The new channel topic (empty string to clear)"),
    }),
    outputSchema: z.object({
      channelId: z.string(),
      topic: z.string(),
    }),
    execute: async ({ channelId, topic }) => {
      const channel = await fetchDiscordChannel(channelId);
      if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement && channel.type !== ChannelType.GuildForum && channel.type !== ChannelType.GuildMedia) {
        throw new Error("Channel does not support topics");
      }

      await channel.edit({ topic: topic === "" ? null : topic });

      return {
        channelId: channel.id,
        topic,
      };
    },
  }),

  createThread: tool({
    description: "Create a thread, optionally from a message.",
    inputSchema: z.object({
      channelId: z.string(),
      name: z.string().describe("The thread name"),
      messageId: z.string().optional().describe("Message ID to start the thread from"),
      autoArchiveMinutes: z.union([
        z.literal(ThreadAutoArchiveDuration.OneHour),
        z.literal(ThreadAutoArchiveDuration.OneDay),
        z.literal(ThreadAutoArchiveDuration.ThreeDays),
        z.literal(ThreadAutoArchiveDuration.OneWeek),
      ]).optional().describe("Auto-archive duration in minutes: 60 (1 hour), 1440 (1 day), 4320 (3 days), 10080 (1 week). Default: 1 day"),
    }),
    outputSchema: z.object({
      threadId: z.string(),
      threadName: z.string(),
    }),
    execute: async ({ channelId, name, messageId, autoArchiveMinutes = ThreadAutoArchiveDuration.OneDay }) => {
      const channel = await fetchDiscordTextChannel(channelId);
      if (!("threads" in channel)) {
        throw new Error("This channel type does not support threads");
      }

      if (messageId !== undefined) {
        const message = await channel.messages.fetch(messageId);
        const thread = await message.startThread({ name, autoArchiveDuration: autoArchiveMinutes });

        return { threadId: thread.id, threadName: thread.name };
      }

      const thread = await channel.threads.create({ name, autoArchiveDuration: autoArchiveMinutes });

      return { threadId: thread.id, threadName: thread.name };
    },
  }),

  // Members:

  getMembers: tool({
    description: "Find guild members and their voice and presence information.",
    inputSchema: z.object({
      guildId: z.string(),
      nameFilter: z.string().optional().describe("Filter members by username or display name (a numeric value is treated as a user ID)"),
      inVoice: z.boolean().optional().describe("Only return members currently in a voice channel (ignored when nameFilter is provided)"),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      username: z.string(),
      displayName: z.string(),
      status: z.string(),
      activities: z.array(z.object({
        name: z.string(),
        type: z.number(),
        details: z.string().optional(),
        state: z.string().optional(),
        url: z.string().optional(),
      })),
      voiceChannelId: z.string().nullable(),
      voiceChannelName: z.string().nullable(),
    })),
    execute: async ({ guildId, nameFilter, inVoice }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      let members;

      if (nameFilter !== undefined && (/^\d+$/u).test(nameFilter)) {
        members = [await guild.members.fetch(nameFilter)];
      }
      else if (nameFilter !== undefined && nameFilter !== "") {
        members = Array.from((await guild.members.fetch({ query: nameFilter, limit: 100 })).values());
      }
      else if (inVoice === true) {
        members = Array.from(guild.members.cache.filter((member) => member.voice.channelId !== null).values());
      }
      else {
        members = Array.from((await guild.members.fetch({ limit: 100 })).values());
      }

      return members.map((member) => ({
        id: member.id,
        username: member.user.username,
        displayName: member.displayName,
        status: member.presence?.status ?? "offline",
        activities: member.presence?.activities.map((activity) => ({
          name: activity.name,
          type: activity.type,
          details: activity.details ?? undefined,
          state: activity.state ?? undefined,
          url: activity.url ?? undefined,
        })) ?? [],
        voiceChannelId: member.voice.channelId,
        voiceChannelName: member.voice.channel?.name ?? null,
      }));
    },
  }),

  getMemberInfo: tool({
    description: "Get a guild member profile and permissions.",
    inputSchema: z.object({
      guildId: z.string(),
      userId: z.string(),
    }),
    outputSchema: z.object({
      userId: z.string(),
      username: z.string(),
      displayName: z.string(),
      avatarUrl: z.string(),
      status: z.string(),
      isAdmin: z.boolean(),
      permissions: z.array(z.string()),
      voiceChannelId: z.string().nullable(),
      voiceChannelName: z.string().nullable(),
    }),
    execute: async ({ guildId, userId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(userId);

      return {
        userId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        avatarUrl: member.displayAvatarURL({ size: 1024, extension: "png" }),
        status: member.presence?.status ?? "offline",
        isAdmin: member.permissions.has("Administrator"),
        permissions: member.permissions.toArray(),
        voiceChannelId: member.voice.channelId,
        voiceChannelName: member.voice.channel?.name ?? null,
      };
    },
  }),

  getUserInfo: tool({
    description: "Get a user profile, optionally with their guild display name.",
    inputSchema: z.object({
      userId: z.string(),
      guildId: z.string().optional().describe("Guild ID to also fetch the member display name"),
    }),
    outputSchema: z.object({
      id: z.string(),
      username: z.string(),
      globalName: z.string().nullable(),
      avatarUrl: z.string(),
      isBot: z.boolean(),
      createdAt: z.string(),
      displayName: z.string().optional(),
    }),
    execute: async ({ userId, guildId }) => {
      let displayName: string | undefined;
      if (guildId !== undefined) {
        const guild = await discordClient.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        displayName = member.displayName;
      }

      const user = await discordClient.users.fetch(userId);

      return {
        id: user.id,
        username: user.username,
        globalName: user.globalName,
        avatarUrl: user.displayAvatarURL({ size: 1024, extension: "png" }),
        isBot: user.bot,
        createdAt: user.createdAt.toISOString(),
        displayName,
      };
    },
  }),

  renameMember: tool({
    description: "Set or clear a guild nickname.",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
      nickname: z.string().max(32).nullable().describe("Null clears the nickname"),
    }),
    outputSchema: z.object({
      memberId: z.string(),
      oldNickname: z.string().nullable(),
      newNickname: z.string().nullable(),
    }),
    execute: async ({ guildId, memberId, nickname }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      const oldNickname = member.nickname;
      await member.setNickname(nickname);

      return {
        memberId: member.id,
        oldNickname,
        newNickname: nickname,
      };
    },
  }),

  timeoutMember: tool({
    description: "Time out a guild member for up to 28 days.",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
      durationMinutes: z.number().int().min(1).max(40_320).optional().describe("Timeout duration in minutes, 1 to 40320 (28 days). Default: 10"),
      reason: z.string().optional().describe("Reason shown in the audit log"),
    }),
    outputSchema: z.object({
      memberName: z.string(),
      until: z.string(),
    }),
    execute: async ({ guildId, memberId, durationMinutes = 10, reason }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      const updatedMember = await member.timeout(durationMinutes * 60_000, reason);

      const until = updatedMember.communicationDisabledUntil;
      if (until === null) {
        throw new Error("Timeout did not apply (the member may have a higher role than the bot)");
      }

      return {
        memberName: member.displayName,
        until: until.toISOString(),
      };
    },
  }),

  // Roles:

  getRoles: tool({
    description: "List the roles of a guild, optionally filtered by name.",
    inputSchema: z.object({
      guildId: z.string(),
      nameFilter: z.string().optional().describe("Filter roles by name (case-insensitive, spaces ignored)"),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
      position: z.number(),
    })),
    execute: async ({ guildId, nameFilter }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      let roles = (await guild.roles.fetch()).map((role) => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position,
      }));

      if (nameFilter !== undefined && nameFilter !== "") {
        const filter = nameFilter.toLowerCase().replace(/\s+/gu, "");
        roles = roles.filter((role) => {
          const roleName = role.name.toLowerCase().replace(/\s+/gu, "");
          return roleName.includes(filter);
        });
      }

      return roles;
    },
  }),

  createRole: tool({
    description: "Create a role in a guild.",
    inputSchema: z.object({
      guildId: z.string(),
      name: z.string().describe("The name for the new role"),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional().describe("Hex color code (e.g. #5865F2)"),
    }),
    outputSchema: z.object({
      roleId: z.string(),
      roleName: z.string(),
      color: z.string(),
    }),
    execute: async ({ guildId, name, color }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const role = await guild.roles.create({
        name,
        color: color !== undefined ? Number.parseInt(color.slice(1), 16) : undefined,
      });

      return {
        roleId: role.id,
        roleName: role.name,
        color: role.hexColor,
      };
    },
  }),

  addRoleToMember: tool({
    description: "Add a role to a member.",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
      roleId: z.string(),
    }),
    outputSchema: z.object({
      memberName: z.string(),
      roleName: z.string(),
    }),
    execute: async ({ guildId, memberId, roleId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      const role = await guild.roles.fetch(roleId);
      if (!role) {
        throw new Error("Role not found");
      }

      await member.roles.add(role);

      return {
        memberName: member.displayName,
        roleName: role.name,
      };
    },
  }),

  removeRoleFromMember: tool({
    description: "Remove a role from a member.",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
      roleId: z.string(),
    }),
    outputSchema: z.object({
      memberName: z.string(),
      roleName: z.string(),
    }),
    execute: async ({ guildId, memberId, roleId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      const role = await guild.roles.fetch(roleId);
      if (!role) {
        throw new Error("Role not found");
      }

      await member.roles.remove(role);

      return {
        memberName: member.displayName,
        roleName: role.name,
      };
    },
  }),

  changeRolePosition: tool({
    description: "Move a role in the guild hierarchy.",
    inputSchema: z.object({
      guildId: z.string(),
      roleId: z.string(),
      position: z.number().int().min(1).describe("The new position for the role (higher = higher in hierarchy)"),
    }),
    outputSchema: z.object({
      roleName: z.string(),
      oldPosition: z.number(),
      newPosition: z.number(),
    }),
    execute: async ({ guildId, roleId, position }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const role = await guild.roles.fetch(roleId);
      if (!role) {
        throw new Error("Role not found");
      }

      const oldPosition = role.position;
      const updatedRole = await role.setPosition(position);

      return {
        roleName: role.name,
        oldPosition,
        newPosition: updatedRole.position,
      };
    },
  }),

  // Messages:

  getChannelMessages: tool({
    description: "List channel messages, newest first.",
    inputSchema: z.object({
      channelId: z.string(),
      limit: z.number().int().min(1).max(100).optional().describe("Default: 10"),
      before: z.string().optional().describe("Message ID before which to fetch"),
      after: z.string().optional().describe("Message ID after which to fetch"),
      around: z.string().optional().describe("Message ID around which to fetch"),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      authorId: z.string(),
      authorUsername: z.string(),
      content: z.string(),
      createdAt: z.string(),
      hasAttachments: z.boolean(),
      attachments: z.array(z.object({
        url: z.string(),
        name: z.string(),
        contentType: z.string().nullable(),
      })),
    })),
    execute: async ({ channelId, limit = 10, before, after, around }) => {
      if ([before, after, around].filter((cursor) => cursor !== undefined).length > 1) {
        throw new Error("Use one cursor: before, after or around");
      }
      const channel = await fetchDiscordTextChannel(channelId);

      const messages = await channel.messages.fetch({ limit, before, after, around });

      return Array.from(messages.values()).map((message) => ({
        id: message.id,
        authorId: message.author.id,
        authorUsername: message.author.username,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        hasAttachments: message.attachments.size > 0,
        attachments: message.attachments.map((attachment) => ({
          url: attachment.url,
          name: attachment.name,
          contentType: attachment.contentType,
        })),
      }));
    },
  }),

  sendMessage: tool({
    description: "Send a channel message. Supports Discord markdown. Long text is split.",
    inputSchema: z.object({
      channelId: z.string(),
      content: z.string().min(1),
    }),
    outputSchema: z.object({
      messageIds: z.array(z.string()),
    }),
    execute: async ({ channelId, content }) => {
      const channel = await fetchDiscordSendableChannel(channelId);

      const messageIds: string[] = [];

      for (const chunk of splitDiscordMessage(sanitizeDiscordMessage(content))) {
        const message = await channel.send(chunk);
        messageIds.push(message.id);
      }

      return { messageIds };
    },
  }),

  sendEmbed: tool({
    description: "Send an embed to a channel or user.",
    inputSchema: z.object({
      channelId: z.string().optional().describe("Target channel ID (provide either channelId or userId)"),
      userId: z.string().optional().describe("Target user ID to send the embed as a direct message (provide either channelId or userId)"),
      title: z.string().max(256).optional().describe("Embed title"),
      description: z.string().max(4096).optional().describe("Embed description"),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional().describe("Embed accent color as hex (e.g. #5865F2)"),
      thumbnail: z.object({
        url: z.url().describe("Thumbnail image URL"),
      }).optional().describe("Thumbnail shown at the top-right of the embed"),
      fields: z.array(z.object({
        name: z.string().describe("Field name"),
        value: z.string().describe("Field value"),
        inline: z.boolean().optional().describe("Display the field inline (default: false)"),
      })).max(25).optional().describe("Embed fields"),
      buttons: z.array(z.object({
        label: z.string().min(1).max(80).describe("Button label"),
        url: z.url().describe("Button target URL"),
      })).max(5).optional().describe("Link buttons shown below the embed (only link buttons are supported)"),
    }),
    outputSchema: z.object({
      messageId: z.string(),
    }),
    execute: async ({ channelId, userId, title, description, color, thumbnail, fields, buttons }) => {
      if (channelId === undefined && userId === undefined) {
        throw new Error("Provide a target: channelId or userId");
      }
      if (channelId !== undefined && userId !== undefined) {
        throw new Error("Provide only one target: channelId or userId");
      }

      const components: APIActionRowComponent<APIButtonComponent>[] = (buttons !== undefined && buttons.length > 0) ? [{
        type: ComponentType.ActionRow,
        components: buttons.map((button): APIButtonComponentWithURL => ({
          type: ComponentType.Button,
          label: button.label,
          style: ButtonStyle.Link,
          url: button.url,
        })),
      }] : [];

      const payload = {
        embeds: [{
          title,
          description,
          color: color !== undefined ? Number.parseInt(color.slice(1), 16) : undefined,
          thumbnail,
          fields,
        }],
        components: components.length > 0 ? components : undefined,
      };

      if (channelId !== undefined) {
        const channel = await fetchDiscordSendableChannel(channelId);

        const message = await channel.send(payload);
        return { messageId: message.id };
      }

      const user = await discordClient.users.fetch(userId!);
      const dmChannel = await user.createDM();

      const message = await dmChannel.send(payload);

      return { messageId: message.id };
    },
  }),

  sendDm: tool({
    description: "Send a direct message. Long text is split.",
    inputSchema: z.object({
      userId: z.string(),
      content: z.string().min(1),
    }),
    outputSchema: z.object({
      messageIds: z.array(z.string()),
    }),
    execute: async ({ userId, content }) => {
      const user = await discordClient.users.fetch(userId);
      const dmChannel = await user.createDM();

      const messageIds: string[] = [];

      for (const chunk of splitDiscordMessage(content)) {
        const message = await dmChannel.send(chunk);
        messageIds.push(message.id);
      }

      return { messageIds };
    },
  }),

  addReaction: tool({
    description: "React with a Unicode or custom emoji.",
    inputSchema: z.object({
      channelId: z.string(),
      messageId: z.string(),
      emoji: z.string().describe("The emoji to react with (Unicode or custom emoji identifier)"),
    }),
    outputSchema: z.object({}),
    execute: async ({ channelId, messageId, emoji }) => {
      const channel = await fetchDiscordTextChannel(channelId);

      const message = await channel.messages.fetch(messageId);
      await message.react(emoji);

      return {};
    },
  }),

  createPoll: tool({
    description: "Create a poll in a channel.",
    inputSchema: z.object({
      channelId: z.string(),
      question: z.string().min(1).max(300),
      answers: z.array(z.string().min(1).max(55)).min(2).max(10),
      duration: z.number().int().min(1).max(168).optional().describe("Poll duration in hours, 1 to 168 (default: 24)"),
      allowMultiselect: z.boolean().optional().describe("Allow multiple selections (default: false)"),
    }),
    outputSchema: z.object({ messageId: z.string() }),
    execute: async ({ channelId, question, answers, duration = 24, allowMultiselect = false }) => {
      const channel = await fetchDiscordSendableChannel(channelId);

      const message = await channel.send({
        poll: {
          question: { text: question },
          answers: answers.map((answer) => ({ text: answer })),
          duration,
          allowMultiselect,
        },
      });

      return { messageId: message.id };
    },
  }),

  sendFile: tool({
    description: "Send a file from a URL, with optional text.",
    inputSchema: z.object({
      channelId: z.string(),
      url: z.url().describe("URL of the file to download and send"),
      name: z.string().optional().describe("File name shown in Discord (default: derived from the URL)"),
      content: z.string().optional().describe("Optional text message sent along with the file"),
    }),
    outputSchema: z.object({
      messageId: z.string(),
    }),
    execute: async ({ channelId, url, name, content }) => {
      const channel = await fetchDiscordSendableChannel(channelId);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download file (HTTP ${String(response.status)})`);
      }

      const urlName = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
      const fileName = name ?? (urlName !== "" ? urlName : "file");

      const message = await channel.send({
        content: content !== undefined ? sanitizeDiscordMessage(content) : undefined,
        files: [{ attachment: Buffer.from(await response.arrayBuffer()), name: fileName }],
      });

      return { messageId: message.id };
    },
  }),

  editMessage: tool({
    description: "Edit the bot's own message.",
    inputSchema: z.object({
      channelId: z.string(),
      messageId: z.string(),
      newContent: z.string(),
    }),
    outputSchema: z.object({
      messageId: z.string(),
    }),
    execute: async ({ channelId, messageId, newContent }) => {
      const channel = await fetchDiscordTextChannel(channelId);

      const message = await channel.messages.fetch(messageId);
      if (!message.editable) {
        throw new Error("Only messages sent by the bot itself can be edited");
      }

      await message.edit(sanitizeDiscordMessage(newContent));

      return { messageId: message.id };
    },
  }),

  deleteMessage: tool({
    description: "Delete a message.",
    inputSchema: z.object({
      channelId: z.string(),
      messageId: z.string(),
    }),
    outputSchema: z.object({}),
    execute: async ({ channelId, messageId }) => {
      const channel = await fetchDiscordTextChannel(channelId);

      const message = await channel.messages.fetch(messageId);
      if (!message.deletable) {
        throw new Error("This message cannot be deleted (missing Manage Messages permission)");
      }

      await message.delete();

      return {};
    },
  }),

  sendReply: tool({
    description: "Reply to a message. Long text is split.",
    inputSchema: z.object({
      channelId: z.string(),
      messageId: z.string(),
      content: z.string().min(1),
    }),
    outputSchema: z.object({
      messageIds: z.array(z.string()),
    }),
    execute: async ({ channelId, messageId, content }) => {
      const channel = await fetchDiscordSendableChannel(channelId);

      const messageIds: string[] = [];

      for (const chunk of splitDiscordMessage(sanitizeDiscordMessage(content))) {
        const message = await channel.send({ content: chunk, reply: { messageReference: messageId } });
        messageIds.push(message.id);
      }

      return { messageIds };
    },
  }),

  getReactions: tool({
    description: "List reactions and up to 100 users per emoji.",
    inputSchema: z.object({
      channelId: z.string(),
      messageId: z.string(),
    }),
    outputSchema: z.array(z.object({
      emoji: z.string(),
      count: z.number(),
      users: z.array(z.object({
        id: z.string(),
        username: z.string(),
        globalName: z.string().nullable(),
      })),
    })),
    execute: async ({ channelId, messageId }) => {
      const channel = await fetchDiscordTextChannel(channelId);

      const message = await channel.messages.fetch(messageId);

      return Promise.all(message.reactions.cache.map(async (reaction) => {
        const users = await reaction.users.fetch({ limit: 100 });
        const reactionEmoji = reaction.emoji;
        const emoji = reactionEmoji.id !== null && reactionEmoji.name !== null ? `<${reactionEmoji.animated === true ? "a" : ""}:${reactionEmoji.name}:${reactionEmoji.id}>` : reactionEmoji.name ?? "?";

        return {
          emoji,
          count: reaction.count,
          users: users.map((user) => ({
            id: user.id,
            username: user.username,
            globalName: user.globalName,
          })),
        };
      }));
    },
  }),

  pinMessage: tool({
    description: "Pin a message in its channel.",
    inputSchema: z.object({
      channelId: z.string(),
      messageId: z.string(),
    }),
    outputSchema: z.object({}),
    execute: async ({ channelId, messageId }) => {
      const channel = await fetchDiscordTextChannel(channelId);

      const message = await channel.messages.fetch(messageId);
      await message.pin();

      return {};
    },
  }),

  getPinnedMessages: tool({
    description: "Get the pinned messages of a channel.",
    inputSchema: z.object({
      channelId: z.string(),
      before: z.iso.datetime({ offset: true }).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      authorId: z.string(),
      authorUsername: z.string(),
      content: z.string(),
      createdAt: z.string(),
      pinnedAt: z.string(),
    })),
    execute: async ({ channelId, before, limit }) => {
      const channel = await fetchDiscordTextChannel(channelId);

      const pinned = await channel.messages.fetchPins({ before, limit });

      return pinned.items.map((pin) => ({
        id: pin.message.id,
        authorId: pin.message.author.id,
        authorUsername: pin.message.author.username,
        content: pin.message.content,
        createdAt: pin.message.createdAt.toISOString(),
        pinnedAt: pin.pinnedAt.toISOString(),
      }));
    },
  }),

  // Voice:

  joinVoiceChannel: tool({
    description: "Join a voice or stage channel.",
    inputSchema: z.object({
      channelId: z.string(),
      guildId: z.string(),
    }),
    outputSchema: z.object({}),
    execute: async ({ channelId, guildId }) => {
      const channel = await fetchDiscordChannel(channelId);
      if (!channel.isVoiceBased()) {
        throw new Error("Channel not found or not a voice channel");
      }

      if (channel.guild.id !== guildId) {
        throw new Error("Channel does not belong to the guild");
      }

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

      return {};
    },
  }),

  leaveVoiceChannel: tool({
    description: "Leave voice in a guild.",
    inputSchema: z.object({
      guildId: z.string(),
    }),
    outputSchema: z.object({}),
    execute: ({ guildId }) => {
      const connection = fetchDiscordVoiceConnection(guildId);

      connection.destroy();

      return {};
    },
  }),

  moveMember: tool({
    description: "Move a member to another voice channel.",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
      channelId: z.string(),
    }),
    outputSchema: z.object({
      memberName: z.string(),
      channelName: z.string(),
    }),
    execute: async ({ guildId, memberId, channelId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      const channel = await guild.channels.fetch(channelId);
      if (channel?.isVoiceBased() !== true) {
        throw new Error("Voice channel not found");
      }

      await member.voice.setChannel(channel);

      return {
        memberName: member.displayName,
        channelName: channel.name,
      };
    },
  }),

  disconnectMember: tool({
    description: "Disconnect a member from voice.",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
    }),
    outputSchema: z.object({
      memberName: z.string(),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.disconnect();

      return { memberName: member.displayName };
    },
  }),

  muteMember: tool({
    description: "Server-mute a member in voice.",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
    }),
    outputSchema: z.object({
      memberName: z.string(),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.setMute(true);

      return { memberName: member.displayName };
    },
  }),

  unmuteMember: tool({
    description: "Remove a server mute.",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
    }),
    outputSchema: z.object({
      memberName: z.string(),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.setMute(false);

      return { memberName: member.displayName };
    },
  }),

  deafenMember: tool({
    description: "Server-deafen a member in voice.",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
    }),
    outputSchema: z.object({
      memberName: z.string(),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.setDeaf(true);

      return { memberName: member.displayName };
    },
  }),

  undeafenMember: tool({
    description: "Remove a server deafen.",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
    }),
    outputSchema: z.object({
      memberName: z.string(),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.setDeaf(false);

      return { memberName: member.displayName };
    },
  }),

  playAudio: tool({
    description: "Play audio from a URL. Replaces current playback.",
    inputSchema: z.object({
      guildId: z.string(),
      url: z.url().describe("URL of the audio file or stream to play"),
    }),
    outputSchema: z.object({}),
    execute: async ({ guildId, url }) => {
      const connection = fetchDiscordVoiceConnection(guildId);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio (HTTP ${String(response.status)})`);
      }
      if (response.body === null) {
        throw new Error("Audio source returned an empty body");
      }

      const resource = createAudioResource(Readable.fromWeb(response.body), { inputType: StreamType.Arbitrary });
      replaceDiscordAudio(connection, resource);

      return {};
    },
  }),

  startVoiceActivity: tool({
    description: "Create a voice invite for an embedded activity.",
    inputSchema: z.object({
      guildId: z.string(),
      channelId: z.string(),
      activity: z.enum(["watch-together", "poker-night", "betrayal-io", "fishington-io", "chess-in-the-park", "checkers-in-the-park", "blazing-v8", "letter-tiles", "words-party", "spellcast", "sketch-heads", "putt-party"]).optional().describe("Activity to launch"),
      applicationId: z.string().optional().describe("Raw Discord application ID of an activity, for activities not in the list (overrides activity)"),
    }),
    outputSchema: z.object({
      url: z.string(),
      activityName: z.string().nullable(),
      channelName: z.string(),
    }),
    execute: async ({ guildId, channelId, activity, applicationId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const channel = await guild.channels.fetch(channelId);
      if (channel?.isVoiceBased() !== true) {
        throw new Error("Voice channel not found");
      }

      const activityIds = {
        "watch-together": "880218394200925916",
        "poker-night": "755827207812648013",
        "betrayal-io": "773336526917861400",
        "fishington-io": "814068430860810754",
        "chess-in-the-park": "832012774040913931",
        "checkers-in-the-park": "832013003968101148",
        "blazing-v8": "832025144509633155",
        "letter-tiles": "879863976003133513",
        "words-party": "879864070101264428",
        "spellcast": "852509694341286777",
        "sketch-heads": "879864047378042920",
        "putt-party": "945737671223945399",
      } as const;

      const targetApplicationId = applicationId ?? (activity !== undefined ? activityIds[activity] : undefined);
      if (targetApplicationId === undefined) {
        throw new Error("Provide an activity or an applicationId");
      }

      const invite = await channel.createInvite({
        targetType: InviteTargetType.EmbeddedApplication,
        targetApplication: targetApplicationId,
        maxAge: 0,
      });

      return {
        url: invite.url,
        activityName: invite.targetApplication?.name ?? activity ?? null,
        channelName: channel.name,
      };
    },
  }),

  moveAllMembers: tool({
    description: "Move all members between voice channels.",
    inputSchema: z.object({
      guildId: z.string(),
      fromChannelId: z.string(),
      toChannelId: z.string(),
    }),
    outputSchema: z.object({
      movedCount: z.number(),
      fromChannelName: z.string(),
      toChannelName: z.string(),
    }),
    execute: async ({ guildId, fromChannelId, toChannelId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const fromChannel = await guild.channels.fetch(fromChannelId);
      if (fromChannel?.isVoiceBased() !== true) {
        throw new Error("Source voice channel not found");
      }

      const toChannel = await guild.channels.fetch(toChannelId);
      if (toChannel?.isVoiceBased() !== true) {
        throw new Error("Destination voice channel not found");
      }

      const members = [...fromChannel.members.values()];
      for (const member of members) {
        await member.voice.setChannel(toChannel);
      }

      return {
        movedCount: members.length,
        fromChannelName: fromChannel.name,
        toChannelName: toChannel.name,
      };
    },
  }),

  // Invites and webhooks:

  createInvite: tool({
    description: "Create an invite link for a channel.",
    inputSchema: z.object({
      channelId: z.string(),
      maxAge: z.number().int().min(0).max(604_800).optional().describe("Invite lifetime in seconds, 0 for never expires (default: 86400 = 24h)"),
      maxUses: z.number().int().min(0).max(100).optional().describe("Maximum number of uses, 0 for unlimited (default: 0)"),
      temporary: z.boolean().optional(),
      unique: z.boolean().optional(),
      reason: z.string().max(512).optional(),
    }),
    outputSchema: z.object({
      url: z.string(),
      code: z.string(),
      expiresAt: z.string().nullable(),
      maxUses: z.number(),
    }),
    execute: async ({ channelId, maxAge = 86_400, maxUses = 0, temporary, unique, reason }) => {
      const channel = await fetchDiscordChannel(channelId);
      if (!("createInvite" in channel)) {
        throw new Error("This channel type does not support invites");
      }

      const invite = await channel.createInvite({ maxAge, maxUses, temporary, unique, reason });

      return {
        url: invite.url,
        code: invite.code,
        expiresAt: invite.expiresAt?.toISOString() ?? null,
        maxUses: invite.maxUses ?? maxUses,
      };
    },
  }),

  getWebhooks: tool({
    description: "List the webhooks of a channel.",
    inputSchema: z.object({
      channelId: z.string(),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      name: z.string().nullable(),
      avatarUrl: z.string().nullable(),
    })),
    execute: async ({ channelId }) => {
      const channel = await fetchDiscordChannel(channelId);
      if (!("fetchWebhooks" in channel)) {
        throw new Error("This channel type does not support webhooks");
      }

      const webhooks = await channel.fetchWebhooks();

      return webhooks.map((webhook) => ({
        id: webhook.id,
        name: webhook.name,
        avatarUrl: webhook.avatarURL(),
      }));
    },
  }),

  createWebhook: tool({
    description: "Create a channel webhook.",
    inputSchema: z.object({
      channelId: z.string(),
      name: z.string().min(1).max(80),
      avatarUrl: z.url({ protocol: /^https?$/u }).optional(),
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string().nullable(),
    }),
    execute: async ({ channelId, name, avatarUrl }) => {
      const channel = await fetchDiscordChannel(channelId);
      if (!("createWebhook" in channel)) {
        throw new Error("This channel type does not support webhooks");
      }

      let avatar: Buffer | undefined;
      if (avatarUrl !== undefined) {
        const response = await fetch(avatarUrl);
        if (!response.ok) {
          throw new Error(`Failed to download webhook avatar (HTTP ${String(response.status)})`);
        }
        avatar = Buffer.from(await response.arrayBuffer());
      }

      const webhook = await channel.createWebhook({ name, avatar });

      return {
        id: webhook.id,
        name: webhook.name,
      };
    },
  }),

  sendWebhookMessage: tool({
    description: "Send a message through a Discord webhook.",
    inputSchema: z.object({
      webhookId: z.string().regex(/^\d{1,20}$/u).optional(),
      webhookUrl: z.url().regex(/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/(?:v10\/)?webhooks\/\d{1,20}\/[\w-]+$/u).optional().describe("Discord webhook URL, as an alternative to webhookId"),
      content: z.string().min(1).max(2000),
      username: z.string().min(1).max(80).optional(),
      avatarUrl: z.url().optional(),
      threadId: z.string().optional(),
      threadName: z.string().min(1).max(100).optional().describe("Create a post in a forum or media channel"),
      appliedTags: z.array(z.string()).max(5).optional(),
    }),
    outputSchema: z.object({ messageId: z.string() }),
    execute: async ({ webhookId, webhookUrl, content, username, avatarUrl, threadId, threadName, appliedTags }) => {
      if ((webhookId === undefined) === (webhookUrl === undefined)) {
        throw new Error("Provide exactly one of webhookId or webhookUrl");
      }

      const webhook = webhookId !== undefined ? await discordClient.fetchWebhook(webhookId) : new WebhookClient({ url: webhookUrl! });
      const message = await webhook.send({
        content: sanitizeDiscordMessage(content),
        username,
        avatarURL: avatarUrl,
        threadId,
        threadName,
        appliedTags,
        allowedMentions: { parse: ["users", "roles"] },
      });
      return { messageId: message.id };
    },
  }),

  // Emojis:

  getGuildEmojis: tool({
    description: "List custom guild emojis.",
    inputSchema: z.object({
      guildId: z.string(),
    }),
    outputSchema: z.array(z.object({
      id: z.string(),
      name: z.string().nullable(),
      animated: z.boolean(),
      display: z.string(),
      url: z.string(),
    })),
    execute: async ({ guildId }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const emojis = await guild.emojis.fetch();

      return emojis.map((emoji) => ({
        id: emoji.id,
        name: emoji.name,
        animated: emoji.animated,
        display: emoji.toString(),
        url: emoji.imageURL(),
      }));
    },
  }),

  createEmoji: tool({
    description: "Create a custom guild emoji from an image URL.",
    inputSchema: z.object({
      guildId: z.string(),
      name: z.string().regex(/^[a-z0-9_]{2,32}$/u).describe("Emoji name (2-32 characters: letters, numbers, underscores)"),
      imageUrl: z.url().describe("Image URL for the emoji (max 256 KB)"),
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      display: z.string(),
      url: z.string(),
    }),
    execute: async ({ guildId, name, imageUrl }) => {
      const guild = await discordClient.guilds.fetch(guildId);

      const emoji = await guild.emojis.create({ attachment: imageUrl, name });

      return {
        id: emoji.id,
        name: emoji.name,
        display: emoji.toString(),
        url: emoji.imageURL(),
      };
    },
  }),

  // Events:

  createGuildEvent: tool({
    description: "Schedule a voice, stage or external event.",
    inputSchema: z.object({
      guildId: z.string(),
      name: z.string().min(1).max(100).describe("Event name"),
      description: z.string().max(1000).optional().describe("Event description"),
      startAt: z.iso.datetime({ offset: true }).describe("Start date and time (ISO 8601)"),
      durationMinutes: z.number().int().min(1).max(43_200).optional().describe("Event duration in minutes (default: 60)"),
      channelId: z.string().optional().describe("Voice or stage channel ID for the event (provide either channelId or location)"),
      location: z.string().max(100).optional().describe("External location description (provide either channelId or location)"),
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      startAt: z.string(),
      endAt: z.string(),
    }),
    execute: async ({ guildId, name, description, startAt, durationMinutes = 60, channelId, location }) => {
      const guild = await discordClient.guilds.fetch(guildId);
      if ((channelId === undefined) === (location === undefined)) {
        throw new Error("Provide exactly one of channelId or location");
      }

      const startDate = new Date(startAt);
      if (Number.isNaN(startDate.getTime())) {
        throw new Error(`Invalid start date: ${startAt}`);
      }
      const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);

      let eventChannel: GuildVoiceChannelResolvable | undefined;
      let entityType = GuildScheduledEventEntityType.External;

      if (channelId !== undefined) {
        const voiceChannel = await guild.channels.fetch(channelId);
        if (voiceChannel === null) {
          throw new Error("Channel not found");
        }
        if (voiceChannel.type !== ChannelType.GuildVoice && voiceChannel.type !== ChannelType.GuildStageVoice) {
          throw new Error("Channel is not a voice or stage channel");
        }

        eventChannel = voiceChannel;
        entityType = voiceChannel.type === ChannelType.GuildStageVoice ? GuildScheduledEventEntityType.StageInstance : GuildScheduledEventEntityType.Voice;
      }

      const event = await guild.scheduledEvents.create({
        name,
        description,
        scheduledStartTime: startDate,
        scheduledEndTime: endDate,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType,
        channel: eventChannel,
        entityMetadata: location !== undefined ? { location } : undefined,
      });

      return {
        id: event.id,
        name: event.name,
        url: `https://discord.com/events/${guild.id}/${event.id}`,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
      };
    },
  }),

  // Bot presence:

  setBotPresence: tool({
    description: "Set the bot's status or activity.",
    inputSchema: z.object({
      status: z.enum(["online", "idle", "dnd", "invisible"]).optional().describe("Presence status"),
      activityType: z.enum(["playing", "streaming", "listening", "watching", "competing", "custom"]).optional().describe("Activity type (default: playing)"),
      activityName: z.string().min(1).max(128).nullable().optional().describe("Null clears the activity"),
      url: z.url().optional().describe("Stream URL (required for the streaming activity type)"),
    }),
    outputSchema: z.object({
      status: z.string().nullable(),
      activityName: z.string().nullable(),
    }),
    execute: ({ status, activityType, activityName, url }) => {
      if (status === undefined && activityName === undefined) {
        throw new Error("Provide a status or an activity");
      }
      if (typeof activityName === "string" && activityType === "streaming" && url === undefined) {
        throw new Error("The streaming activity type requires a url");
      }

      const selfUser = discordClient.user;
      if (selfUser === null) {
        throw new Error("Discord client is not ready yet");
      }

      const activityTypes = {
        playing: ActivityType.Playing,
        streaming: ActivityType.Streaming,
        listening: ActivityType.Listening,
        watching: ActivityType.Watching,
        competing: ActivityType.Competing,
        custom: ActivityType.Custom,
      } as const;

      let activities: ActivitiesOptions[];

      if (activityName === null) {
        activities = [];
      }
      else if (activityName !== undefined) {
        const resolvedType = activityType ?? "playing";
        activities = [resolvedType === "custom" ? { name: "Custom Status", type: activityTypes.custom, state: activityName } : { name: activityName, type: activityTypes[resolvedType], url: resolvedType === "streaming" ? url : undefined }];
      }
      else {
        activities = selfUser.presence.activities.map((activity) => ({
          name: activity.name,
          type: activity.type,
          state: activity.state ?? undefined,
          url: activity.url ?? undefined,
        }));
      }

      selfUser.setPresence({
        status,
        activities,
      });

      return {
        status: status ?? null,
        activityName: activityName ?? null,
      };
    },
  }),
} satisfies ToolSet;
