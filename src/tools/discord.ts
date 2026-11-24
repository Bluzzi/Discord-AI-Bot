import type { ToolSet } from "ai";
import type { ActivitiesOptions, APIActionRowComponent, APIButtonComponent, APIButtonComponentWithURL, GuildVoiceChannelResolvable } from "discord.js";
import { discordClient } from "#/integrations/discord.client";
import { sanitizeDiscordMessage, splitDiscordMessage } from "#/integrations/discord.helper";
import { tool } from "ai";
import dedent from "dedent";
import { ActivityType, AuditLogEvent, ButtonStyle, ChannelType, ComponentType, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, InviteTargetType, makeURLSearchParams, MessageFlags, MessagePayload, parseEmoji, Routes, ThreadAutoArchiveDuration, WebhookClient } from "discord.js";
import { z } from "zod";

export const discordTools = {
  // For raw REST responses, decode any bytes and normalize empty bodies to an object:

  // Guilds and Members:
  getBotGuilds: tool({
    description: "List guilds the bot belongs to.",
    inputSchema: z.object({
      query: z.object({
        limit: z.number().int().min(1).max(200).optional(),
        before: z.string().regex(/^\d{1,20}$/u).optional(),
        after: z.string().regex(/^\d{1,20}$/u).optional(),
        with_counts: z.boolean().optional(),
      }).optional(),
    }),
    execute: async ({ query }) => {
      const result = await discordClient.rest.get("/users/@me/guilds", {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildDetails: tool({
    description: "Get full guild settings and features.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), query: z.object({ with_counts: z.boolean().optional() }).optional() }),
    execute: async ({ guildId, query }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  editGuild: tool({
    description: "Edit guild settings.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({
        name: z.string().min(2).max(100),
        description: z.string().max(120).nullable(),
        verification_level: z.number().int().min(0).max(4),
        default_message_notifications: z.number().int().min(0).max(1),
        explicit_content_filter: z.number().int().min(0).max(2),
        afk_channel_id: z.string().regex(/^\d{1,20}$/u).nullable(),
        afk_timeout: z.number().int(),
        icon: z.string().regex(/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/u).nullable(),
        splash: z.string().regex(/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/u).nullable(),
        discovery_splash: z.string().regex(/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/u).nullable(),
        banner: z.string().regex(/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/u).nullable(),
        system_channel_id: z.string().regex(/^\d{1,20}$/u).nullable(),
        system_channel_flags: z.number().int(),
        rules_channel_id: z.string().regex(/^\d{1,20}$/u).nullable(),
        public_updates_channel_id: z.string().regex(/^\d{1,20}$/u).nullable(),
        safety_alerts_channel_id: z.string().regex(/^\d{1,20}$/u).nullable(),
        preferred_locale: z.string(),
        features: z.array(z.string()),
        premium_progress_bar_enabled: z.boolean(),
      }).partial(),
    }),
    execute: async ({ guildId, reason, body }) => {
      const result = await discordClient.rest.patch(`/guilds/${guildId}`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  leaveGuild: tool({
    description: "Make the bot leave a guild.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId }) => {
      const result = await discordClient.rest.delete(`/users/@me/guilds/${guildId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  listGuildMembers: tool({
    description: "List guild members by user ID page.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({ limit: z.number().int().min(1).max(1000).optional(), after: z.string().regex(/^\d{1,20}$/u).optional() }).optional(),
    }),
    execute: async ({ guildId, query }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/members`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  searchGuildMembers: tool({
    description: "Find guild members by username or nickname prefix.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(1000).optional() }),
    }),
    execute: async ({ guildId, query }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/members/search`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildMember: tool({
    description: "Get a guild member, including assigned role IDs.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), userId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId, userId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/members/${userId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildMemberPermissions: tool({
    description: "Get a member's computed guild permissions.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), userId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId, userId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/permissions/member/${userId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildRolePermissions: tool({
    description: "Get a role's computed guild permissions.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), roleId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId, roleId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/permissions/role/${roleId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  setMemberRoles: tool({
    description: "Replace a guild member's complete list of roles.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      userId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({ roles: z.array(z.string().regex(/^\d{1,20}$/u)) }),
    }),
    execute: async ({ guildId, userId, reason, body }) => {
      const result = await discordClient.rest.patch(`/guilds/${guildId}/members/${userId}`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  removeMemberTimeout: tool({
    description: "Remove a guild member's timeout.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      userId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({ communication_disabled_until: z.null().default(null) }).default({ communication_disabled_until: null }),
    }),
    execute: async ({ guildId, userId, reason, body }) => {
      const result = await discordClient.rest.patch(`/guilds/${guildId}/members/${userId}`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  kickMember: tool({
    description: "Remove a member from a guild.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      userId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
    }),
    execute: async ({ guildId, userId, reason }) => {
      const result = await discordClient.rest.delete(`/guilds/${guildId}/members/${userId}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildBans: tool({
    description: "List guild bans.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({
        limit: z.number().int().min(1).max(1000).optional(),
        before: z.string().regex(/^\d{1,20}$/u).optional(),
        after: z.string().regex(/^\d{1,20}$/u).optional(),
      }).optional(),
    }),
    execute: async ({ guildId, query }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/bans`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildBan: tool({
    description: "Get a guild ban.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), userId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId, userId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/bans/${userId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  banMember: tool({
    description: "Ban a user from a guild.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      userId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({ delete_message_seconds: z.number().int().min(0).max(604800).optional() }).default({}),
    }),
    execute: async ({ guildId, userId, reason, body }) => {
      const result = await discordClient.rest.put(`/guilds/${guildId}/bans/${userId}`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  bulkBanMembers: tool({
    description: "Ban up to 200 users from a guild.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({
        user_ids: z.array(z.string().regex(/^\d{1,20}$/u)).min(1).max(200),
        delete_message_seconds: z.number().int().min(0).max(604800).optional(),
      }),
    }),
    execute: async ({ guildId, reason, body }) => {
      const result = await discordClient.rest.post(`/guilds/${guildId}/bulk-ban`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  unbanMember: tool({
    description: "Remove a user's guild ban.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      userId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
    }),
    execute: async ({ guildId, userId, reason }) => {
      const result = await discordClient.rest.delete(`/guilds/${guildId}/bans/${userId}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getPruneCount: tool({
    description: "Count inactive members a prune would remove.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({
        days: z.number().int().min(1).max(30).optional(),
        include_roles: z.array(z.string().regex(/^\d{1,20}$/u)).optional().describe("Role IDs as an array"),
      }).optional(),
    }),
    execute: async ({ guildId, query }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/prune`, {
        query: makeURLSearchParams({ ...query, include_roles: query?.include_roles?.join(",") }),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  pruneMembers: tool({
    description: "Remove inactive guild members.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({
        days: z.number().int().min(1).max(30),
        compute_prune_count: z.boolean().optional(),
        include_roles: z.array(z.string().regex(/^\d{1,20}$/u)).optional(),
      }),
    }),
    execute: async ({ guildId, reason, body }) => {
      // Pass the selected roles and count option to the prune endpoint:
      const result = await discordClient.rest.post(`/guilds/${guildId}/prune`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  editGuildIncidentActions: tool({
    description: "Temporarily pause guild invites or DMs. Null resumes them.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      body: z.object({
        invites_disabled_until: z.iso.datetime({ offset: true }).nullable(),
        dms_disabled_until: z.iso.datetime({ offset: true }).nullable(),
      }).partial(),
    }),
    execute: async ({ guildId, body }) => {
      const result = await discordClient.rest.put(`/guilds/${guildId}/incident-actions`, { body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),

  // Channels and Threads:
  getChannelDetails: tool({
    description: "Get full channel settings and permission overwrites.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ channelId }) => {
      const result = await discordClient.rest.get(`/channels/${channelId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  editChannel: tool({
    description: "Edit a channel or thread.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({
        name: z.string().min(1).max(100),
        type: z.number().int(),
        position: z.number().int().nonnegative(),
        topic: z.string().max(4096).nullable(),
        nsfw: z.boolean(),
        rate_limit_per_user: z.number().int().min(0).max(21600),
        bitrate: z.number().int(),
        user_limit: z.number().int(),
        permission_overwrites: z.array(z.object({
          id: z.string().regex(/^\d{1,20}$/u),
          type: z.union([z.literal(0), z.literal(1)]),
          allow: z.string().regex(/^\d+$/u).optional(),
          deny: z.string().regex(/^\d+$/u).optional(),
        })),
        parent_id: z.string().regex(/^\d{1,20}$/u).nullable(),
        rtc_region: z.string().nullable(),
        video_quality_mode: z.number().int().min(1).max(2),
        default_auto_archive_duration: z.union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)]),
        flags: z.number().int().nonnegative(),
        available_tags: z.array(z.object({
          id: z.string().regex(/^\d{1,20}$/u).optional(),
          name: z.string().min(1).max(20),
          moderated: z.boolean().optional(),
          emoji_id: z.string().regex(/^\d{1,20}$/u).nullable().optional(),
          emoji_name: z.string().nullable().optional(),
        })),
        applied_tags: z.array(z.string().regex(/^\d{1,20}$/u)),
        default_reaction_emoji: z.object({
          emoji_id: z.string().regex(/^\d{1,20}$/u).nullable().optional(),
          emoji_name: z.string().nullable().optional(),
        }).nullable(),
        default_thread_rate_limit_per_user: z.number().int().min(0).max(21600),
        default_sort_order: z.number().int().min(0).max(1).nullable(),
        default_forum_layout: z.number().int().min(0).max(2),
        archived: z.boolean(),
        auto_archive_duration: z.number().int(),
        locked: z.boolean(),
        invitable: z.boolean(),
      }).partial(),
    }),
    execute: async ({ channelId, reason, body }) => {
      const result = await discordClient.rest.patch(`/channels/${channelId}`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  deleteChannel: tool({
    description: "Delete a guild channel or close a DM.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u), reason: z.string().max(512).optional() }),
    execute: async ({ channelId, reason }) => {
      const result = await discordClient.rest.delete(`/channels/${channelId}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  reorderChannels: tool({
    description: "Reorder or move guild channels.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.array(z.object({
        id: z.string().regex(/^\d{1,20}$/u),
        position: z.number().int().nonnegative().nullable().optional(),
        lock_permissions: z.boolean().nullable().optional(),
        parent_id: z.string().regex(/^\d{1,20}$/u).nullable().optional(),
      })).min(1),
    }),
    execute: async ({ guildId, reason, body }) => {
      const result = await discordClient.rest.patch(`/guilds/${guildId}/channels`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  setChannelPermission: tool({
    description: "Set a channel permission overwrite. Allow and deny are decimal bitsets.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u), overwriteId: z.string().regex(/^\d{1,20}$/u), reason: z.string().max(512).optional(), body: z.object({
      id: z.string().regex(/^\d{1,20}$/u),
      type: z.union([z.literal(0), z.literal(1)]),
      allow: z.string().regex(/^\d+$/u).optional(),
      deny: z.string().regex(/^\d+$/u).optional(),
    }).omit({ id: true }) }),
    execute: async ({ channelId, overwriteId, reason, body }) => {
      const result = await discordClient.rest.put(`/channels/${channelId}/permissions/${overwriteId}`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  deleteChannelPermission: tool({
    description: "Delete a channel permission overwrite.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      overwriteId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
    }),
    execute: async ({ channelId, overwriteId, reason }) => {
      const result = await discordClient.rest.delete(`/channels/${channelId}/permissions/${overwriteId}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getChannelMemberPermissions: tool({
    description: "Get a member's computed permissions in a channel.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      userId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({ implicit: z.boolean().optional() }).optional(),
    }),
    execute: async ({ channelId, userId, query }) => {
      const result = await discordClient.rest.get(`/channels/${channelId}/permissions/member/${userId}`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getChannelRolePermissions: tool({
    description: "Get a role's computed permissions in a channel.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      roleId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({ implicit: z.boolean().optional() }).optional(),
    }),
    execute: async ({ channelId, roleId, query }) => {
      const result = await discordClient.rest.get(`/channels/${channelId}/permissions/role/${roleId}`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  followAnnouncementChannel: tool({
    description: "Forward announcements to a destination channel.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u), body: z.object({ webhook_channel_id: z.string().regex(/^\d{1,20}$/u) }) }),
    execute: async ({ channelId, body }) => {
      // Register the destination channel as a follower of the announcement channel:
      const result = await discordClient.rest.post(`/channels/${channelId}/followers`, { body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  triggerTyping: tool({
    description: "Show the bot's typing indicator in a channel.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ channelId }) => {
      const result = await discordClient.rest.post(`/channels/${channelId}/typing`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  createPrivateThread: tool({
    description: "Create a private thread in a guild text channel.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({
        name: z.string().min(1).max(100),
        auto_archive_duration: z.union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)]).optional(),
        rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
        type: z.literal(12).default(12),
        invitable: z.boolean().optional(),
      }),
    }),
    execute: async ({ channelId, reason, body }) => {
      const result = await discordClient.rest.post(`/channels/${channelId}/threads`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  createForumPost: tool({
    description: "Create a post in a forum or media channel.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u), body: z.object({ name: z.string().min(1).max(100), auto_archive_duration: z.union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)]).optional(), rate_limit_per_user: z.number().int().min(0).max(21600).optional(), message: z.object({
      content: z.string().max(2000),
      embeds: z.array(z.record(z.string(), z.json())).max(10),
      components: z.array(z.record(z.string(), z.json())),
      sticker_ids: z.array(z.string().regex(/^\d{1,20}$/u)).max(3),
      flags: z.number().int().nonnegative(),
    }).partial(), applied_tags: z.array(z.string().regex(/^\d{1,20}$/u)).max(5).optional() }), reason: z.string().max(512).optional() }),
    // Restrict mentions in the first message of the forum thread:
    execute: async ({ channelId, body, reason }) => discordClient.rest.post(Routes.threads(channelId), {
      body: { ...body, message: { ...body.message, allowed_mentions: { parse: ["users", "roles"] } } },
      reason,
    }),
  }),
  getActiveThreads: tool({
    description: "List active guild threads visible to the bot.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/threads/active`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getPublicArchivedThreads: tool({
    description: "List archived public threads in a channel.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({ limit: z.number().int().min(1).max(100).optional(), before: z.iso.datetime({ offset: true }).optional() }).optional(),
    }),
    execute: async ({ channelId, query }) => {
      const result = await discordClient.rest.get(`/channels/${channelId}/threads/archived/public`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getPrivateArchivedThreads: tool({
    description: "List archived private threads in a channel.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({ limit: z.number().int().min(1).max(100).optional(), before: z.iso.datetime({ offset: true }).optional() }).optional(),
    }),
    execute: async ({ channelId, query }) => {
      const result = await discordClient.rest.get(`/channels/${channelId}/threads/archived/private`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getJoinedArchivedThreads: tool({
    description: "List archived private threads the bot joined.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({ limit: z.number().int().min(1).max(100).optional(), before: z.string().regex(/^\d{1,20}$/u).optional() }).optional(),
    }),
    execute: async ({ channelId, query }) => {
      // Query the archive for private threads the bot joined:
      const result = await discordClient.rest.get(`/channels/${channelId}/users/@me/threads/archived/private`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  joinThread: tool({
    description: "Join a thread.",
    inputSchema: z.object({ threadId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ threadId }) => {
      const result = await discordClient.rest.put(`/channels/${threadId}/thread-members/@me`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  leaveThread: tool({
    description: "Leave a thread.",
    inputSchema: z.object({ threadId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ threadId }) => {
      const result = await discordClient.rest.delete(`/channels/${threadId}/thread-members/@me`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  addThreadMember: tool({
    description: "Add a guild member to a thread.",
    inputSchema: z.object({ threadId: z.string().regex(/^\d{1,20}$/u), userId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ threadId, userId }) => {
      const result = await discordClient.rest.put(`/channels/${threadId}/thread-members/${userId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  removeThreadMember: tool({
    description: "Remove a member from a thread.",
    inputSchema: z.object({ threadId: z.string().regex(/^\d{1,20}$/u), userId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ threadId, userId }) => {
      const result = await discordClient.rest.delete(`/channels/${threadId}/thread-members/${userId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getThreadMember: tool({
    description: "Get a thread member.",
    inputSchema: z.object({
      threadId: z.string().regex(/^\d{1,20}$/u),
      userId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({ with_member: z.boolean().optional() }).optional(),
    }),
    execute: async ({ threadId, userId, query }) => {
      const result = await discordClient.rest.get(`/channels/${threadId}/thread-members/${userId}`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getThreadMembers: tool({
    description: "List thread members.",
    inputSchema: z.object({
      threadId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({
        with_member: z.boolean().optional(),
        after: z.string().regex(/^\d{1,20}$/u).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }).optional(),
    }),
    execute: async ({ threadId, query }) => {
      const result = await discordClient.rest.get(`/channels/${threadId}/thread-members`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),

  // Messages and Polls:
  getMessage: tool({
    description: "Get a message by ID.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u), messageId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ channelId, messageId }) => {
      const result = await discordClient.rest.get(`/channels/${channelId}/messages/${messageId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  searchGuildMessages: tool({
    description: "Search indexed messages within the specified guild channels.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({
        content: z.string().max(1024),
        channel_id: z.array(z.string().regex(/^\d{1,20}$/u)).min(1).max(500),
        author_id: z.array(z.string().regex(/^\d{1,20}$/u)).max(100),
        author_type: z.array(z.string()),
        mentions: z.array(z.string().regex(/^\d{1,20}$/u)).max(100),
        mentions_role_id: z.array(z.string().regex(/^\d{1,20}$/u)).max(100),
        mention_everyone: z.boolean(),
        pinned: z.boolean(),
        has: z.array(z.string()),
        embed_type: z.array(z.string()),
        embed_provider: z.array(z.string()).max(100),
        link_hostname: z.array(z.string()).max(100),
        attachment_filename: z.array(z.string()).max(100),
        attachment_extension: z.array(z.string()).max(100),
        replied_to_user_id: z.array(z.string().regex(/^\d{1,20}$/u)).max(100),
        replied_to_message_id: z.array(z.string().regex(/^\d{1,20}$/u)).max(100),
        include_nsfw: z.boolean(),
        sort_by: z.enum(["timestamp", "relevance"]),
        sort_order: z.enum(["asc", "desc"]),
        slop: z.number().int().min(0).max(100),
        limit: z.number().int().min(1).max(25),
        offset: z.number().int().min(0).max(9975),
        min_id: z.string().regex(/^\d{1,20}$/u),
        max_id: z.string().regex(/^\d{1,20}$/u),
      }).partial().required({ channel_id: true }),
    }),
    execute: async ({ guildId, query }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/messages/search`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  sendRichMessage: tool({
    description: "Send a Discord message with embeds, components, stickers, TTS or files.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      body: z.object({
        content: z.string().max(2000),
        embeds: z.array(z.record(z.string(), z.json())).max(10),
        components: z.array(z.record(z.string(), z.json())),
        sticker_ids: z.array(z.string().regex(/^\d{1,20}$/u)).max(3),
        flags: z.number().int().nonnegative(),
      }).partial().extend({ tts: z.boolean().optional(), files: z.array(z.object({
        url: z.url({ protocol: /^https?$/u }),
        name: z.string().min(1),
      })).max(10).optional() }),
    }),
    execute: async ({ channelId, body: { files, ...body } }) => {
      // Pair multipart files with their attachment IDs and restrict mention parsing:
      return discordClient.rest.post(Routes.channelMessages(channelId), {
        body: { ...body, attachments: files?.map(({ name }, index) => ({ id: index, filename: name })), allowed_mentions: { parse: ["users", "roles"] } },
        files: files === undefined ? undefined : await Promise.all(files.map(async ({ url, name }) => MessagePayload.resolveFile({ attachment: url, name }))),
      });
    },
  }),
  editRichMessage: tool({
    description: "Edit the text, embeds, components or retained attachments of the bot's message.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u), messageId: z.string().regex(/^\d{1,20}$/u), body: z.object({
      content: z.string().max(2000),
      embeds: z.array(z.record(z.string(), z.json())).max(10),
      components: z.array(z.record(z.string(), z.json())),
      sticker_ids: z.array(z.string().regex(/^\d{1,20}$/u)).max(3),
      flags: z.number().int().nonnegative(),
    }).partial().omit({ sticker_ids: true }).extend({
      content: z.string().max(2000).nullable().optional(),
      attachments: z.array(z.object({ id: z.string().regex(/^\d{1,20}$/u), description: z.string().max(1024).optional() })).optional(),
    }) }),
    // Restrict mention parsing when updating the message body:
    execute: async ({ channelId, messageId, body }) => discordClient.rest.patch(Routes.channelMessage(channelId, messageId), {
      body: { ...body, allowed_mentions: { parse: ["users", "roles"] } },
    }),
  }),
  forwardMessage: tool({
    description: "Forward an existing message to another channel.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      messageId: z.string().regex(/^\d{1,20}$/u),
      toChannelId: z.string().regex(/^\d{1,20}$/u),
      guildId: z.string().regex(/^\d{1,20}$/u).optional(),
    }),
    // Send a forward reference to the original message:
    execute: async ({ channelId, messageId, toChannelId, guildId }) => discordClient.rest.post(Routes.channelMessages(toChannelId), {
      body: { message_reference: { type: 1, channel_id: channelId, message_id: messageId, guild_id: guildId }, allowed_mentions: { parse: [] } },
    }),
  }),
  crosspostMessage: tool({
    description: "Publish an announcement message to following channels.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u), messageId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ channelId, messageId }) => {
      const result = await discordClient.rest.post(`/channels/${channelId}/messages/${messageId}/crosspost`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  bulkDeleteMessages: tool({
    description: "Delete 2–100 guild messages less than two weeks old.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({ messages: z.array(z.string().regex(/^\d{1,20}$/u)).min(2).max(100) }),
    }),
    execute: async ({ channelId, reason, body }) => {
      const result = await discordClient.rest.post(`/channels/${channelId}/messages/bulk-delete`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  unpinMessage: tool({
    description: "Unpin a message.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      messageId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
    }),
    execute: async ({ channelId, messageId, reason }) => {
      const result = await discordClient.rest.delete(`/channels/${channelId}/messages/pins/${messageId}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getReactionUsers: tool({
    description: "List users who used an emoji reaction.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      messageId: z.string().regex(/^\d{1,20}$/u),
      emoji: z.string().min(1).describe("Unicode emoji, name:id or custom emoji markup"),
    }).extend({ after: z.string().regex(/^\d{1,20}$/u).optional(), limit: z.number().int().min(1).max(100).optional(), type: z.union([z.literal(0), z.literal(1)]).optional().describe("0 normal, 1 super reaction") }),
    execute: async ({ channelId, messageId, emoji, after, limit, type }) => {
      // Build the reaction pagination options:
      const query = new URLSearchParams();
      if (after !== undefined) query.set("after", after);
      if (limit !== undefined) query.set("limit", String(limit));
      if (type !== undefined) query.set("type", String(type));

      // Resolve the emoji for the reaction route:
      const parsedEmoji = parseEmoji(emoji);
      if (parsedEmoji === null) throw new Error("Invalid emoji");
      const reaction = encodeURIComponent(parsedEmoji.id === undefined ? parsedEmoji.name : `${parsedEmoji.name}:${parsedEmoji.id}`);
      return discordClient.rest.get(Routes.channelMessageReaction(channelId, messageId, reaction), { query });
    },
  }),
  removeReaction: tool({
    description: "Remove the bot's reaction or a specified user's reaction.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      messageId: z.string().regex(/^\d{1,20}$/u),
      emoji: z.string().min(1).describe("Unicode emoji, name:id or custom emoji markup"),
    }).extend({ userId: z.string().regex(/^\d{1,20}$/u).optional() }),
    execute: async ({ channelId, messageId, emoji, userId }) => {
      // Resolve the emoji for the reaction route:
      const parsedEmoji = parseEmoji(emoji);
      if (parsedEmoji === null) throw new Error("Invalid emoji");
      const reaction = encodeURIComponent(parsedEmoji.id === undefined ? parsedEmoji.name : `${parsedEmoji.name}:${parsedEmoji.id}`);

      // Choose the route for the bot's reaction or the specified user's reaction:
      const route = userId === undefined ? Routes.channelMessageOwnReaction(channelId, messageId, reaction) : Routes.channelMessageUserReaction(channelId, messageId, reaction, userId);
      await discordClient.rest.delete(route);
      return {};
    },
  }),
  clearEmojiReactions: tool({
    description: "Remove all reactions with one emoji from a message.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      messageId: z.string().regex(/^\d{1,20}$/u),
      emoji: z.string().min(1).describe("Unicode emoji, name:id or custom emoji markup"),
    }),
    execute: async ({ channelId, messageId, emoji }) => {
      // Resolve the emoji for the reaction route:
      const parsedEmoji = parseEmoji(emoji);
      if (parsedEmoji === null) throw new Error("Invalid emoji");
      const reaction = encodeURIComponent(parsedEmoji.id === undefined ? parsedEmoji.name : `${parsedEmoji.name}:${parsedEmoji.id}`);
      await discordClient.rest.delete(Routes.channelMessageReaction(channelId, messageId, reaction));
      return {};
    },
  }),
  clearMessageReactions: tool({
    description: "Remove all reactions from a message.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u), messageId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ channelId, messageId }) => {
      const result = await discordClient.rest.delete(`/channels/${channelId}/messages/${messageId}/reactions`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  endPoll: tool({
    description: "End a poll created by the bot.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u), messageId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ channelId, messageId }) => {
      const result = await discordClient.rest.post(`/channels/${channelId}/polls/${messageId}/expire`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getPollVoters: tool({
    description: "List voters for a specific poll answer.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      messageId: z.string().regex(/^\d{1,20}$/u),
      answer: z.string().min(1).regex(/^[\w-]+$/u),
      query: z.object({ after: z.string().regex(/^\d{1,20}$/u).optional(), limit: z.number().int().min(1).max(100).optional() }).optional(),
    }),
    execute: async ({ channelId, messageId, answer, query }) => {
      const result = await discordClient.rest.get(`/channels/${channelId}/polls/${messageId}/answers/${encodeURIComponent(answer)}`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),

  // Roles and Auto Mod:
  getRole: tool({
    description: "Get a guild role and its permissions.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), roleId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId, roleId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/roles/${roleId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  editRole: tool({
    description: "Edit a guild role.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), roleId: z.string().regex(/^\d{1,20}$/u), reason: z.string().max(512).optional(), body: z.object({
      name: z.string().max(100),
      permissions: z.string().regex(/^\d+$/u),
      colors: z.object({
        primary_color: z.number().int(),
        secondary_color: z.number().int().optional(),
        tertiary_color: z.number().int().optional(),
      }),
      hoist: z.boolean(),
      mentionable: z.boolean(),
      icon: z.string().regex(/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/u).nullable(),
      unicode_emoji: z.string().nullable(),
    }).partial() }),
    execute: async ({ guildId, roleId, reason, body }) => {
      const result = await discordClient.rest.patch(`/guilds/${guildId}/roles/${roleId}`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  deleteRole: tool({
    description: "Delete a guild role.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      roleId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
    }),
    execute: async ({ guildId, roleId, reason }) => {
      const result = await discordClient.rest.delete(`/guilds/${guildId}/roles/${roleId}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  reorderRoles: tool({
    description: "Reorder guild roles.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.array(z.object({ id: z.string().regex(/^\d{1,20}$/u), position: z.number().int().min(1) })).min(1),
    }),
    execute: async ({ guildId, reason, body }) => {
      const result = await discordClient.rest.patch(`/guilds/${guildId}/roles`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getRoleMemberCounts: tool({
    description: "Get member counts by role in a guild.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/roles/member-counts`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  listAutoModerationRules: tool({
    description: "List guild AutoMod rules.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/auto-moderation/rules`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getAutoModerationRule: tool({
    description: "Get an AutoMod rule.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), ruleId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId, ruleId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/auto-moderation/rules/${ruleId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  createAutoModerationRule: tool({
    description: "Create an AutoMod rule.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), reason: z.string().max(512).optional(), body: z.object({
      name: z.string().min(1),
      event_type: z.number().int(),
      trigger_metadata: z.record(z.string(), z.json()),
      actions: z.array(z.object({ type: z.number().int(), metadata: z.record(z.string(), z.json()).optional() })),
      enabled: z.boolean(),
      exempt_roles: z.array(z.string().regex(/^\d{1,20}$/u)),
      exempt_channels: z.array(z.string().regex(/^\d{1,20}$/u)),
    }).partial().required({ name: true, event_type: true, actions: true }).extend({ trigger_type: z.number().int() }) }),
    execute: async ({ guildId, reason, body }) => {
      const result = await discordClient.rest.post(`/guilds/${guildId}/auto-moderation/rules`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  editAutoModerationRule: tool({
    description: "Edit an AutoMod rule.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), ruleId: z.string().regex(/^\d{1,20}$/u), reason: z.string().max(512).optional(), body: z.object({
      name: z.string().min(1),
      event_type: z.number().int(),
      trigger_metadata: z.record(z.string(), z.json()),
      actions: z.array(z.object({ type: z.number().int(), metadata: z.record(z.string(), z.json()).optional() })),
      enabled: z.boolean(),
      exempt_roles: z.array(z.string().regex(/^\d{1,20}$/u)),
      exempt_channels: z.array(z.string().regex(/^\d{1,20}$/u)),
    }).partial() }),
    execute: async ({ guildId, ruleId, reason, body }) => {
      const result = await discordClient.rest.patch(`/guilds/${guildId}/auto-moderation/rules/${ruleId}`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  deleteAutoModerationRule: tool({
    description: "Delete an AutoMod rule.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      ruleId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
    }),
    execute: async ({ guildId, ruleId, reason }) => {
      const result = await discordClient.rest.delete(`/guilds/${guildId}/auto-moderation/rules/${ruleId}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),

  // Invites and Webhooks:
  getInvite: tool({
    description: "Get an invite by code.",
    inputSchema: z.object({
      code: z.string().min(1).regex(/^[\w-]+$/u),
      query: z.object({
        with_counts: z.boolean().optional(),
        with_expiration: z.boolean().optional(),
        guild_scheduled_event_id: z.string().regex(/^\d{1,20}$/u).optional(),
      }).optional(),
    }),
    execute: async ({ code, query }) => {
      const result = await discordClient.rest.get(`/invites/${encodeURIComponent(code)}`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getChannelInvites: tool({
    description: "List channel invites.",
    inputSchema: z.object({ channelId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ channelId }) => {
      const result = await discordClient.rest.get(`/channels/${channelId}/invites`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildInvites: tool({
    description: "List guild invites.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/invites`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  deleteInvite: tool({
    description: "Revoke an invite.",
    inputSchema: z.object({ code: z.string().min(1).regex(/^[\w-]+$/u), reason: z.string().max(512).optional() }),
    execute: async ({ code, reason }) => {
      const result = await discordClient.rest.delete(`/invites/${encodeURIComponent(code)}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildWebhooks: tool({
    description: "List guild webhooks.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId }) => {
      const guild = await discordClient.guilds.fetch(guildId);
      return (await guild.fetchWebhooks()).map((webhook) => ({
        id: webhook.id,
        name: webhook.name,
        channelId: webhook.channelId,
        type: webhook.type,
        avatarUrl: webhook.avatarURL(),
      }));
    },
  }),
  getWebhook: tool({
    description: "Get webhook details.",
    inputSchema: z.object({ webhookId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ webhookId }) => {
      const webhook = await discordClient.fetchWebhook(webhookId);
      return {
        id: webhook.id,
        name: webhook.name,
        channelId: webhook.channelId,
        type: webhook.type,
        avatarUrl: webhook.avatarURL(),
      };
    },
  }),
  editWebhook: tool({
    description: "Edit a webhook's name, avatar or channel.",
    inputSchema: z.object({
      webhookId: z.string().regex(/^\d{1,20}$/u),
      body: z.object({ name: z.string(), avatar: z.string().nullable(), channel_id: z.string().regex(/^\d{1,20}$/u) }).partial(),
      reason: z.string().max(512).optional(),
    }),
    execute: async ({ webhookId, body, reason }) => {
      const webhook = await discordClient.fetchWebhook(webhookId);
      const editedWebhook = await webhook.edit({ name: body.name, avatar: body.avatar, channel: body.channel_id, reason });
      return {
        id: editedWebhook.id,
        name: editedWebhook.name,
        channelId: editedWebhook.channelId,
        type: editedWebhook.type,
        avatarUrl: editedWebhook.avatarURL(),
      };
    },
  }),
  deleteWebhook: tool({
    description: "Delete a webhook.",
    inputSchema: z.object({ webhookId: z.string().regex(/^\d{1,20}$/u), reason: z.string().max(512).optional() }),
    execute: async ({ webhookId, reason }) => {
      const result = await discordClient.rest.delete(`/webhooks/${webhookId}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getWebhookMessage: tool({
    description: "Get a message sent by a webhook.",
    inputSchema: z.object({
      webhookId: z.string().regex(/^\d{1,20}$/u),
      messageId: z.string().regex(/^\d{1,20}$/u),
      threadId: z.string().regex(/^\d{1,20}$/u).optional(),
    }),
    execute: async ({ webhookId, messageId, threadId }) => {
      // Fetch the message through its webhook, using the thread when supplied:
      const webhook = await discordClient.fetchWebhook(webhookId);
      const message = await webhook.fetchMessage(messageId, { threadId });
      return { id: message.id, content: message.content, channelId: message.channelId, createdAt: message.createdAt.toISOString() };
    },
  }),
  editWebhookMessage: tool({
    description: "Edit the text of a webhook message.",
    inputSchema: z.object({
      webhookId: z.string().regex(/^\d{1,20}$/u),
      messageId: z.string().regex(/^\d{1,20}$/u),
      threadId: z.string().regex(/^\d{1,20}$/u).optional(),
    }).extend({ content: z.string().max(2000).nullable() }),
    execute: async ({ webhookId, messageId, threadId, content }) => {
      // Edit through the original webhook and restrict mention parsing:
      const webhook = await discordClient.fetchWebhook(webhookId);
      const message = await webhook.editMessage(messageId, { content, threadId, allowedMentions: { parse: ["users", "roles"] } });
      return { messageId: message.id };
    },
  }),
  deleteWebhookMessage: tool({
    description: "Delete a message sent by a webhook.",
    inputSchema: z.object({
      webhookId: z.string().regex(/^\d{1,20}$/u),
      messageId: z.string().regex(/^\d{1,20}$/u),
      threadId: z.string().regex(/^\d{1,20}$/u).optional(),
    }),
    execute: async ({ webhookId, messageId, threadId }) => {
      // Delete through the original webhook, using the thread when supplied:
      const webhook = await discordClient.fetchWebhook(webhookId);
      await webhook.deleteMessage(messageId, threadId);
      return {};
    },
  }),

  // Expressions and events:
  getGuildEmoji: tool({
    description: "Get a custom guild emoji.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), emojiId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId, emojiId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/emojis/${emojiId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  editEmoji: tool({
    description: "Edit a guild emoji's name or allowed roles.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      emojiId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({ name: z.string().min(2).max(32), roles: z.array(z.string().regex(/^\d{1,20}$/u)).nullable() }).partial(),
    }),
    execute: async ({ guildId, emojiId, reason, body }) => {
      const result = await discordClient.rest.patch(`/guilds/${guildId}/emojis/${emojiId}`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  deleteEmoji: tool({
    description: "Delete a custom guild emoji.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      emojiId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
    }),
    execute: async ({ guildId, emojiId, reason }) => {
      const result = await discordClient.rest.delete(`/guilds/${guildId}/emojis/${emojiId}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getApplicationEmojis: tool({
    description: "List emojis owned by the application.",
    inputSchema: z.object({ applicationId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ applicationId }) => {
      const result = await discordClient.rest.get(`/applications/${applicationId}/emojis`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getApplicationEmoji: tool({
    description: "Get an application emoji.",
    inputSchema: z.object({ applicationId: z.string().regex(/^\d{1,20}$/u), emojiId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ applicationId, emojiId }) => {
      const result = await discordClient.rest.get(`/applications/${applicationId}/emojis/${emojiId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getSticker: tool({
    description: "Get a sticker by ID.",
    inputSchema: z.object({ stickerId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ stickerId }) => {
      const result = await discordClient.rest.get(`/stickers/${stickerId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildStickers: tool({
    description: "List custom guild stickers.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/stickers`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildSticker: tool({
    description: "Get a custom guild sticker.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), stickerId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId, stickerId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/stickers/${stickerId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  createSticker: tool({
    description: "Create a guild sticker from a PNG, APNG, GIF or Lottie URL.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      url: z.url({ protocol: /^https?$/u }),
      name: z.string().min(2).max(30),
      tags: z.string().max(200),
      description: z.string().max(100).optional(),
      reason: z.string().max(512).optional(),
    }),
    execute: async ({ guildId, url, name, tags, description, reason }) => {
      // Upload the sticker file to the target guild and return its URL:
      const guild = await discordClient.guilds.fetch(guildId);
      const sticker = await guild.stickers.create({ file: url, name, tags, description, reason });
      return { id: sticker.id, name: sticker.name, url: sticker.url };
    },
  }),
  editSticker: tool({
    description: "Edit a custom guild sticker.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      stickerId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({ name: z.string().min(2).max(30), description: z.string().max(100).nullable(), tags: z.string().max(200) }).partial(),
    }),
    execute: async ({ guildId, stickerId, reason, body }) => {
      const result = await discordClient.rest.patch(`/guilds/${guildId}/stickers/${stickerId}`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  deleteSticker: tool({
    description: "Delete a custom guild sticker.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      stickerId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
    }),
    execute: async ({ guildId, stickerId, reason }) => {
      const result = await discordClient.rest.delete(`/guilds/${guildId}/stickers/${stickerId}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildEvents: tool({
    description: "List scheduled guild events.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), query: z.object({ with_user_count: z.boolean().optional() }).optional() }),
    execute: async ({ guildId, query }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/scheduled-events`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildEvent: tool({
    description: "Get a scheduled guild event.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      eventId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({ with_user_count: z.boolean().optional() }).optional(),
    }),
    execute: async ({ guildId, eventId, query }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/scheduled-events/${eventId}`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  editGuildEvent: tool({
    description: "Edit an event or change its status (1 scheduled, 2 active, 3 completed, 4 canceled).",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), eventId: z.string().regex(/^\d{1,20}$/u), reason: z.string().max(512).optional(), body: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(1000).nullable(),
      scheduled_start_time: z.iso.datetime({ offset: true }),
      scheduled_end_time: z.iso.datetime({ offset: true }).nullable(),
      channel_id: z.string().regex(/^\d{1,20}$/u).nullable(),
      entity_type: z.number().int().min(1).max(3),
      entity_metadata: z.object({ location: z.string().max(100) }).nullable(),
      privacy_level: z.literal(2),
      status: z.number().int().min(1).max(4),
      image: z.string().regex(/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/u).nullable(),
      recurrence_rule: z.record(z.string(), z.json()).nullable(),
    }).partial() }),
    execute: async ({ guildId, eventId, reason, body }) => {
      const result = await discordClient.rest.patch(`/guilds/${guildId}/scheduled-events/${eventId}`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  deleteGuildEvent: tool({
    description: "Delete a scheduled guild event.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      eventId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
    }),
    execute: async ({ guildId, eventId, reason }) => {
      const result = await discordClient.rest.delete(`/guilds/${guildId}/scheduled-events/${eventId}`, { reason });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  getGuildEventSubscribers: tool({
    description: "List users interested in a scheduled guild event.",
    inputSchema: z.object({
      guildId: z.string().regex(/^\d{1,20}$/u),
      eventId: z.string().regex(/^\d{1,20}$/u),
      query: z.object({
        limit: z.number().int().min(1).max(100).optional(),
        before: z.string().regex(/^\d{1,20}$/u).optional(),
        after: z.string().regex(/^\d{1,20}$/u).optional(),
        with_member: z.boolean().optional(),
      }).optional(),
    }),
    execute: async ({ guildId, eventId, query }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/scheduled-events/${eventId}/users`, {
        query: makeURLSearchParams(query),
      });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),
  // Direct messages:
  openDm: tool({
    description: "Open a direct message channel with a user.",
    inputSchema: z.object({ body: z.object({ recipient_id: z.string().regex(/^\d{1,20}$/u) }) }),
    execute: async ({ body }) => {
      const result = await discordClient.rest.post("/users/@me/channels", { body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),

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
      // Fetch the guild and return its ownership and member count:
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
      // Read the requested page of audit entries and report the actors and targets:
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
      // Read all guild channels before applying the optional name filter:
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
      // Fetch the channel and return the fields supported by its type:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");

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
      // Create the channel with the requested Discord type and settings:
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
      // Resolve a renamable channel and record its previous name:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
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
      // Resolve a channel type that supports topics before updating it:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
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
      // Resolve the parent channel and validate the requested thread target:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isTextBased()) throw new Error("Channel does not support messages");
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

      // Select members by ID, name, voice presence or the default server list:
      const hasNameFilter = nameFilter !== undefined && nameFilter !== "";
      const memberById = hasNameFilter && (/^\d+$/u).test(nameFilter) ? await guild.members.fetch(nameFilter) : undefined;
      const membersInVoice = !hasNameFilter && inVoice === true ? guild.members.cache.filter((member) => member.voice.channelId !== null) : undefined;
      const memberQuery = hasNameFilter ? { query: nameFilter, limit: 100 } : { limit: 100 };
      const members = memberById === undefined ? [...(membersInVoice ?? await guild.members.fetch(memberQuery)).values()] : [memberById];

      // Return the member details with their current presence:
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
      // Fetch the member and summarize their guild permissions and voice state:
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
      // Look up the optional guild display name before reading the Discord user:
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
      // Resolve the member and retain the old nickname for the result:
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
      // Apply the timeout and report its effective end time:
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
      // Read all guild roles before applying the optional name filter:
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
      // Convert the optional hex color when creating the role in the guild:
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
      // Resolve the member and role in the requested guild:
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      const role = await guild.roles.fetch(roleId);
      if (role === null) {
        throw new Error("Role not found");
      }

      // Grant the role and report the affected member:
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
      // Resolve the member and role in the requested guild:
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      const role = await guild.roles.fetch(roleId);
      if (role === null) {
        throw new Error("Role not found");
      }

      // Remove the role and report the affected member:
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
      // Resolve the role in the requested guild:
      const guild = await discordClient.guilds.fetch(guildId);

      const role = await guild.roles.fetch(roleId);
      if (role === null) {
        throw new Error("Role not found");
      }

      // Move the role and report the old and new positions:
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
      // Reject conflicting pagination cursors:
      if ([before, after, around].filter((cursor) => cursor !== undefined).length > 1) {
        throw new Error("Use one cursor: before, after or around");
      }

      // Resolve a channel with message history:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isTextBased()) throw new Error("Channel does not support messages");

      // Fetch and format the requested page:
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
    description: "Send a channel message with Discord Markdown. Long text is split automatically, preserving links and inline code that fit in one message.",
    inputSchema: z.object({
      channelId: z.string(),
      content: z.string().min(1).describe(dedent`
        Discord Markdown supports:
        - Plain text with paragraphs separated by blank lines.
        - Bold (**text**), italics (*text* or _text_), underline (__text__), strikethrough (~~text~~), and spoilers (||text||).
        - Headings (# Heading, ## Heading, ### Heading) and subtext (-# text) at the start of a line.
        - Bulleted lists (- item or * item), numbered lists (1. item), and nested lists with indentation.
        - Single-line quotes (> text) and quotes that continue to the end of the message (>>> text), starting on a new line.
        - Inline code with single backticks and code blocks with triple backticks, optionally followed by a language name on the opening line.
        - Links as bare URLs or with labels ([label](https://example.com)).

        Discord also supports native message syntax:
        - User mentions (<@USER_ID>), channel or thread links (<#CHANNEL_ID>), and role mentions (<@&ROLE_ID>).
        - Custom emoji (<:name:EMOJI_ID>) and animated custom emoji (<a:name:EMOJI_ID>).
        - Slash command links (</command:COMMAND_ID>, </command subcommand:COMMAND_ID>, or </command group subcommand:COMMAND_ID>).
        - Localized timestamps (<t:UNIX_SECONDS:f>) and relative timestamps (<t:UNIX_SECONDS:R>).
      `).optional(),
      attachmentRef: z.uuid().optional().describe("Attachment reference returned by a tool"),
      attachmentRefs: z.array(z.uuid()).max(10).optional().describe("Attachment references returned by tools when replying with multiple files"),
    }),
    contextSchema: z.object({
      replyAttachments: z.custom<ReadonlyMap<string, { attachment: Buffer; name: string }>>((value) => value instanceof Map),
    }),
    outputSchema: z.object({
      messageIds: z.array(z.string()),
    }),
    execute: async ({ channelId, content, attachmentRef, attachmentRefs = [] }, { context }) => {
      // Resolve attachments and split outgoing text:
      const requestedAttachmentRefs = attachmentRef === undefined ? attachmentRefs : [attachmentRef, ...attachmentRefs];
      if (content === undefined && requestedAttachmentRefs.length === 0) throw new Error("Reply requires text or an attachment");
      if (requestedAttachmentRefs.length > 10) throw new Error("Reply supports at most 10 attachments");
      const files = requestedAttachmentRefs.map((ref) => {
        const file = context.replyAttachments.get(ref);
        if (file === undefined) throw new Error("Attachment not found in this conversation run");
        return file;
      });
      const chunks = content === undefined ? [undefined] : splitDiscordMessage(sanitizeDiscordMessage(content), { prefixContinuations: true });

      // Resolve a channel that can receive the message:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isSendable()) throw new Error("Channel does not support sending messages");

      // Send chunks in order and attach files to the final chunk:
      const messageIds: string[] = [];

      for (const [index, chunk] of chunks.entries()) {
        const message = await channel.send({
          content: chunk,
          files: files.length > 0 && index === chunks.length - 1 ? files : undefined,
          flags: MessageFlags.SuppressEmbeds,
        });
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
      // Require exactly one destination:
      if (channelId === undefined && userId === undefined) {
        throw new Error("Provide a target: channelId or userId");
      }
      if (channelId !== undefined && userId !== undefined) {
        throw new Error("Provide only one target: channelId or userId");
      }

      // Build the embed and its link buttons:
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

      // Send the embed to the specified channel:
      if (channelId !== undefined) {
        const channel = await discordClient.channels.fetch(channelId);
        if (channel === null) throw new Error("Channel not found");
        if (!channel.isSendable()) throw new Error("Channel does not support sending messages");

        const message = await channel.send(payload);
        return { messageId: message.id };
      }

      // Open a direct message and send the embed:
      const user = await discordClient.users.fetch(userId!);
      const dmChannel = await user.createDM();

      const message = await dmChannel.send(payload);

      return { messageId: message.id };
    },
  }),

  sendDm: tool({
    description: "Send a direct message with Discord Markdown. Long text is split automatically, preserving links and inline code that fit in one message.",
    inputSchema: z.object({
      userId: z.string(),
      content: z.string().min(1).describe(dedent`
        Discord Markdown supports:
        - Plain text with paragraphs separated by blank lines.
        - Bold (**text**), italics (*text* or _text_), underline (__text__), strikethrough (~~text~~), and spoilers (||text||).
        - Headings (# Heading, ## Heading, ### Heading) and subtext (-# text) at the start of a line.
        - Bulleted lists (- item or * item), numbered lists (1. item), and nested lists with indentation.
        - Single-line quotes (> text) and quotes that continue to the end of the message (>>> text), starting on a new line.
        - Inline code with single backticks and code blocks with triple backticks, optionally followed by a language name on the opening line.
        - Links as bare URLs or with labels ([label](https://example.com)).

        Discord also supports native message syntax:
        - User mentions (<@USER_ID>), channel or thread links (<#CHANNEL_ID>), and role mentions (<@&ROLE_ID>).
        - Custom emoji (<:name:EMOJI_ID>) and animated custom emoji (<a:name:EMOJI_ID>).
        - Slash command links (</command:COMMAND_ID>, </command subcommand:COMMAND_ID>, or </command group subcommand:COMMAND_ID>).
        - Localized timestamps (<t:UNIX_SECONDS:f>) and relative timestamps (<t:UNIX_SECONDS:R>).
      `),
    }),
    outputSchema: z.object({
      messageIds: z.array(z.string()),
    }),
    execute: async ({ userId, content }) => {
      // Open the recipient's DM and send the text in Discord-sized chunks:
      const user = await discordClient.users.fetch(userId);
      const dmChannel = await user.createDM();

      const messageIds: string[] = [];

      for (const chunk of splitDiscordMessage(content, { prefixContinuations: true })) {
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
      // Resolve the target message before adding the requested reaction:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isTextBased()) throw new Error("Channel does not support messages");

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
      // Resolve a sendable channel and post the poll:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isSendable()) throw new Error("Channel does not support sending messages");

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
      // Resolve the destination before downloading the file:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isSendable()) throw new Error("Channel does not support sending messages");

      // Download the file and derive a fallback filename from its URL:
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
      // Resolve an editable message in the requested channel:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isTextBased()) throw new Error("Channel does not support messages");

      const message = await channel.messages.fetch(messageId);
      if (!message.editable) {
        throw new Error("Only messages sent by the bot itself can be edited");
      }

      // Edit the message with mass mentions neutralized:
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
      // Resolve a deletable message in the requested channel:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isTextBased()) throw new Error("Channel does not support messages");

      const message = await channel.messages.fetch(messageId);
      if (!message.deletable) {
        throw new Error("This message cannot be deleted (missing Manage Messages permission)");
      }

      // Delete the selected message:
      await message.delete();

      return {};
    },
  }),

  sendReply: tool({
    description: "Reply to a message with Discord Markdown. Long text is split automatically, preserving links and inline code that fit in one message.",
    inputSchema: z.object({
      channelId: z.string(),
      messageId: z.string(),
      content: z.string().min(1).describe(dedent`
        Discord Markdown supports:
        - Plain text with paragraphs separated by blank lines.
        - Bold (**text**), italics (*text* or _text_), underline (__text__), strikethrough (~~text~~), and spoilers (||text||).
        - Headings (# Heading, ## Heading, ### Heading) and subtext (-# text) at the start of a line.
        - Bulleted lists (- item or * item), numbered lists (1. item), and nested lists with indentation.
        - Single-line quotes (> text) and quotes that continue to the end of the message (>>> text), starting on a new line.
        - Inline code with single backticks and code blocks with triple backticks, optionally followed by a language name on the opening line.
        - Links as bare URLs or with labels ([label](https://example.com)).

        Discord also supports native message syntax:
        - User mentions (<@USER_ID>), channel or thread links (<#CHANNEL_ID>), and role mentions (<@&ROLE_ID>).
        - Custom emoji (<:name:EMOJI_ID>) and animated custom emoji (<a:name:EMOJI_ID>).
        - Slash command links (</command:COMMAND_ID>, </command subcommand:COMMAND_ID>, or </command group subcommand:COMMAND_ID>).
        - Localized timestamps (<t:UNIX_SECONDS:f>) and relative timestamps (<t:UNIX_SECONDS:R>).
      `).optional(),
      attachmentRef: z.uuid().optional().describe("Attachment reference returned by a tool"),
      attachmentRefs: z.array(z.uuid()).max(10).optional().describe("Attachment references returned by tools when replying with multiple files"),
    }),
    contextSchema: z.object({
      replyAttachments: z.custom<ReadonlyMap<string, { attachment: Buffer; name: string }>>((value) => value instanceof Map),
    }),
    outputSchema: z.object({
      messageIds: z.array(z.string()),
    }),
    execute: async ({ channelId, messageId, content, attachmentRef, attachmentRefs = [] }, { context }) => {
      // Resolve attachments and split outgoing text:
      const requestedAttachmentRefs = attachmentRef === undefined ? attachmentRefs : [attachmentRef, ...attachmentRefs];
      if (content === undefined && requestedAttachmentRefs.length === 0) throw new Error("Reply requires text or an attachment");
      if (requestedAttachmentRefs.length > 10) throw new Error("Reply supports at most 10 attachments");
      const files = requestedAttachmentRefs.map((ref) => {
        const file = context.replyAttachments.get(ref);
        if (file === undefined) throw new Error("Attachment not found in this conversation run");
        return file;
      });
      const chunks = content === undefined ? [undefined] : splitDiscordMessage(sanitizeDiscordMessage(content));

      // Resolve a channel that can receive the reply:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isSendable()) throw new Error("Channel does not support sending messages");

      // Send chunks in order and attach files to the final chunk:
      const messageIds: string[] = [];

      for (const [index, chunk] of chunks.entries()) {
        const message = await channel.send({
          content: chunk,
          files: files.length > 0 && index === chunks.length - 1 ? files : undefined,
          flags: MessageFlags.SuppressEmbeds,
          reply: { messageReference: messageId },
        });
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
      // Resolve the target message and read the users for each reaction:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isTextBased()) throw new Error("Channel does not support messages");

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
      // Resolve the target message before pinning it:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isTextBased()) throw new Error("Channel does not support messages");

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
      // Resolve a channel with message history and read its pinned messages:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!channel.isTextBased()) throw new Error("Channel does not support messages");

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

  // Voice channel management:

  getMemberVoiceState: tool({
    description: "Get a member's voice state.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), userId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId, userId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/voice-states/${userId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),

  setVoiceChannelStatus: tool({
    description: "Set or clear a voice channel status.",
    inputSchema: z.object({
      channelId: z.string().regex(/^\d{1,20}$/u),
      reason: z.string().max(512).optional(),
      body: z.object({ status: z.string().max(500).nullable() }),
    }),
    execute: async ({ channelId, reason, body }) => {
      const result = await discordClient.rest.put(`/channels/${channelId}/voice-status`, { reason, body });
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),

  getGuildSoundboardSounds: tool({
    description: "List guild soundboard sounds.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/soundboard-sounds`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
    },
  }),

  getGuildSoundboardSound: tool({
    description: "Get a guild soundboard sound.",
    inputSchema: z.object({ guildId: z.string().regex(/^\d{1,20}$/u), soundId: z.string().regex(/^\d{1,20}$/u) }),
    execute: async ({ guildId, soundId }) => {
      const result = await discordClient.rest.get(`/guilds/${guildId}/soundboard-sounds/${soundId}`);
      if (result instanceof ArrayBuffer) return result.byteLength === 0 ? {} : new TextDecoder().decode(result);
      return result ?? {};
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
      // Require a connected member before disconnecting them:
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
      // Require a connected member before muting them:
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
      // Require a connected member before unmuting them:
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.setMute(false);

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
      // Require a connected member before undeafening them:
      const guild = await discordClient.guilds.fetch(guildId);

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.setDeaf(false);

      return { memberName: member.displayName };
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
      // Resolve the voice channel before selecting the activity application:
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
      // Resolve the source and destination voice channels:
      const guild = await discordClient.guilds.fetch(guildId);

      const fromChannel = await guild.channels.fetch(fromChannelId);
      if (fromChannel?.isVoiceBased() !== true) {
        throw new Error("Source voice channel not found");
      }

      const toChannel = await guild.channels.fetch(toChannelId);
      if (toChannel?.isVoiceBased() !== true) {
        throw new Error("Destination voice channel not found");
      }

      // Move members present in the source channel:
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
      // Resolve a channel that supports invitations before creating the invite:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
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
      // Resolve a channel that supports webhooks before listing them:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
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
      // Resolve a channel that supports webhooks:
      const channel = await discordClient.channels.fetch(channelId);
      if (channel === null) throw new Error("Channel not found");
      if (!("createWebhook" in channel)) {
        throw new Error("This channel type does not support webhooks");
      }

      // Download the optional avatar before creating the webhook:
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
      // Require exactly one webhook identifier or URL:
      if ((webhookId === undefined) === (webhookUrl === undefined)) {
        throw new Error("Provide exactly one of webhookId or webhookUrl");
      }

      // Resolve the webhook and post to the selected thread when supplied:
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
      // Fetch guild emojis and return their display syntax and image URLs:
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
      // Upload the image as a custom emoji in the target guild:
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
      // Resolve the server and validate the event destination:
      const guild = await discordClient.guilds.fetch(guildId);
      if ((channelId === undefined) === (location === undefined)) {
        throw new Error("Provide exactly one of channelId or location");
      }

      // Validate the start and calculate the end time:
      const startDate = new Date(startAt);
      if (Number.isNaN(startDate.getTime())) {
        throw new Error(`Invalid start date: ${startAt}`);
      }
      const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);

      // Resolve the Discord channel and event type when one was supplied:
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

      // Create the scheduled event with the resolved destination:
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
      // Validate the requested presence and streaming URL:
      if (status === undefined && activityName === undefined) {
        throw new Error("Provide a status or an activity");
      }
      if (typeof activityName === "string" && activityType === "streaming" && url === undefined) {
        throw new Error("The streaming activity type requires a url");
      }

      // Resolve the connected bot user:
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

      // Keep the current activities for status-only updates:
      const activities: ActivitiesOptions[] = activityName === undefined ? selfUser.presence.activities.map((activity) => ({
        name: activity.name,
        type: activity.type,
        state: activity.state ?? undefined,
        url: activity.url ?? undefined,
      })) : [];

      // Set the requested activity, or clear it when the name is null:
      if (typeof activityName === "string") {
        const resolvedType = activityType ?? "playing";
        activities.push(resolvedType === "custom" ? { name: "Custom Status", type: activityTypes.custom, state: activityName } : { name: activityName, type: activityTypes[resolvedType], url: resolvedType === "streaming" ? url : undefined });
      }

      // Apply the presence and report the requested values:
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

export type DiscordToolName = keyof typeof discordTools;

export const discordReadTools: ReadonlySet<DiscordToolName> = new Set<DiscordToolName>([
  "getActiveThreads",
  "getApplicationEmoji",
  "getApplicationEmojis",
  "getAuditLog",
  "getAutoModerationRule",
  "getBotGuilds",
  "getChannelDetails",
  "getChannelInfo",
  "getChannelInvites",
  "getChannelMemberPermissions",
  "getChannelMessages",
  "getChannelRolePermissions",
  "getChannels",
  "getGuildBan",
  "getGuildBans",
  "getGuildDetails",
  "getGuildEmoji",
  "getGuildEmojis",
  "getGuildEvent",
  "getGuildEvents",
  "getGuildEventSubscribers",
  "getGuildInfo",
  "getGuildInvites",
  "getGuildMember",
  "getGuildMemberPermissions",
  "getGuildRolePermissions",
  "getGuildSoundboardSound",
  "getGuildSoundboardSounds",
  "getGuildSticker",
  "getGuildStickers",
  "getGuildWebhooks",
  "getInvite",
  "getJoinedArchivedThreads",
  "getMemberInfo",
  "getMembers",
  "getMemberVoiceState",
  "getMessage",
  "getPinnedMessages",
  "getPollVoters",
  "getPrivateArchivedThreads",
  "getPruneCount",
  "getPublicArchivedThreads",
  "getReactions",
  "getReactionUsers",
  "getRole",
  "getRoleMemberCounts",
  "getRoles",
  "getSticker",
  "getThreadMember",
  "getThreadMembers",
  "getUserInfo",
  "getWebhook",
  "getWebhookMessage",
  "getWebhooks",
  "listAutoModerationRules",
  "listGuildMembers",
  "searchGuildMembers",
  "searchGuildMessages",
]);

export const getDiscordToolInputSchema = (name: DiscordToolName) => {
  const schema = discordTools[name].inputSchema;
  if (!(schema instanceof z.ZodObject)) throw new Error(`Expected an object schema for Discord tool ${name}`);
  return schema;
};
