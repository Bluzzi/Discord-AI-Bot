import type { ToolSet } from "ai";
import type { ActivitiesOptions, APIActionRowComponent, APIButtonComponent, APIButtonComponentWithURL, GuildVoiceChannelResolvable } from "discord.js";
import { createAudioPlayer, createAudioResource, getVoiceConnection, joinVoiceChannel, StreamType } from "@discordjs/voice";
import { discordClient } from "#/services/discord";
import { tool } from "ai";
import dedent from "dedent";
import { ActivityType, AuditLogEvent, ButtonStyle, ChannelType, ComponentType, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, InviteTargetType, ThreadAutoArchiveDuration } from "discord.js";
import { Readable } from "node:stream";
import { z } from "zod";

export const discordTools: ToolSet = {
  // Guilds:

  getGuildInfo: tool({
    description: "Get detailed information about a guild: name, member count, owner, icon and creation date.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
    }),
    outputSchema: z.object({
      id: z.string().describe("Guild ID"),
      name: z.string().describe("Guild name"),
      memberCount: z.number().describe("Member count"),
      ownerId: z.string().describe("Owner user ID"),
      iconUrl: z.string().nullable().describe("Guild icon URL"),
      createdAt: z.string().describe("Guild creation date (ISO)"),
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
    description: "Get the latest entries of the guild audit log: who did what (role changes, kicks, message deletions, channel updates...). Useful to investigate what happened in the server.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      limit: z.number().int().min(1).max(100).optional().describe("Number of entries to fetch (default: 10)"),
    }),
    outputSchema: z.array(z.object({
      id: z.string().describe("Audit log entry ID"),
      action: z.string().describe("Action performed (e.g. MemberRoleUpdate, MessageDelete, ChannelUpdate)"),
      actionType: z.string().describe("Action category (Create, Update or Delete)"),
      executorId: z.string().nullable().describe("User ID of the member who performed the action"),
      executorUsername: z.string().nullable().describe("Username of the member who performed the action"),
      targetId: z.string().nullable().describe("ID of the targeted entity"),
      reason: z.string().nullable().describe("Reason given for the action"),
      createdAt: z.string().describe("Entry date (ISO)"),
    })).describe("Audit log entries, newest first"),
    execute: async ({ guildId, limit = 10 }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const auditLogs = await guild.fetchAuditLogs({ limit });

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
    description: "List the channels of a guild (text, voice and categories), optionally filtered by name.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      nameFilter: z.string().optional().describe("Filter channels by name (case-insensitive, spaces ignored)"),
    }),
    outputSchema: z.array(z.object({
      id: z.string().describe("Channel ID"),
      name: z.string().describe("Channel name"),
      type: z.string().describe("Discord channel type (e.g. GuildText, GuildVoice, GuildCategory)"),
    })).describe("Channels of the guild"),
    execute: ({ guildId, nameFilter }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      let channels = guild.channels.cache.map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: ChannelType[channel.type],
      }));

      if (nameFilter !== undefined && nameFilter !== "") {
        const filter = nameFilter.toLowerCase().replace(/\s+/gu, "");
        channels = channels.filter((channel) => {
          const channelName = channel.name.toLowerCase().replace(/\s+/gu, "");
          return channelName.includes(filter) || filter.includes(channelName);
        });
      }

      return channels;
    },
  }),

  getChannelInfo: tool({
    description: "Get detailed information about a channel: name, type, guild, category, topic and NSFW flag.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to fetch"),
    }),
    outputSchema: z.object({
      id: z.string().describe("Channel ID"),
      name: z.string().nullable().describe("Channel name if available"),
      type: z.string().describe("Discord channel type (e.g. GuildText, GuildVoice, GuildCategory)"),
      guildId: z.string().nullable().describe("Guild ID if the channel belongs to a guild"),
      parentId: z.string().nullable().describe("Category (parent) ID if any"),
      nsfw: z.boolean().optional().describe("Whether the channel is marked NSFW"),
      topic: z.string().nullable().describe("Channel topic for text channels"),
    }),
    execute: async ({ channelId }) => {
      const channel = await discordClient.channels.fetch(channelId);
      if (!channel) {
        throw new Error("Channel not found");
      }

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
    description: "Create a channel (text, voice or category) in a guild.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      name: z.string().describe("The name for the new channel"),
      type: z.enum(["text", "voice", "category"]).describe("The type of channel to create"),
      categoryId: z.string().optional().describe("Category ID to place the channel under"),
    }),
    outputSchema: z.object({
      channelId: z.string().describe("ID of the created channel"),
      channelName: z.string().describe("Name of the created channel"),
      channelType: z.string().describe("Type of the created channel"),
    }),
    execute: async ({ guildId, name, type, categoryId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const channelTypes = {
        text: ChannelType.GuildText,
        voice: ChannelType.GuildVoice,
        category: ChannelType.GuildCategory,
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
      channelId: z.string().describe("The channel ID to rename"),
      newName: z.string().describe("The new name for the channel"),
    }),
    outputSchema: z.object({
      channelId: z.string().describe("Channel ID"),
      oldName: z.string().nullable().describe("Previous channel name"),
      newName: z.string().describe("New channel name"),
    }),
    execute: async ({ channelId, newName }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel) {
        throw new Error("Channel not found");
      }
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
    description: "Change the topic of a text channel. Pass an empty string to clear the topic.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to update"),
      topic: z.string().max(1024).describe("The new channel topic (empty string to clear)"),
    }),
    outputSchema: z.object({
      channelId: z.string().describe("Channel ID"),
      topic: z.string().describe("New channel topic"),
    }),
    execute: async ({ channelId, topic }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel === undefined || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
        throw new Error("Channel not found or not a text channel");
      }

      await channel.setTopic(topic === "" ? null : topic);

      return {
        channelId: channel.id,
        topic,
      };
    },
  }),

  createThread: tool({
    description: "Create a thread in a text channel, optionally started from an existing message.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to create the thread in"),
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
      threadId: z.string().describe("ID of the created thread"),
      threadName: z.string().describe("Name of the created thread"),
    }),
    execute: async ({ channelId, name, messageId, autoArchiveMinutes = ThreadAutoArchiveDuration.OneDay }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }
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
    description: "List the members of a guild with their status, activities and voice channel. Use inVoice to only get members currently in a voice channel.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      nameFilter: z.string().optional().describe("Filter members by username or display name (a numeric value is treated as a user ID)"),
      inVoice: z.boolean().optional().describe("Only return members currently in a voice channel (ignored when nameFilter is provided)"),
    }),
    outputSchema: z.array(z.object({
      id: z.string().describe("Member user ID"),
      username: z.string().describe("Username"),
      displayName: z.string().describe("Display name in the guild"),
      status: z.string().describe("Presence status (online, idle, dnd, offline)"),
      activities: z.array(z.object({
        name: z.string().describe("Activity name"),
        type: z.number().describe("Discord activity type enum value"),
        details: z.string().optional().describe("Activity details"),
        state: z.string().optional().describe("Activity state"),
        url: z.string().optional().describe("Activity URL"),
      })).describe("Current activities"),
      voiceChannelId: z.string().nullable().describe("Voice channel ID if the member is in a voice channel"),
      voiceChannelName: z.string().nullable().describe("Voice channel name if the member is in a voice channel"),
    })).describe("Members of the guild"),
    execute: async ({ guildId, nameFilter, inVoice }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

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
    description: "Get a member's profile in a guild: display name, avatar, status, voice channel and permissions. Fails if the user is not a member of the guild.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      userId: z.string().describe("The Discord user ID to fetch"),
    }),
    outputSchema: z.object({
      userId: z.string().describe("Member user ID"),
      username: z.string().describe("Username"),
      displayName: z.string().describe("Display name in the guild"),
      avatarUrl: z.string().describe("Avatar URL"),
      status: z.string().describe("Presence status (online, idle, dnd, offline)"),
      isAdmin: z.boolean().describe("Whether the member has the Administrator permission"),
      permissions: z.array(z.string()).describe("List of granted permissions"),
      voiceChannelId: z.string().nullable().describe("Voice channel ID if the member is in a voice channel"),
      voiceChannelName: z.string().nullable().describe("Voice channel name if the member is in a voice channel"),
    }),
    execute: async ({ guildId, userId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(userId);

      return {
        userId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        avatarUrl: member.user.displayAvatarURL({ size: 1024, extension: "png" }),
        status: member.presence?.status ?? "offline",
        isAdmin: member.permissions.has("Administrator"),
        permissions: member.permissions.toArray(),
        voiceChannelId: member.voice.channelId,
        voiceChannelName: member.voice.channel?.name ?? null,
      };
    },
  }),

  getUserInfo: tool({
    description: "Get a Discord user's global profile by ID: username, avatar and account creation date. Provide guildId to also get their display name in that guild.",
    inputSchema: z.object({
      userId: z.string().describe("The Discord user ID to fetch"),
      guildId: z.string().optional().describe("Guild ID to also fetch the member display name"),
    }),
    outputSchema: z.object({
      id: z.string().describe("User ID"),
      username: z.string().describe("Username"),
      globalName: z.string().nullable().describe("Global display name chosen by the user"),
      avatarUrl: z.string().describe("Avatar URL"),
      isBot: z.boolean().describe("Whether the user is a bot"),
      createdAt: z.string().describe("Account creation date (ISO)"),
      displayName: z.string().optional().describe("Guild display name, only when guildId is provided"),
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
    description: "Change the nickname of a member in a guild.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to rename"),
      nickname: z.string().describe("The new nickname for the member"),
    }),
    outputSchema: z.object({
      memberId: z.string().describe("Member ID"),
      oldNickname: z.string().describe("Previous nickname"),
      newNickname: z.string().describe("New nickname"),
    }),
    execute: async ({ guildId, memberId, nickname }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      const oldNickname = member.nickname ?? member.user.username;
      await member.setNickname(nickname);

      return {
        memberId: member.id,
        oldNickname,
        newNickname: nickname,
      };
    },
  }),

  timeoutMember: tool({
    description: "Put a member in timeout: the member can neither send messages, react nor speak in voice channels. Use for moderation or as a fun punishment.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to time out"),
      durationMinutes: z.number().int().min(1).max(40_320).optional().describe("Timeout duration in minutes, 1 to 40320 (28 days). Default: 10"),
      reason: z.string().optional().describe("Reason shown in the audit log"),
    }),
    outputSchema: z.object({
      memberName: z.string().describe("Display name of the timed out member"),
      until: z.string().describe("End of the timeout (ISO)"),
    }),
    execute: async ({ guildId, memberId, durationMinutes = 10, reason }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      await member.timeout(durationMinutes * 60_000, reason);

      const until = member.communicationDisabledUntil;
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
      guildId: z.string().describe("The Discord guild/server ID"),
      nameFilter: z.string().optional().describe("Filter roles by name (case-insensitive, spaces ignored)"),
    }),
    outputSchema: z.array(z.object({
      id: z.string().describe("Role ID"),
      name: z.string().describe("Role name"),
      color: z.string().describe("Role color in hex format"),
      position: z.number().describe("Role position in the hierarchy (higher = higher)"),
    })).describe("Roles of the guild"),
    execute: ({ guildId, nameFilter }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      let roles = guild.roles.cache.map((role) => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position,
      }));

      if (nameFilter !== undefined && nameFilter !== "") {
        const filter = nameFilter.toLowerCase().replace(/\s+/gu, "");
        roles = roles.filter((role) => {
          const roleName = role.name.toLowerCase().replace(/\s+/gu, "");
          return roleName.includes(filter) || filter.includes(roleName);
        });
      }

      return roles;
    },
  }),

  createRole: tool({
    description: "Create a role in a guild.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      name: z.string().describe("The name for the new role"),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional().describe("Hex color code (e.g. #5865F2)"),
    }),
    outputSchema: z.object({
      roleId: z.string().describe("ID of the created role"),
      roleName: z.string().describe("Name of the created role"),
      color: z.string().describe("Color of the role in hex format"),
    }),
    execute: async ({ guildId, name, color }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

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
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to add the role to"),
      roleId: z.string().describe("The role ID to add"),
    }),
    outputSchema: z.object({
      memberName: z.string().describe("Display name of the member"),
      roleName: z.string().describe("Name of the added role"),
    }),
    execute: async ({ guildId, memberId, roleId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      const role = guild.roles.cache.get(roleId);
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
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to remove the role from"),
      roleId: z.string().describe("The role ID to remove"),
    }),
    outputSchema: z.object({
      memberName: z.string().describe("Display name of the member"),
      roleName: z.string().describe("Name of the removed role"),
    }),
    execute: async ({ guildId, memberId, roleId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      const role = guild.roles.cache.get(roleId);
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
    description: "Move a role in the guild hierarchy. A higher position means higher in the hierarchy (@everyone is position 0, the lowest).",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      roleId: z.string().describe("The role ID to move"),
      position: z.number().int().min(1).describe("The new position for the role (higher = higher in hierarchy)"),
    }),
    outputSchema: z.object({
      roleName: z.string().describe("Name of the role"),
      oldPosition: z.number().describe("Previous position"),
      newPosition: z.number().describe("New position"),
    }),
    execute: async ({ guildId, roleId, position }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        throw new Error("Role not found");
      }

      const oldPosition = role.position;
      await role.setPosition(position);

      return {
        roleName: role.name,
        oldPosition,
        newPosition: position,
      };
    },
  }),

  // Messages:

  getChannelMessages: tool({
    description: "Get the most recent messages of a channel, from newest to oldest.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to fetch messages from"),
      limit: z.number().int().min(1).max(100).optional().describe("Number of messages to fetch (default: 10)"),
    }),
    outputSchema: z.array(z.object({
      id: z.string().describe("Message ID"),
      authorId: z.string().describe("Author user ID"),
      authorUsername: z.string().describe("Author username"),
      content: z.string().describe("Message content"),
      createdAt: z.string().describe("Creation date (ISO)"),
      hasAttachments: z.boolean().describe("Whether the message has attachments"),
      attachments: z.array(z.object({
        url: z.string().describe("Attachment URL"),
        name: z.string().describe("File name"),
        contentType: z.string().nullable().describe("MIME type"),
      })).describe("Message attachments"),
    })).describe("Messages, newest first"),
    execute: async ({ channelId, limit = 10 }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }

      const messages = await channel.messages.fetch({ limit });

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
    description: "Send a plain text message to a channel.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to send the message to"),
      content: z.string().describe("The message content to send"),
    }),
    outputSchema: z.object({
      messageId: z.string().describe("Sent message ID"),
    }),
    execute: async ({ channelId, content }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }
      if (!("send" in channel)) {
        throw new Error("Channel does not support sending messages");
      }

      const message = await channel.send(content);

      return { messageId: message.id };
    },
  }),

  sendEmbed: tool({
    description: "Send a rich embed to a channel or as a direct message. Provide exactly one target: channelId or userId.",
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
      messageId: z.string().describe("Sent message ID"),
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
        const channel = discordClient.channels.cache.get(channelId);
        if (channel?.isTextBased() !== true) {
          throw new Error("Channel not found or not a text channel");
        }
        if (!("send" in channel)) {
          throw new Error("Channel does not support sending messages");
        }

        const message = await channel.send(payload);
        return { messageId: message.id };
      }

      const user = await discordClient.users.fetch(userId!);
      const message = await user.send(payload);

      return { messageId: message.id };
    },
  }),

  sendDm: tool({
    description: "Send a plain text direct message to a user.",
    inputSchema: z.object({
      userId: z.string().describe("The user ID to send the direct message to"),
      content: z.string().describe("The message content to send"),
    }),
    outputSchema: z.object({
      messageId: z.string().describe("Sent message ID"),
    }),
    execute: async ({ userId, content }) => {
      const user = await discordClient.users.fetch(userId);
      const message = await user.send(content);

      return { messageId: message.id };
    },
  }),

  addReaction: tool({
    description: "Add an emoji reaction to a message. Supports Unicode emojis (e.g. 👍) and custom emojis (e.g. <:name:id>).",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID where the message is located"),
      messageId: z.string().describe("The message ID to react to"),
      emoji: z.string().describe("The emoji to react with (Unicode or custom emoji identifier)"),
    }),
    outputSchema: z.object({}),
    execute: async ({ channelId, messageId, emoji }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }

      const message = await channel.messages.fetch(messageId);
      await message.react(emoji);

      return {};
    },
  }),

  createPoll: tool({
    description: "Create a poll in a channel.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to create the poll in"),
      question: z.string().describe("The poll question"),
      answers: z.array(z.string()).min(2).max(10).describe("Answer options (2 to 10)"),
      duration: z.number().int().min(1).max(168).optional().describe("Poll duration in hours, 1 to 168 (default: 24)"),
      allowMultiselect: z.boolean().optional().describe("Allow multiple selections (default: false)"),
    }),
    outputSchema: z.object({}),
    execute: async ({ channelId, question, answers, duration = 24, allowMultiselect = false }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }
      if (!("send" in channel)) {
        throw new Error("Channel does not support sending messages");
      }

      await channel.send({
        poll: {
          question: { text: question },
          answers: answers.map((answer) => ({ text: answer })),
          duration,
          allowMultiselect,
        },
      });

      return {};
    },
  }),

  sendFile: tool({
    description: "Send a file (image, audio, document...) to a channel, downloaded from a URL. Optionally add a text message with it.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to send the file to"),
      url: z.url().describe("URL of the file to download and send"),
      name: z.string().optional().describe("File name shown in Discord (default: derived from the URL)"),
      content: z.string().optional().describe("Optional text message sent along with the file"),
    }),
    outputSchema: z.object({
      messageId: z.string().describe("Sent message ID"),
    }),
    execute: async ({ channelId, url, name, content }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }
      if (!("send" in channel)) {
        throw new Error("Channel does not support sending messages");
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download file (HTTP ${String(response.status)})`);
      }

      const urlName = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
      const fileName = name ?? (urlName !== "" ? urlName : "file");

      const message = await channel.send({
        content,
        files: [{ attachment: Buffer.from(await response.arrayBuffer()), name: fileName }],
      });

      return { messageId: message.id };
    },
  }),

  editMessage: tool({
    description: "Edit a message sent by the bot. Fails if the message was not sent by the bot.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID where the message is located"),
      messageId: z.string().describe("The message ID to edit"),
      newContent: z.string().describe("The new message content"),
    }),
    outputSchema: z.object({
      messageId: z.string().describe("Edited message ID"),
    }),
    execute: async ({ channelId, messageId, newContent }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }

      const message = await channel.messages.fetch(messageId);
      if (!message.editable) {
        throw new Error("Only messages sent by the bot itself can be edited");
      }

      await message.edit(newContent);

      return { messageId: message.id };
    },
  }),

  deleteMessage: tool({
    description: "Delete a message. The bot can always delete its own messages, and any other message if it has the Manage Messages permission.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID where the message is located"),
      messageId: z.string().describe("The message ID to delete"),
    }),
    outputSchema: z.object({}),
    execute: async ({ channelId, messageId }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }

      const message = await channel.messages.fetch(messageId);
      if (!message.deletable) {
        throw new Error("This message cannot be deleted (missing Manage Messages permission)");
      }

      await message.delete();

      return {};
    },
  }),

  replyToMessage: tool({
    description: "Send a message as a direct reply to a specific message (shows the reply preview above the message).",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to send the reply to"),
      messageId: z.string().describe("The message ID to reply to"),
      content: z.string().describe("The reply content to send"),
    }),
    outputSchema: z.object({
      messageId: z.string().describe("Sent message ID"),
    }),
    execute: async ({ channelId, messageId, content }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }
      if (!("send" in channel)) {
        throw new Error("Channel does not support sending messages");
      }

      const message = await channel.send({ content, reply: { messageReference: messageId } });

      return { messageId: message.id };
    },
  }),

  getReactions: tool({
    description: "Get all emoji reactions on a message, with counts and the users who reacted.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID where the message is located"),
      messageId: z.string().describe("The message ID to get reactions from"),
    }),
    outputSchema: z.array(z.object({
      emoji: z.string().describe("Emoji (Unicode character or <:name:id> / <a:name:id> markup)"),
      count: z.number().describe("Number of users who reacted"),
      users: z.array(z.object({
        id: z.string().describe("User ID"),
        username: z.string().describe("Username"),
        globalName: z.string().nullable().describe("Global display name"),
      })).describe("Users who reacted with this emoji"),
    })).describe("Reactions of the message"),
    execute: async ({ channelId, messageId }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }

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
      channelId: z.string().describe("The channel ID where the message is located"),
      messageId: z.string().describe("The message ID to pin"),
    }),
    outputSchema: z.object({}),
    execute: async ({ channelId, messageId }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }

      const message = await channel.messages.fetch(messageId);
      await message.pin();

      return {};
    },
  }),

  getPinnedMessages: tool({
    description: "Get the pinned messages of a channel.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to fetch pinned messages from"),
    }),
    outputSchema: z.array(z.object({
      id: z.string().describe("Message ID"),
      authorId: z.string().describe("Author user ID"),
      authorUsername: z.string().describe("Author username"),
      content: z.string().describe("Message content"),
      createdAt: z.string().describe("Creation date (ISO)"),
      pinnedAt: z.string().describe("Pin date (ISO)"),
    })).describe("Pinned messages of the channel"),
    execute: async ({ channelId }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }

      const pinned = await channel.messages.fetchPins();

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
    description: "Make the bot join a voice channel. To join a user's channel, get their voiceChannelId from getMembers first.",
    inputSchema: z.object({
      channelId: z.string().describe("The voice channel ID to join"),
      guildId: z.string().describe("The Discord guild/server ID"),
    }),
    outputSchema: z.object({}),
    execute: ({ channelId, guildId }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isVoiceBased() !== true) {
        throw new Error("Channel not found or not a voice channel");
      }

      joinVoiceChannel({
        channelId: channel.id,
        guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
      });

      return {};
    },
  }),

  leaveVoiceChannel: tool({
    description: "Make the bot leave its current voice channel in a guild. Fails if the bot is not connected to a voice channel.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
    }),
    outputSchema: z.object({}),
    execute: ({ guildId }) => {
      const connection = getVoiceConnection(guildId);
      if (!connection) {
        throw new Error("Bot is not connected to any voice channel in this guild");
      }

      connection.destroy();

      return {};
    },
  }),

  moveMember: tool({
    description: "Move a member to another voice channel. Fails if the member is not in a voice channel.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to move"),
      channelId: z.string().describe("The voice channel ID to move the member to"),
    }),
    outputSchema: z.object({
      memberName: z.string().describe("Display name of the moved member"),
      channelName: z.string().describe("Name of the destination channel"),
    }),
    execute: async ({ guildId, memberId, channelId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      const channel = guild.channels.cache.get(channelId);
      if (channel?.type !== ChannelType.GuildVoice) {
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
    description: "Disconnect a member from their current voice channel. Fails if the member is not in a voice channel.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to disconnect"),
    }),
    outputSchema: z.object({
      memberName: z.string().describe("Display name of the disconnected member"),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.disconnect();

      return { memberName: member.displayName };
    },
  }),

  muteMember: tool({
    description: "Server-mute a member in their voice channel. Fails if the member is not in a voice channel.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to mute"),
    }),
    outputSchema: z.object({
      memberName: z.string().describe("Display name of the muted member"),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.setMute(true);

      return { memberName: member.displayName };
    },
  }),

  unmuteMember: tool({
    description: "Remove the server-mute of a member in their voice channel. Fails if the member is not in a voice channel.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to unmute"),
    }),
    outputSchema: z.object({
      memberName: z.string().describe("Display name of the unmuted member"),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.setMute(false);

      return { memberName: member.displayName };
    },
  }),

  deafenMember: tool({
    description: "Server-deafen a member in their voice channel (they no longer hear anything). Fails if the member is not in a voice channel.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to deafen"),
    }),
    outputSchema: z.object({
      memberName: z.string().describe("Display name of the deafened member"),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.setDeaf(true);

      return { memberName: member.displayName };
    },
  }),

  undeafenMember: tool({
    description: "Remove the server-deafen of a member in their voice channel. Fails if the member is not in a voice channel.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to undeafen"),
    }),
    outputSchema: z.object({
      memberName: z.string().describe("Display name of the undeafened member"),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (member.voice.channelId === null) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.setDeaf(false);

      return { memberName: member.displayName };
    },
  }),

  playAudio: tool({
    description: "Play an audio stream (music, sound effect, radio, TTS audio...) in the voice channel the bot is connected to. Requires joinVoiceChannel first. Starting a new playback replaces the current one. Handles most formats (mp3, ogg, wav, radio streams...) through FFmpeg.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      url: z.url().describe("URL of the audio file or stream to play"),
    }),
    outputSchema: z.object({}),
    execute: async ({ guildId, url }) => {
      const connection = getVoiceConnection(guildId);
      if (!connection) {
        throw new Error("Bot is not connected to any voice channel in this guild");
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio (HTTP ${String(response.status)})`);
      }
      if (response.body === null) {
        throw new Error("Audio source returned an empty body");
      }

      const player = createAudioPlayer();
      // The listener prevents an unhandled "error" event (playback failure) from crashing the process:
      player.on("error", () => undefined);
      connection.subscribe(player);

      const resource = createAudioResource(Readable.fromWeb(response.body), { inputType: StreamType.Arbitrary });
      player.play(resource);

      return {};
    },
  }),

  startVoiceActivity: tool({
    description: "Get an invite link that launches a Discord embedded activity (game) in a voice channel: Watch Together, Poker Night, Chess in the Park, Spellcast... Share the returned URL in the chat: users click it to launch the activity in the channel.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      channelId: z.string().describe("The voice channel to launch the activity in"),
      activity: z.enum(["watch-together", "poker-night", "betrayal-io", "fishington-io", "chess-in-the-park", "checkers-in-the-park", "blazing-v8", "letter-tiles", "words-party", "spellcast", "sketch-heads", "putt-party"]).optional().describe("Activity to launch"),
      applicationId: z.string().optional().describe("Raw Discord application ID of an activity, for activities not in the list (overrides activity)"),
    }),
    outputSchema: z.object({
      url: z.string().describe("Activity invite URL to share"),
      activityName: z.string().nullable().describe("Name of the launched activity"),
      channelName: z.string().describe("Name of the voice channel"),
    }),
    execute: async ({ guildId, channelId, activity, applicationId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const channel = guild.channels.cache.get(channelId);
      if (channel?.type !== ChannelType.GuildVoice) {
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
        activityName: activity ?? null,
        channelName: channel.name,
      };
    },
  }),

  moveAllMembers: tool({
    description: "Move every member of a voice channel to another voice channel (e.g. to gather everyone for a game night).",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      fromChannelId: z.string().describe("The voice channel to move members from"),
      toChannelId: z.string().describe("The voice channel to move members to"),
    }),
    outputSchema: z.object({
      movedCount: z.number().describe("Number of moved members"),
      fromChannelName: z.string().describe("Name of the source channel"),
      toChannelName: z.string().describe("Name of the destination channel"),
    }),
    execute: async ({ guildId, fromChannelId, toChannelId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const fromChannel = guild.channels.cache.get(fromChannelId);
      if (fromChannel?.type !== ChannelType.GuildVoice) {
        throw new Error("Source voice channel not found");
      }

      const toChannel = guild.channels.cache.get(toChannelId);
      if (toChannel?.type !== ChannelType.GuildVoice) {
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
      channelId: z.string().describe("The channel ID to create the invite for"),
      maxAge: z.number().int().min(0).max(604_800).optional().describe("Invite lifetime in seconds, 0 for never expires (default: 86400 = 24h)"),
      maxUses: z.number().int().min(0).optional().describe("Maximum number of uses, 0 for unlimited (default: 0)"),
    }),
    outputSchema: z.object({
      url: z.string().describe("Invite URL"),
      code: z.string().describe("Invite code"),
      expiresAt: z.string().nullable().describe("Expiration date (ISO), null if never expires"),
      maxUses: z.number().describe("Maximum uses, 0 for unlimited"),
    }),
    execute: async ({ channelId, maxAge = 86_400, maxUses = 0 }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel) {
        throw new Error("Channel not found");
      }
      if (!("createInvite" in channel)) {
        throw new Error("This channel type does not support invites");
      }

      const invite = await channel.createInvite({ maxAge, maxUses });

      return {
        url: invite.url,
        code: invite.code,
        expiresAt: maxAge > 0 ? new Date(Date.now() + maxAge * 1000).toISOString() : null,
        maxUses,
      };
    },
  }),

  getWebhooks: tool({
    description: "List the webhooks of a channel.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to get webhooks from"),
    }),
    outputSchema: z.array(z.object({
      id: z.string().describe("Webhook ID"),
      url: z.string().describe("Webhook URL"),
      name: z.string().nullable().describe("Webhook name"),
      avatarUrl: z.string().nullable().describe("Webhook avatar URL"),
    })).describe("Webhooks of the channel"),
    execute: async ({ channelId }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }
      if (!("fetchWebhooks" in channel)) {
        throw new Error("This channel type does not support webhooks");
      }

      const webhooks = await channel.fetchWebhooks();

      return webhooks.map((webhook) => ({
        id: webhook.id,
        url: webhook.url,
        name: webhook.name,
        avatarUrl: webhook.avatarURL(),
      }));
    },
  }),

  createWebhook: tool({
    description: "Create a webhook in a channel, with an optional avatar. Prefer getWebhooks to reuse an existing webhook with the same name.",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to create the webhook in"),
      name: z.string().describe("The name for the webhook"),
      avatarUrl: z.url().optional().describe("Image URL to use as the webhook avatar"),
    }),
    outputSchema: z.object({
      id: z.string().describe("Webhook ID"),
      url: z.string().describe("Webhook URL"),
      name: z.string().nullable().describe("Webhook name"),
    }),
    execute: async ({ channelId, name, avatarUrl }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }
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
        url: webhook.url,
        name: webhook.name,
      };
    },
  }),

  sendWebhookMessage: tool({
    description: dedent`
      Send a message through a webhook, displaying a custom username and avatar (impersonation).

      STRICTLY reserved for explicit impersonation requests ("pretend to be X", "answer as X", "imitate X"). Never use it for normal messages — use sendMessage instead.

      Flow:
      1. getMembers to find the target member and their displayName
      2. getMemberInfo to get their avatarUrl
      3. getWebhooks on the current channel: reuse an existing webhook with the same name, otherwise createWebhook with the displayName and avatarUrl
      4. sendWebhookMessage with the webhook URL, the displayName and the avatarUrl
      5. After sending, do NOT reply — the webhook message speaks for itself
    `,
    inputSchema: z.object({
      webhookUrl: z.url().describe("The webhook URL to send the message through"),
      content: z.string().describe("The message content to send"),
      username: z.string().describe("The username to display for the webhook message"),
      avatarUrl: z.url().optional().describe("The avatar URL to display for the webhook message"),
    }),
    outputSchema: z.object({}),
    execute: async ({ webhookUrl, content, username, avatarUrl }) => {
      const payload: { content: string; username: string; avatar_url?: string } = {
        content,
        username,
      };

      if (avatarUrl !== undefined) {
        payload.avatar_url = avatarUrl;
      }

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Webhook request failed (HTTP ${String(response.status)}): ${errorText}`);
      }

      return {};
    },
  }),

  // Emojis:

  getGuildEmojis: tool({
    description: "List the custom emojis of a guild, with their markup to use them in messages or reactions.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
    }),
    outputSchema: z.array(z.object({
      id: z.string().describe("Emoji ID"),
      name: z.string().nullable().describe("Emoji name"),
      animated: z.boolean().describe("Whether the emoji is animated"),
      display: z.string().describe("Emoji markup to use in a message (e.g. <:name:id> or <a:name:id>)"),
      url: z.string().describe("Emoji image URL"),
    })).describe("Custom emojis of the guild"),
    execute: async ({ guildId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

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
    description: "Create a custom emoji in a guild from an image URL (max 256 KB, PNG/JPG/GIF). Combines well with the image tools to create emojis from generated or found images.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      name: z.string().regex(/^[a-z0-9_]{2,32}$/u).describe("Emoji name (2-32 characters: letters, numbers, underscores)"),
      imageUrl: z.url().describe("Image URL for the emoji (max 256 KB)"),
    }),
    outputSchema: z.object({
      id: z.string().describe("Emoji ID"),
      name: z.string().describe("Emoji name"),
      display: z.string().describe("Emoji markup to use in a message (e.g. <:name:id>)"),
      url: z.string().describe("Emoji image URL"),
    }),
    execute: async ({ guildId, name, imageUrl }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

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
    description: "Create a scheduled event in a guild (game night, movie night...), either in a voice/stage channel or at an external location.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      name: z.string().min(1).max(100).describe("Event name"),
      description: z.string().max(1000).optional().describe("Event description"),
      startAt: z.iso.datetime({ offset: true }).describe("Start date and time (ISO 8601)"),
      durationMinutes: z.number().int().min(1).max(43_200).optional().describe("Event duration in minutes (default: 60)"),
      channelId: z.string().optional().describe("Voice or stage channel ID for the event (provide either channelId or location)"),
      location: z.string().max(100).optional().describe("External location description (provide either channelId or location)"),
    }),
    outputSchema: z.object({
      id: z.string().describe("Event ID"),
      name: z.string().describe("Event name"),
      url: z.string().describe("Event URL (discord.com/events/...)"),
      startAt: z.string().describe("Start date and time (ISO)"),
      endAt: z.string().describe("End date and time (ISO)"),
    }),
    execute: async ({ guildId, name, description, startAt, durationMinutes = 60, channelId, location }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }
      if (channelId === undefined && location === undefined) {
        throw new Error("Provide a target: channelId or location");
      }

      const startDate = new Date(startAt);
      if (Number.isNaN(startDate.getTime())) {
        throw new Error(`Invalid start date: ${startAt}`);
      }
      const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);

      let eventChannel: GuildVoiceChannelResolvable | undefined;
      let entityType = GuildScheduledEventEntityType.External;

      if (channelId !== undefined) {
        const voiceChannel = guild.channels.cache.get(channelId);
        if (voiceChannel === undefined) {
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
    description: "Change the bot's own presence: status and/or activity shown in the member list (e.g. \"Playing Fortnite\", \"Listening to lofi\", custom status). Persists until changed again.",
    inputSchema: z.object({
      status: z.enum(["online", "idle", "dnd", "invisible"]).optional().describe("Presence status"),
      activityType: z.enum(["playing", "streaming", "listening", "watching", "competing", "custom"]).optional().describe("Activity type (default: playing)"),
      activityName: z.string().min(1).max(128).optional().describe("Activity text (e.g. \"Fortnite\", \"lofi radio\", or the custom status text)"),
      url: z.url().optional().describe("Stream URL (required for the streaming activity type)"),
    }),
    outputSchema: z.object({
      status: z.string().nullable().describe("New presence status, null if unchanged"),
      activityName: z.string().nullable().describe("New activity text, null if unchanged"),
    }),
    execute: ({ status, activityType, activityName, url }) => {
      if (status === undefined && activityName === undefined) {
        throw new Error("Provide a status or an activity");
      }
      if (activityType === "streaming" && url === undefined) {
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

      if (activityName !== undefined) {
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
};
