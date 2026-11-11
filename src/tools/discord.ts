import type { ToolSet } from "ai";
import type { APIActionRowComponent, APIButtonComponent, APIButtonComponentWithURL } from "discord.js";
import { getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
import { discordClient } from "#/services/discord";
import { tool } from "ai";
import dedent from "dedent";
import { ButtonStyle, ChannelType, ComponentType } from "discord.js";
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
};
