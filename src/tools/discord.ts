import type { ToolSet } from "ai";
import { getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
import { discordClient } from "#/services/discord";
import { tool } from "ai";
import { ChannelType } from "discord.js";
import { z } from "zod";

export const discordTools: ToolSet = {
  listBotGuilds: tool({
    description: "List all Discord servers where the bot is present. Use this when someone asks to do something 'on another server' or 'on X server'.",
    inputSchema: z.object({}),
    outputSchema: z.array(z.object({
      id: z.string().describe("Guild ID"),
      name: z.string().describe("Guild name"),
      memberCount: z.number().describe("Number of members in the guild"),
      iconURL: z.string().nullable().describe("Guild icon URL"),
    })).describe("List of guilds where the bot is present"),
    execute: async () => {
      const guilds = discordClient.guilds.cache.map((guild) => ({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        iconURL: guild.iconURL(),
      }));
      return guilds;
    },
  }),

  checkUserInGuild: tool({
    description: "Check if a user is a member of a specific guild and get their permissions. ALWAYS use this before executing actions on a different server.",
    inputSchema: z.object({
      userId: z.string().describe("The Discord user ID to check"),
      guildId: z.string().describe("The Discord guild/server ID"),
    }),
    outputSchema: z.object({
      isMember: z.boolean().describe("Whether the user is a member of the guild"),
      canExecuteActions: z.boolean().describe("Whether the user can execute actions on this guild"),
      error: z.string().optional().describe("Error message if any"),
      userId: z.string().optional().describe("User ID"),
      username: z.string().optional().describe("Username"),
      displayName: z.string().optional().describe("Display name in the guild"),
      guildId: z.string().optional().describe("Guild ID"),
      guildName: z.string().optional().describe("Guild name"),
      isAdmin: z.boolean().optional().describe("Whether the user is an administrator"),
      permissions: z.array(z.string()).optional().describe("List of permissions"),
      canKick: z.boolean().optional().describe("Can kick members"),
      canBan: z.boolean().optional().describe("Can ban members"),
      canManageRoles: z.boolean().optional().describe("Can manage roles"),
      canManageChannels: z.boolean().optional().describe("Can manage channels"),
      canManageGuild: z.boolean().optional().describe("Can manage guild"),
      canMuteMembers: z.boolean().optional().describe("Can mute members"),
      canMoveMembers: z.boolean().optional().describe("Can move members"),
    }),
    execute: async ({ userId, guildId }) => {
      const guild = discordClient.guilds.cache.get(guildId);

      if (!guild) {
        return {
          error: "Guild not found",
          isMember: false,
          canExecuteActions: false,
        };
      }

      try {
        const member = await guild.members.fetch(userId);

        if (!member) {
          return {
            error: "User is not a member of this guild",
            isMember: false,
            canExecuteActions: false,
          };
        }

        const permissions = member.permissions.toArray();
        const isAdmin = member.permissions.has("Administrator");

        return {
          isMember: true,
          canExecuteActions: true,
          userId: userId,
          username: member.user.username,
          displayName: member.displayName,
          guildId: guildId,
          guildName: guild.name,
          isAdmin: isAdmin,
          permissions: permissions,
          canKick: member.permissions.has("KickMembers"),
          canBan: member.permissions.has("BanMembers"),
          canManageRoles: member.permissions.has("ManageRoles"),
          canManageChannels: member.permissions.has("ManageChannels"),
          canManageGuild: member.permissions.has("ManageGuild"),
          canMuteMembers: member.permissions.has("MuteMembers"),
          canMoveMembers: member.permissions.has("MoveMembers"),
        };
      }
      catch (error) {
        return {
          error: "User is not a member of this guild",
          isMember: false,
          canExecuteActions: false,
        };
      }
    },
  }),

  checkPermissions: tool({
    description: "Check what permissions a user has in the guild",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to check permissions for"),
    }),
    outputSchema: z.object({
      userId: z.string().describe("User ID"),
      username: z.string().describe("Username"),
      displayName: z.string().describe("Display name in the guild"),
      isAdmin: z.boolean().describe("Whether the user is an administrator"),
      permissions: z.array(z.string()).describe("List of all permissions"),
      canKick: z.boolean().describe("Can kick members"),
      canBan: z.boolean().describe("Can ban members"),
      canManageRoles: z.boolean().describe("Can manage roles"),
      canManageChannels: z.boolean().describe("Can manage channels"),
      canManageGuild: z.boolean().describe("Can manage guild"),
      canMuteMembers: z.boolean().describe("Can mute members"),
      canMoveMembers: z.boolean().describe("Can move members"),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const member = await guild.members.fetch(memberId);
      if (!member) throw new Error("Member not found");

      const permissions = member.permissions.toArray();
      const isAdmin = member.permissions.has("Administrator");

      return {
        userId: memberId,
        username: member.user.username,
        displayName: member.displayName,
        isAdmin: isAdmin,
        permissions: permissions,
        canKick: member.permissions.has("KickMembers"),
        canBan: member.permissions.has("BanMembers"),
        canManageRoles: member.permissions.has("ManageRoles"),
        canManageChannels: member.permissions.has("ManageChannels"),
        canManageGuild: member.permissions.has("ManageGuild"),
        canMuteMembers: member.permissions.has("MuteMembers"),
        canMoveMembers: member.permissions.has("MoveMembers"),
      };
    },
  }),

  getGuilds: tool({
    description: "Get all Discord servers (guilds)",
    inputSchema: z.object({}),
    outputSchema: z.array(z.object({
      id: z.string().describe("Guild ID"),
      name: z.string().describe("Guild name"),
      memberCount: z.number().describe("Number of members in the guild"),
    })).describe("List of all guilds"),
    execute: async () => {
      const guilds = discordClient.guilds.cache.map((guild) => ({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
      }));
      return guilds;
    },
  }),

  getChannels: tool({
    description: "Get all channels in a guild, optionally filter by name",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      nameFilter: z.string().optional().describe("Optional filter to search channels by name"),
    }),
    outputSchema: z.array(z.object({
      id: z.string().describe("Channel ID"),
      name: z.string().describe("Channel name"),
      type: z.string().describe("Channel type"),
    })).describe("List of channels in the guild"),
    execute: async ({ guildId, nameFilter }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      let channels = guild.channels.cache.map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: ChannelType[channel.type],
      }));

      if (nameFilter) {
        const filter = nameFilter.toLowerCase().replace(/\s+/g, "");
        channels = channels.filter((c) => {
          const channelName = c.name.toLowerCase().replace(/\s+/g, "");
          return channelName.includes(filter) || filter.includes(channelName);
        });
      }

      return channels;
    },
  }),

  getMembers: tool({
    description: "Get all members in a guild, optionally filter by username or display name. Returns voiceChannelId and voiceChannelName for members in voice channels.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      nameFilter: z.string().optional().describe("Optional filter to search members by username or display name"),
    }),
    execute: async ({ guildId, nameFilter }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      let members;

      if (nameFilter) {
        const filter = nameFilter.toLowerCase().replace(/\s+/g, "");

        if ((/^\d+$/).exec(filter)) {
          const member = await guild.members.fetch(filter);
          members = [member];
        }
        else {
          const fetchedMembers = await guild.members.fetch({
            query: nameFilter,
            limit: 100,
          });
          members = Array.from(fetchedMembers.values());
        }
      }
      else {
        const voiceMembers = guild.members.cache.filter((m) => m.voice.channelId);

        if (voiceMembers.size > 0) {
          members = Array.from(voiceMembers.values());
        }
        else {
          const fetchedMembers = await guild.members.fetch({ limit: 100 });
          members = Array.from(fetchedMembers.values());
        }
      }

      return members.map((member) => {
        const presence = member.presence;
        const activities = presence?.activities.map((activity) => ({
          name: activity.name,
          type: activity.type,
          details: activity.details,
          state: activity.state,
          url: activity.url,
        })) || [];

        return {
          id: member.id,
          username: member.user.username,
          displayName: member.displayName,
          status: presence?.status || "offline",
          activities: activities,
          voiceChannelId: member.voice.channelId,
          voiceChannelName: member.voice.channel?.name,
        };
      });
    },
  }),

  moveMember: tool({
    description: "Move a member to a voice channel",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to move"),
      channelId: z.string().describe("The voice channel ID to move the member to"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      memberName: z.string().describe("Name of the member moved"),
      channelName: z.string().describe("Name of the destination channel"),
      action: z.string().describe("Action performed"),
    }),
    execute: async ({ guildId, memberId, channelId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (!member) {
        throw new Error("Member not found");
      }

      if (!member.voice.channelId) {
        throw new Error("Member is not in a voice channel");
      }

      const channel = guild.channels.cache.get(channelId);
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        throw new Error("Voice channel not found");
      }

      await member.voice.setChannel(channel);

      return {
        success: true,
        memberName: member.displayName,
        channelName: channel.name,
        action: "moved",
      };
    },
  }),

  disconnectMember: tool({
    description: "Disconnect a member from their voice channel",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to disconnect"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      memberName: z.string().describe("Name of the member disconnected"),
      action: z.string().describe("Action performed"),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (!member) {
        throw new Error("Member not found");
      }

      if (!member.voice.channelId) {
        throw new Error("Member is not in a voice channel");
      }

      await member.voice.disconnect();

      return {
        success: true,
        memberName: member.displayName,
        action: "disconnected",
      };
    },
  }),

  renameMember: tool({
    description: "Change the nickname of a member in the guild",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to rename"),
      nickname: z.string().describe("The new nickname for the member"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      oldNickname: z.string().describe("Previous nickname"),
      newNickname: z.string().describe("New nickname"),
      memberId: z.string().describe("Member ID"),
    }),
    execute: async ({ guildId, memberId, nickname }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (!member) {
        throw new Error("Member not found");
      }

      const oldNickname = member.nickname || member.user.username;
      await member.setNickname(nickname);

      return {
        success: true,
        oldNickname: oldNickname,
        newNickname: nickname,
        memberId: member.id,
      };
    },
  }),

  getRoles: tool({
    description: "Get all roles in a guild, optionally filter by name",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      nameFilter: z.string().optional().describe("Optional filter to search roles by name"),
    }),
    execute: async ({ guildId, nameFilter }) => {
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

      if (nameFilter) {
        const filter = nameFilter.toLowerCase().replace(/\s+/g, "");
        roles = roles.filter((r) => {
          const roleName = r.name.toLowerCase().replace(/\s+/g, "");
          return roleName.includes(filter) || filter.includes(roleName);
        });
      }

      return roles;
    },
  }),

  createRole: tool({
    description: "Create a new role in a guild",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      name: z.string().describe("The name for the new role"),
      color: z.string().optional().describe("Optional hex color code for the role (e.g., #FF5733)"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      roleId: z.string().describe("ID of the created role"),
      roleName: z.string().describe("Name of the created role"),
      color: z.string().describe("Color of the role in hex format"),
    }),
    execute: async ({ guildId, name, color }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const role = await guild.roles.create({
        name,
        color: color ? parseInt(color.replace("#", ""), 16) : undefined,
      });

      return {
        success: true,
        roleId: role.id,
        roleName: role.name,
        color: role.hexColor,
      };
    },
  }),

  deleteRole: tool({
    description: "Delete a role from a guild",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      roleId: z.string().describe("The role ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      roleName: z.string().describe("Name of the deleted role"),
      roleId: z.string().describe("ID of the deleted role"),
    }),
    execute: async ({ guildId, roleId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const role = guild.roles.cache.get(roleId);
      if (!role) throw new Error("Role not found");

      const roleName = role.name;
      await role.delete();
      return {
        success: true,
        roleName: roleName,
        roleId: roleId,
      };
    },
  }),

  addRoleToMember: tool({
    description: "Add a role to a member",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to add the role to"),
      roleId: z.string().describe("The role ID to add"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      memberName: z.string().describe("Name of the member"),
      roleName: z.string().describe("Name of the role added"),
      action: z.string().describe("Action performed"),
    }),
    execute: async ({ guildId, memberId, roleId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const member = await guild.members.fetch(memberId);
      if (!member) throw new Error("Member not found");

      const role = guild.roles.cache.get(roleId);
      if (!role) throw new Error("Role not found");

      await member.roles.add(role);
      return {
        success: true,
        memberName: member.displayName,
        roleName: role.name,
        action: "added",
      };
    },
  }),

  removeRoleFromMember: tool({
    description: "Remove a role from a member",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to remove the role from"),
      roleId: z.string().describe("The role ID to remove"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      memberName: z.string().describe("Name of the member"),
      roleName: z.string().describe("Name of the role removed"),
      action: z.string().describe("Action performed"),
    }),
    execute: async ({ guildId, memberId, roleId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const member = await guild.members.fetch(memberId);
      if (!member) throw new Error("Member not found");

      const role = guild.roles.cache.get(roleId);
      if (!role) throw new Error("Role not found");

      await member.roles.remove(role);
      return {
        success: true,
        memberName: member.displayName,
        roleName: role.name,
        action: "removed",
      };
    },
  }),

  getCategories: tool({
    description: "Get all categories in a guild, optionally filter by name",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      nameFilter: z.string().optional().describe("Optional filter to search categories by name"),
    }),
    execute: async ({ guildId, nameFilter }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      let categories = guild.channels.cache
        .filter((channel) => channel.type === ChannelType.GuildCategory)
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
        }));

      if (nameFilter) {
        const filter = nameFilter.toLowerCase().replace(/\s+/g, "");
        categories = categories.filter((c) => {
          const categoryName = c.name.toLowerCase().replace(/\s+/g, "");
          return categoryName.includes(filter) || filter.includes(categoryName);
        });
      }
      return categories;
    },
  }),

  createChannel: tool({
    description: "Create a new channel in a guild",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      name: z.string().describe("The name for the new channel"),
      type: z.enum(["text", "voice", "category"]).describe("The type of channel to create"),
      categoryId: z.string().optional().describe("Optional category ID to place the channel under"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      channelId: z.string().describe("ID of the created channel"),
      channelName: z.string().describe("Name of the created channel"),
      channelType: z.string().describe("Type of the created channel"),
    }),
    execute: async ({ guildId, name, type, categoryId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const channelType = type === "text" ? ChannelType.GuildText
        : type === "voice" ? ChannelType.GuildVoice
          : ChannelType.GuildCategory;

      const channel = await guild.channels.create({
        name,
        type: channelType,
        parent: categoryId || undefined,
      });
      return {
        success: true,
        channelId: channel.id,
        channelName: channel.name,
        channelType: type,
      };
    },
  }),

  deleteChannel: tool({
    description: "Delete a channel from a guild",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to delete"),
    }),
    outputSchema: z.object({
      success: z.literal(true).describe("Whether the operation was successful"),
      channelName: z.string().nullable().describe("Name of the deleted channel"),
      channelId: z.string().describe("ID of the deleted channel"),
    }),
    execute: async ({ channelId }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel) throw new Error("Channel not found");

      const channelName = "name" in channel ? channel.name : "Unknown";
      await channel.delete();
      return {
        success: true as const,
        channelName: channelName,
        channelId: channelId,
      };
    },
  }),

  renameChannel: tool({
    description: "Rename a channel",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to rename"),
      newName: z.string().describe("The new name for the channel"),
    }),
    outputSchema: z.object({
      success: z.literal(true).describe("Whether the operation was successful"),
      oldName: z.string().nullable().describe("Previous channel name"),
      newName: z.string().describe("New channel name"),
      channelId: z.string().describe("Channel ID"),
    }),
    execute: async ({ channelId, newName }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel) throw new Error("Channel not found");

      const oldName = "name" in channel ? channel.name : "Unknown";
      if ("setName" in channel) {
        await channel.setName(newName);
      }
      return {
        success: true as const,
        oldName: oldName,
        newName: newName,
        channelId: channelId,
      };
    },
  }),

  editRolePermissions: tool({
    description: "Edit permissions of a role",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      roleId: z.string().describe("The role ID to edit permissions for"),
      permissions: z.array(z.string()).describe("Array of permission strings to set for the role"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      roleName: z.string().describe("Name of the role"),
      roleId: z.string().describe("ID of the role"),
      permissions: z.array(z.string()).describe("Updated permissions"),
    }),
    execute: async ({ guildId, roleId, permissions }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const role = guild.roles.cache.get(roleId);
      if (!role) throw new Error("Role not found");

      await role.setPermissions(permissions as any);
      return {
        success: true,
        roleName: role.name,
        roleId: roleId,
        permissions: permissions,
      };
    },
  }),

  changeRolePosition: tool({
    description: "Change the position of a role in the hierarchy. Position 1 is the highest (just below @everyone at position 0). Lower numbers = higher in hierarchy.",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      roleId: z.string().describe("The role ID to change position for"),
      position: z.number().describe("The new position for the role (lower numbers = higher in hierarchy)"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      roleName: z.string().describe("Name of the role"),
      oldPosition: z.number().describe("Previous position"),
      newPosition: z.number().describe("New position"),
    }),
    execute: async ({ guildId, roleId, position }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const role = guild.roles.cache.get(roleId);
      if (!role) throw new Error("Role not found");

      const oldPosition = role.position;
      await role.setPosition(position);
      return {
        success: true,
        roleName: role.name,
        oldPosition: oldPosition,
        newPosition: position,
      };
    },
  }),

  kickMember: tool({
    description: "Kick a member from the guild",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to kick"),
      reason: z.string().optional().describe("Optional reason for kicking the member"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      memberName: z.string().describe("Name of the kicked member"),
      memberId: z.string().describe("ID of the kicked member"),
      reason: z.string().nullable().describe("Reason for kicking"),
      action: z.string().describe("Action performed"),
    }),
    execute: async ({ guildId, memberId, reason }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const member = await guild.members.fetch(memberId);
      if (!member) throw new Error("Member not found");

      await member.kick(reason);
      return {
        success: true,
        memberName: member.displayName,
        memberId: memberId,
        reason: reason || null,
        action: "kicked",
      };
    },
  }),

  banMember: tool({
    description: "Ban a member from the guild",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to ban"),
      reason: z.string().optional().describe("Optional reason for banning the member"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      memberName: z.string().describe("Name of the banned member"),
      memberId: z.string().describe("ID of the banned member"),
      reason: z.string().nullable().describe("Reason for banning"),
      action: z.string().describe("Action performed"),
    }),
    execute: async ({ guildId, memberId, reason }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const member = await guild.members.fetch(memberId);
      if (!member) throw new Error("Member not found");

      await member.ban({ reason });
      return {
        success: true,
        memberName: member.displayName,
        memberId: memberId,
        reason: reason || null,
        action: "banned",
      };
    },
  }),

  unbanMember: tool({
    description: "Unban a member from the guild using their user ID",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      userId: z.string().describe("The Discord user ID to unban"),
      reason: z.string().optional().describe("Optional reason for unbanning the user"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      userId: z.string().describe("ID of the unbanned user"),
      reason: z.string().nullable().describe("Reason for unbanning"),
      action: z.string().describe("Action performed"),
    }),
    execute: async ({ guildId, userId, reason }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      await guild.members.unban(userId, reason);
      return {
        success: true,
        userId: userId,
        reason: reason || null,
        action: "unbanned",
      };
    },
  }),

  muteMember: tool({
    description: "Mute a member in voice channel",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to mute"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      memberName: z.string().describe("Name of the muted member"),
      memberId: z.string().describe("ID of the muted member"),
      action: z.string().describe("Action performed"),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const member = await guild.members.fetch(memberId);
      if (!member) throw new Error("Member not found");

      if (!member.voice.channelId) throw new Error("Member is not in a voice channel");

      await member.voice.setMute(true);
      return {
        success: true,
        memberName: member.displayName,
        memberId: memberId,
        action: "muted",
      };
    },
  }),

  unmuteMember: tool({
    description: "Unmute a member in voice channel",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      memberId: z.string().describe("The Discord member ID to unmute"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      memberName: z.string().describe("Name of the unmuted member"),
      memberId: z.string().describe("ID of the unmuted member"),
      action: z.string().describe("Action performed"),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const member = await guild.members.fetch(memberId);
      if (!member) throw new Error("Member not found");

      if (!member.voice.channelId) throw new Error("Member is not in a voice channel");

      await member.voice.setMute(false);
      return {
        success: true,
        memberName: member.displayName,
        memberId: memberId,
        action: "unmuted",
      };
    },
  }),

  sendMessage: tool({
    description: "Send a message to a channel",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to send the message to"),
      content: z.string().describe("The message content to send"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      channelId: z.string().describe("ID of the channel"),
      contentLength: z.number().describe("Length of the message sent"),
    }),
    execute: async ({ channelId, content }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if ("send" in channel) {
        await channel.send(content);
      }
      return {
        success: true,
        channelId: channelId,
        contentLength: content.length,
      };
    },
  }),

  getChannelMessages: tool({
    description: "Get the last X messages from a text channel",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to fetch messages from"),
      limit: z.number().optional().describe("Number of messages to fetch (default: 10, max: 100)"),
    }),
    outputSchema: z.array(z.object({
      id: z.string().describe("Message ID"),
      authorID: z.string().describe("Author user ID"),
      authorUsername: z.string().describe("Author username"),
      content: z.string().describe("Message content"),
      createdAt: z.string().describe("ISO timestamp when message was created"),
      hasAttachments: z.boolean().describe("Whether the message has attachments"),
    })),
    execute: async ({ channelId, limit = 10 }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      const messages = await channel.messages.fetch({ limit: limit });

      return Array.from(messages.values()).map((msg) => ({
        id: msg.id,
        authorID: msg.author.id,
        authorUsername: msg.author.username,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
        hasAttachments: msg.attachments.size > 0,
      }));
    },
  }),

  sendEmbed: tool({
    description: "Send an embed message to a channel",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to send the embed to"),
      title: z.string().optional().describe("Optional title for the embed"),
      description: z.string().optional().describe("Optional description for the embed"),
      color: z.string().optional().describe("Optional hex color code for the embed (e.g., #FF5733)"),
      thumbnail: z.object({
        url: z.string().describe("URL of the thumbnail image"),
      }).optional().describe("Optional thumbnail image for the embed"),
      fields: z.array(z.object({
        name: z.string().describe("Field name"),
        value: z.string().describe("Field value"),
        inline: z.boolean().optional().describe("Whether the field should be displayed inline"),
      })).optional().describe("Optional array of fields to add to the embed"),
      buttons: z.array(z.object({
        label: z.string().describe("Button label text"),
        url: z.string().optional().describe("Optional URL for link buttons"),
        style: z.enum(["primary", "secondary", "success", "danger", "link"]).optional().describe("Optional button style"),
      })).optional().describe("Optional array of buttons to add to the embed"),
    }),
    execute: async ({ channelId, title, description, color, thumbnail, fields, buttons }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if ("send" in channel) {
        const components: any[] = [];

        if (buttons && buttons.length > 0) {
          const buttonStyleMap: any = {
            primary: 1,
            secondary: 2,
            success: 3,
            danger: 4,
            link: 5,
          };

          components.push({
            type: 1,
            components: buttons.map((btn: any) => {
              const style = buttonStyleMap[btn.style || "primary"];
              const button: any = {
                type: 2,
                label: btn.label,
                style,
              };

              if (btn.url && style === 5) {
                button.url = btn.url;
              }
              else if (!btn.url) {
                button.custom_id = `btn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              }

              return button;
            }),
          });
        }

        await channel.send({
          embeds: [{
            title,
            description,
            color: color ? parseInt(color.replace("#", ""), 16) : undefined,
            thumbnail,
            fields,
          }],
          components: components.length > 0 ? components : undefined,
        });
      }
      return {
        success: true,
        channelId: channelId,
        hasButtons: (buttons?.length || 0) > 0,
      };
    },
  }),

  deleteMessagesFromUser: tool({
    description: "Delete messages from a specific user in a channel",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to delete messages from"),
      userId: z.string().describe("The user ID whose messages should be deleted"),
      limit: z.number().optional().describe("Optional maximum number of messages to check (default: 100, max: 100)"),
    }),
    execute: async ({ channelId, userId, limit = 100 }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if ("messages" in channel && "bulkDelete" in channel) {
        const messages = await channel.messages.fetch({ limit: Math.min(limit, 100) });
        const userMessages = messages.filter((msg) => msg.author.id === userId);

        if (userMessages.size === 0) {
          throw new Error("No messages found from this user");
        }

        await channel.bulkDelete(userMessages, true);
        return {
          success: true,
          deletedCount: userMessages.size,
          userId: userId,
          channelId: channelId,
        };
      }

      throw new Error("Channel does not support message deletion");
    },
  }),

  deleteMessagesInChannel: tool({
    description: "Delete multiple messages in a channel",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to delete messages from"),
      limit: z.number().optional().describe("Optional maximum number of messages to delete (default: 100, max: 100)"),
    }),
    execute: async ({ channelId, limit = 100 }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if ("messages" in channel && "bulkDelete" in channel) {
        const messages = await channel.messages.fetch({ limit: Math.min(limit, 100) });

        if (messages.size === 0) {
          throw new Error("No messages found in this channel");
        }

        await channel.bulkDelete(messages, true);
        return {
          success: true,
          deletedCount: messages.size,
          channelId: channelId,
        };
      }

      throw new Error("Channel does not support message deletion");
    },
  }),

  sendDm: tool({
    description: "Send a direct message (DM) to a user",
    inputSchema: z.object({
      userId: z.string().describe("The user ID to send the DM to"),
      content: z.string().describe("The message content to send"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      username: z.string().describe("Username of the recipient"),
      userId: z.string().describe("ID of the recipient"),
    }),
    execute: async ({ userId, content }) => {
      const user = await discordClient.users.fetch(userId);
      if (!user) throw new Error("User not found");

      await user.send(content);
      return {
        success: true,
        username: user.username,
        userId: userId,
      };
    },
  }),

  sendDmEmbed: tool({
    description: "Send a direct message (DM) embed to a user",
    inputSchema: z.object({
      userId: z.string().describe("The user ID to send the DM embed to"),
      title: z.string().optional().describe("Optional title for the embed"),
      description: z.string().optional().describe("Optional description for the embed"),
      color: z.string().optional().describe("Optional hex color code for the embed (e.g., #FF5733)"),
      fields: z.array(z.object({
        name: z.string().describe("Field name"),
        value: z.string().describe("Field value"),
        inline: z.boolean().optional().describe("Whether the field should be displayed inline"),
      })).optional().describe("Optional array of fields to add to the embed"),
      buttons: z.array(z.object({
        label: z.string().describe("Button label text"),
        url: z.string().optional().describe("Optional URL for link buttons"),
        style: z.enum(["primary", "secondary", "success", "danger", "link"]).optional().describe("Optional button style"),
      })).optional().describe("Optional array of buttons to add to the embed"),
    }),
    execute: async ({ userId, title, description, color, fields, buttons }) => {
      const user = await discordClient.users.fetch(userId);
      if (!user) throw new Error("User not found");

      const components: any[] = [];

      if (buttons && buttons.length > 0) {
        const buttonStyleMap: any = {
          primary: 1,
          secondary: 2,
          success: 3,
          danger: 4,
          link: 5,
        };

        components.push({
          type: 1,
          components: buttons.map((btn: any) => {
            const style = buttonStyleMap[btn.style || "primary"];
            const button: any = {
              type: 2,
              label: btn.label,
              style,
            };

            if (btn.url && style === 5) {
              button.url = btn.url;
            }
            else if (!btn.url) {
              button.custom_id = `btn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }

            return button;
          }),
        });
      }

      await user.send({
        embeds: [{
          title,
          description,
          color: color ? parseInt(color.replace("#", ""), 16) : undefined,
          fields,
        }],
        components: components.length > 0 ? components : undefined,
      });
      return {
        success: true,
        username: user.username,
        userId: userId,
      };
    },
  }),

  joinVoiceChannel: tool({
    description: "Join a voice channel. IMPORTANT: To join the user's voice channel, first use getMembers to find the user, then use their voiceChannelId from the response.",
    inputSchema: z.object({
      channelID: z.string().describe("The voice channel ID to join. Get this from getMembers response (voiceChannelId field)."),
      guildId: z.string().describe("The guild/server ID"),
    }),
    outputSchema: z.object({
      channelId: z.string().describe("ID of the voice channel joined"),
      guildId: z.string().describe("ID of the guild"),
    }),
    execute: async ({ channelID, guildId }) => {
      const channel = discordClient.channels.cache.get(channelID);
      if (!channel?.isVoiceBased()) {
        throw new Error("Channel not found or not a voice channel");
      }

      joinVoiceChannel({
        channelId: channel.id,
        guildId: guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
      });

      return {
        channelId: channelID,
        guildId: guildId,
      };
    },
  }),

  leaveVoiceChannel: tool({
    description: "Leave the current voice channel",
    inputSchema: z.object({
      guildID: z.string().describe("ID of the guild/server where the voice channel is"),
    }),
    outputSchema: z.object({
      action: z
        .enum(["bot_not_connected_to_any_channel", "left_voice"])
        .describe("Action performed, left_voice if a channel is leaved"),
    }),
    execute: async ({ guildID }) => {
      const connection = getVoiceConnection(guildID);
      if (!connection) return { action: "bot_not_connected_to_any_channel" };

      connection.destroy();
      return { action: "left_voice" };
    },
  }),

  renameGuild: tool({
    description: "Rename the Discord server (guild)",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID to rename"),
      newName: z.string().describe("The new name for the server"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      oldName: z.string().describe("Previous guild name"),
      newName: z.string().describe("New guild name"),
      guildId: z.string().describe("Guild ID"),
    }),
    execute: async ({ guildId, newName }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const oldName = guild.name;
      await guild.setName(newName);
      return {
        success: true,
        oldName: oldName,
        newName: newName,
        guildId: guildId,
      };
    },
  }),

  createInvite: tool({
    description: "Create an invitation link for a channel",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to create an invite for"),
      maxAge: z.number().optional().describe("Optional maximum age of the invite in seconds (0 = never expires)"),
      maxUses: z.number().optional().describe("Optional maximum number of uses (0 = unlimited)"),
    }),
    outputSchema: z.object({
      url: z.string().describe("Invite URL"),
      code: z.string().describe("Invite code"),
      expiresAt: z.string().describe("Expiration date or 'Never'"),
      maxUses: z.union([z.number(), z.string()]).describe("Maximum uses or 'Unlimited'"),
    }),
    execute: async ({ channelId, maxAge = 0, maxUses = 0 }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel) throw new Error("Channel not found");

      if (!("createInvite" in channel)) {
        throw new Error("This channel type does not support invites");
      }

      const invite = await channel.createInvite({
        maxAge: maxAge,
        maxUses: maxUses,
      });

      return {
        url: invite.url,
        code: invite.code,
        expiresAt: maxAge > 0 ? new Date(Date.now() + maxAge * 1000).toISOString() : "Never",
        maxUses: maxUses || "Unlimited",
      };
    },
  }),

  createPoll: tool({
    description: "Create a poll in a channel",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to create the poll in"),
      question: z.string().describe("The poll question"),
      answers: z.array(z.string()).describe("Array of answer options (2-10 answers)"),
      duration: z.number().optional().describe("Optional poll duration in hours (default: 24, max: 168)"),
      allowMultiselect: z.boolean().optional().describe("Optional whether to allow multiple selections (default: false)"),
    }),
    execute: async ({ channelId, question, answers, duration = 24, allowMultiselect = false }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if (answers.length < 2 || answers.length > 10) {
        throw new Error("Poll must have between 2 and 10 answers");
      }

      if (duration > 168) {
        throw new Error("Poll duration cannot exceed 168 hours (7 days)");
      }

      if ("send" in channel) {
        await channel.send({
          poll: {
            question: { text: question },
            answers: answers.map((answer: string) => ({ text: answer })),
            duration: duration,
            allowMultiselect: allowMultiselect,
          },
        });

        return {
          success: true,
          question: question,
          answerCount: answers.length,
          duration: duration,
        };
      }

      throw new Error("Failed to create poll");
    },
  }),

  getWebhooks: tool({
    description: "Get all webhooks in a channel",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to get webhooks from"),
    }),
    outputSchema: z.array(z.object({
      webhookUrl: z.string().describe("Webhook URL"),
      webhookId: z.string().describe("Webhook ID"),
      name: z.string().nullable().describe("Webhook name"),
      avatarUrl: z.string().nullable().describe("Webhook avatar URL"),
    })).describe("List of webhooks in the channel"),
    execute: async ({ channelId }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if (!("fetchWebhooks" in channel)) {
        throw new Error("This channel type does not support webhooks");
      }

      const webhooks = await channel.fetchWebhooks();
      return webhooks.map((webhook) => ({
        webhookUrl: webhook.url,
        webhookId: webhook.id,
        name: webhook.name,
        avatarUrl: webhook.avatarURL(),
      }));
    },
  }),

  createWebhook: tool({
    description: "Create a webhook in a channel",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to create the webhook in"),
      name: z.string().describe("The name for the webhook"),
      avatarUrl: z.string().optional().describe("Optional avatar URL for the webhook"),
    }),
    outputSchema: z.object({
      webhookUrl: z.string().describe("Webhook URL"),
      webhookId: z.string().describe("Webhook ID"),
      name: z.string().describe("Webhook name"),
    }),
    execute: async ({ channelId, name, avatarUrl }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if (!("createWebhook" in channel)) {
        throw new Error("This channel type does not support webhooks");
      }

      let avatarBuffer: Buffer | undefined;
      if (avatarUrl) {
        const response = await fetch(avatarUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          avatarBuffer = Buffer.from(arrayBuffer);
        }
      }

      const webhook = await channel.createWebhook({
        name: name,
        avatar: avatarBuffer,
      });

      return {
        webhookUrl: webhook.url,
        webhookId: webhook.id,
        name: webhook.name,
      };
    },
  }),

  sendWebhookMessage: tool({
    description: `Envoie un message en utilisant un webhook (pour se faire passer pour quelqu'un).

⚠️⚠️⚠️ RÈGLE ABSOLUE - WEBHOOKS INTERDITS PAR DÉFAUT ⚠️⚠️⚠️

QUAND CRÉER UN WEBHOOK - MET TOUJOURS LA PHOTO DE PROFIL DU USER À IMITER:
Les webhooks sont des outils SPÉCIAUX que tu ne dois JAMAIS utiliser sauf si on te le demande EXPLICITEMENT avec des formulations comme:
- "fais-toi passer pour X"
- "réponds à la place de X"
- "parle en tant que X"
- "imite X"
- "envoie un message en tant que X"

❌ STRICTEMENT INTERDIT:
- Utiliser les webhooks "pour mieux répondre"
- Utiliser les webhooks sans qu'on te le demande EXPLICITEMENT ou sans que ce soit explicitement sous-entendu

✅ RÈGLE D'OR: Si le message ne contient PAS les mots "fais-toi passer", "à la place de", "en tant que", ou "imite" → NE TOUCHE PAS AUX WEBHOOKS.

FLUX SELON LE CAS:

CAS 1 - La personne EST sur le serveur:
1. Utilise getMembers pour récupérer l'ID et displayName du membre
2. ⚠️ OBLIGATOIRE: Utilise getUserAvatar pour récupérer son avatarUrl (NE SAUTE JAMAIS CETTE ÉTAPE)
3. Utilise getWebhooks sur le salon actuel pour voir si un webhook existe avec ce nom
4. Si webhook existe → utilise-le, sinon → createWebhook avec le displayName et avatarUrl
5. Utilise sendWebhookMessage avec le webhookUrl, displayName et avatarUrl

CAS 2 - La personne N'EST PAS sur le serveur (ou introuvable):
1. N'utilise pas de webhook et réponds normalement, ne parle pas du fait que tu n'as pas réussi à créer une webhook

⚠️ IMPORTANT:
- TOUJOURS appeler getUserAvatar pour les membres du serveur avant de créer le webhook
- Ne refuse JAMAIS de te faire passer pour quelqu'un sous prétexte qu'il n'est pas sur le serveur
- Réutilise les webhooks existants avec le même nom
- Utilise TOUJOURS le canal actuel
- AUCUNE confirmation, AUCUN message de type "Message envoyé en mode X" ou similaire
- Après avoir utilisé sendWebhookMessage, ne réponds RIEN. Le webhook parle pour toi.`,
    inputSchema: z.object({
      webhookUrl: z.string().describe("The webhook URL to send the message through"),
      content: z.string().describe("The message content to send"),
      username: z.string().describe("The username to display for the webhook message"),
      avatarUrl: z.string().optional().describe("Optional avatar URL for the webhook message"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      username: z.string().describe("Username used for the webhook message"),
    }),
    execute: async ({ webhookUrl, content, username, avatarUrl }) => {
      const payload: any = {
        content: content,
        username: username,
      };

      if (avatarUrl) {
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
        throw new Error(`Webhook request failed (${response.status}): ${errorText}`);
      }

      return {
        success: true,
        username: username,
      };
    },
  }),

  getUserAvatar: tool({
    description: "Get the avatar URL of a user",
    inputSchema: z.object({
      guildId: z.string().describe("The Discord guild/server ID"),
      userId: z.string().describe("The user ID to get the avatar for"),
    }),
    outputSchema: z.object({
      userId: z.string().describe("User ID"),
      username: z.string().describe("Username"),
      displayName: z.string().describe("Display name in the guild"),
      avatarUrl: z.string().describe("Avatar URL"),
    }),
    execute: async ({ guildId, userId }) => {
      const guild = discordClient.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found");

      const member = await guild.members.fetch(userId);
      if (!member) throw new Error("Member not found");

      const avatarUrl = member.user.displayAvatarURL({ size: 1024, extension: "png" });

      return {
        userId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        avatarUrl: avatarUrl,
      };
    },
  }),

  getUserInfo: tool({
    description: "Get basic information about a user by their ID. Optionally include guild-specific display name if `guildId` is provided.",
    inputSchema: z.object({
      userId: z.string().describe("The Discord user ID to fetch"),
      guildId: z.string().optional().describe("Optional guild ID to fetch member-specific info (displayName)")
    }),
    outputSchema: z.object({
      id: z.string().describe("User ID"),
      username: z.string().describe("Username"),
      tag: z.string().describe("Username#discriminator"),
      avatarUrl: z.string().nullable().describe("Avatar URL or null"),
      isBot: z.boolean().describe("Whether the user is a bot"),
      displayName: z.string().optional().describe("Guild display name if guildId provided and user is a member"),
      createdAt: z.string().optional().describe("User creation date (ISO)")
    }),
    execute: async ({ userId, guildId }) => {
      const user = await discordClient.users.fetch(userId);
      if (!user) throw new Error("User not found");

      let displayName = "";
      if (guildId) {
        const guild = await discordClient.guilds.fetch(guildId);
        if (!guild) throw new Error("Guild not found");
        const member = await guild.members.fetch(userId);
        if (!member) throw new Error("Member not found in guild");
        displayName = member.displayName;
      }

      return {
        id: user.id,
        username: user.username,
        tag: `${user.username}#${user.discriminator}`,
        avatarUrl: user.displayAvatarURL({ size: 1024, extension: "png" }),
        isBot: !!user.bot,
        displayName: displayName,
        createdAt: user.createdAt.toISOString(),
      };
    },
  }),

  getChannelInfo: tool({
    description: "Get information about a channel by its ID",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID to fetch"),
    }),
    outputSchema: z.object({
      id: z.string().describe("Channel ID"),
      name: z.string().nullable().describe("Channel name if available"),
      type: z.string().describe("Channel type"),
      guildId: z.string().nullable().describe("Guild ID if channel belongs to a guild"),
      parentId: z.string().nullable().describe("Category/parent ID if present"),
      nsfw: z.boolean().optional().describe("Whether the channel is marked NSFW"),
      topic: z.string().nullable().optional().describe("Channel topic/description for text channels"),
    }),
    execute: async ({ channelId }) => {
      const channel = await discordClient.channels.fetch(channelId);
      if (!channel) throw new Error("Channel not found");

      const name = 'name' in channel ? channel.name : "";
      const guildId = "guild" in channel ? channel.guild.id : "";
      const parentId = 'parentId' in channel ? (channel.parentId || "") : "";
      const nsfw = 'nsfw' in channel ? !!channel.nsfw : false;
      const topic = 'topic' in channel ? (channel.topic || "") : "";

      return {
        id: channel.id,
        name,
        type: ChannelType[channel.type],
        guildId,
        parentId,
        nsfw,
        topic,
      };
    },
  }),

  getGuildInfo: tool({
    description: "Get information about a guild (server) by its ID",
    inputSchema: z.object({
      guildId: z.string().describe("The guild ID to fetch"),
    }),
    outputSchema: z.object({
      id: z.string().describe("Guild ID"),
      name: z.string().describe("Guild name"),
      memberCount: z.number().describe("Number of members (approx)") ,
      ownerId: z.string().optional().describe("Owner user ID"),
      iconUrl: z.string().nullable().describe("Guild icon URL"),
      createdAt: z.string().optional().describe("Guild creation date (ISO)")
    }),
    execute: async ({ guildId }) => {
      const guild = await discordClient.guilds.fetch(guildId);
      if (!guild) throw new Error("Guild not found");

      return {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        ownerId: guild.ownerId as string,
        iconUrl: guild.iconURL?.() || "",
        createdAt: guild.createdAt.toISOString(),
      };
    },
  }),

  addReaction: tool({
    description: "Add a reaction (emoji) to a message. Supports Unicode emojis (e.g., '👍', '❤️') and custom server emojis (e.g., '<:name:id>' or 'name:id').",
    inputSchema: z.object({
      channelId: z.string().describe("The channel ID where the message is located"),
      messageId: z.string().describe("The message ID to add the reaction to"),
      emoji: z.string().describe("The emoji to react with. Can be a Unicode emoji (e.g., '👍', '❤️') or a custom emoji identifier (e.g., '<:name:id>' or 'name:id')"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the operation was successful"),
      channelId: z.string().describe("ID of the channel"),
      messageId: z.string().describe("ID of the message"),
      emoji: z.string().describe("Emoji that was added"),
    }),
    execute: async ({ channelId, messageId, emoji }) => {
      const channel = discordClient.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if (!("messages" in channel)) {
        throw new Error("Channel does not support messages");
      }

      const message = await channel.messages.fetch(messageId);
      if (!message) {
        throw new Error("Message not found");
      }

      await message.react(emoji);

      return {
        success: true,
        channelId: channelId,
        messageId: messageId,
        emoji: emoji,
      };
    },
  }),
};
