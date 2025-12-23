import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { botDiscord } from "../utils/discord";
import { ChannelType } from "discord.js";

export const discordTools: ToolSet = {
  getGuilds: tool({
    description: "Get all Discord servers (guilds)",
    inputSchema: z.object({}),
    execute: async () => {
      const guilds = botDiscord.guilds.cache.map(guild => ({
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
      guildId: z.string(),
      nameFilter: z.string().optional(),
    }),
    execute: async ({ guildId, nameFilter }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      let channels = guild.channels.cache.map(channel => ({
        id: channel.id,
        name: channel.name,
        type: ChannelType[channel.type],
      }));

      if (nameFilter) {
        const filter = nameFilter.toLowerCase().replace(/\s+/g, '');
        channels = channels.filter(c => {
          const channelName = c.name.toLowerCase().replace(/\s+/g, '');
          return channelName.includes(filter) || filter.includes(channelName);
        });
      }

      return channels;
    },
  }),

  getMembers: tool({
    description: "Get all members in a guild, optionally filter by username or display name",
    inputSchema: z.object({
      guildId: z.string(),
      nameFilter: z.string().optional(),
    }),
    execute: async ({ guildId, nameFilter }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      await guild.members.fetch();

      let members = guild.members.cache.map(member => {
        const presence = member.presence;
        const activities = presence?.activities.map(activity => ({
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

      if (nameFilter) {
        const filter = nameFilter.toLowerCase().replace(/\s+/g, '');
        members = members.filter(m => {
          const username = m.username.toLowerCase().replace(/\s+/g, '');
          const displayName = m.displayName.toLowerCase().replace(/\s+/g, '');
          return username.includes(filter) || 
                 displayName.includes(filter) ||
                 filter.includes(username) ||
                 filter.includes(displayName);
        });
      }

      return members;
    },
  }),

  moveMember: tool({
    description: "Move a member to a voice channel",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
      channelId: z.string(),
    }),
    execute: async ({ guildId, memberId, channelId }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
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

      return `Moved ${member.displayName} to ${channel.name}`;
    },
  }),

  disconnectMember: tool({
    description: "Disconnect a member from their voice channel",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
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

      return `Disconnected ${member.displayName}`;
    },
  }),

  getRoles: tool({
    description: "Get all roles in a guild, optionally filter by name",
    inputSchema: z.object({
      guildId: z.string(),
      nameFilter: z.string().optional(),
    }),
    execute: async ({ guildId, nameFilter }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      let roles = guild.roles.cache.map(role => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position,
      }));

      if (nameFilter) {
        const filter = nameFilter.toLowerCase().replace(/\s+/g, '');
        roles = roles.filter(r => {
          const roleName = r.name.toLowerCase().replace(/\s+/g, '');
          return roleName.includes(filter) || filter.includes(roleName);
        });
      }

      return roles;
    },
  }),

  createRole: tool({
    description: "Create a new role in a guild",
    inputSchema: z.object({
      guildId: z.string(),
      name: z.string(),
      color: z.string().optional(),
    }),
    execute: async ({ guildId, name, color }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const role = await guild.roles.create({
        name,
        color: color ? parseInt(color.replace('#', ''), 16) : undefined,
      });

      return `Created role ${role.name} (ID: ${role.id})`;
    },
  }),

  deleteRole: tool({
    description: "Delete a role from a guild",
    inputSchema: z.object({
      guildId: z.string(),
      roleId: z.string(),
    }),
    execute: async ({ guildId, roleId }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        throw new Error("Role not found");
      }

      await role.delete();

      return `Deleted role ${role.name}`;
    },
  }),

  addRoleToMember: tool({
    description: "Add a role to a member",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
      roleId: z.string(),
    }),
    execute: async ({ guildId, memberId, roleId }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (!member) {
        throw new Error("Member not found");
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        throw new Error("Role not found");
      }

      await member.roles.add(role);

      return `Added role ${role.name} to ${member.displayName}`;
    },
  }),

  removeRoleFromMember: tool({
    description: "Remove a role from a member",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
      roleId: z.string(),
    }),
    execute: async ({ guildId, memberId, roleId }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (!member) {
        throw new Error("Member not found");
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        throw new Error("Role not found");
      }

      await member.roles.remove(role);

      return `Removed role ${role.name} from ${member.displayName}`;
    },
  }),

  getCategories: tool({
    description: "Get all categories in a guild, optionally filter by name",
    inputSchema: z.object({
      guildId: z.string(),
      nameFilter: z.string().optional(),
    }),
    execute: async ({ guildId, nameFilter }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      let categories = guild.channels.cache
        .filter(channel => channel.type === ChannelType.GuildCategory)
        .map(channel => ({
          id: channel.id,
          name: channel.name,
        }));

      if (nameFilter) {
        const filter = nameFilter.toLowerCase().replace(/\s+/g, '');
        categories = categories.filter(c => {
          const categoryName = c.name.toLowerCase().replace(/\s+/g, '');
          return categoryName.includes(filter) || filter.includes(categoryName);
        });
      }

      return categories;
    },
  }),

  createChannel: tool({
    description: "Create a new channel in a guild",
    inputSchema: z.object({
      guildId: z.string(),
      name: z.string(),
      type: z.enum(["text", "voice", "category"]),
      categoryId: z.string().optional(),
    }),
    execute: async ({ guildId, name, type, categoryId }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const channelType = type === "text" ? ChannelType.GuildText : 
                          type === "voice" ? ChannelType.GuildVoice : 
                          ChannelType.GuildCategory;

      const channel = await guild.channels.create({
        name,
        type: channelType,
        parent: categoryId || undefined,
      });

      return `Created ${type} channel ${channel.name} (ID: ${channel.id})`;
    },
  }),

  deleteChannel: tool({
    description: "Delete a channel from a guild",
    inputSchema: z.object({
      guildId: z.string(),
      channelId: z.string(),
    }),
    execute: async ({ guildId, channelId }) => {
      const channel = botDiscord.channels.cache.get(channelId);
      if (!channel) {
        throw new Error("Channel not found");
      }

      const channelName = 'name' in channel ? channel.name : 'Unknown';
      await channel.delete();

      return `Deleted channel ${channelName}`;
    },
  }),

  renameChannel: tool({
    description: "Rename a channel",
    inputSchema: z.object({
      channelId: z.string(),
      newName: z.string(),
    }),
    execute: async ({ channelId, newName }) => {
      const channel = botDiscord.channels.cache.get(channelId);
      if (!channel) {
        throw new Error("Channel not found");
      }

      const oldName = 'name' in channel ? channel.name : 'Unknown';
      if ('setName' in channel) {
        await channel.setName(newName);
      }

      return `Renamed channel from ${oldName} to ${newName}`;
    },
  }),

  renameMember: tool({
    description: "Change the nickname of a member in the guild",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
      nickname: z.string(),
    }),
    execute: async ({ guildId, memberId, nickname }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = guild.members.cache.get(memberId);
      if (!member) {
        throw new Error("Member not found");
      }

      const oldNickname = member.nickname || member.user.username;
      await member.setNickname(nickname);

      return `Renamed member from ${oldNickname} to ${nickname}`;
    },
  }),

  editRolePermissions: tool({
    description: "Edit permissions of a role",
    inputSchema: z.object({
      guildId: z.string(),
      roleId: z.string(),
      permissions: z.array(z.string()),
    }),
    execute: async ({ guildId, roleId, permissions }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        throw new Error("Role not found");
      }

      await role.setPermissions(permissions as any);

      return `Updated permissions for role ${role.name}`;
    },
  }),

  changeRolePosition: tool({
    description: "Change the position of a role in the hierarchy. Position 1 is the highest (just below @everyone at position 0). Lower numbers = higher in hierarchy.",
    inputSchema: z.object({
      guildId: z.string(),
      roleId: z.string(),
      position: z.number(),
    }),
    execute: async ({ guildId, roleId, position }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        throw new Error("Role not found");
      }

      const oldPosition = role.position;
      await role.setPosition(position);

      return `Moved role ${role.name} from position ${oldPosition} to position ${position}`;
    },
  }),

  kickMember: tool({
    description: "Kick a member from the guild",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
      reason: z.string().optional(),
    }),
    execute: async ({ guildId, memberId, reason }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (!member) {
        throw new Error("Member not found");
      }

      await member.kick(reason);

      return `Kicked ${member.displayName}${reason ? ` for: ${reason}` : ''}`;
    },
  }),

  banMember: tool({
    description: "Ban a member from the guild",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
      reason: z.string().optional(),
    }),
    execute: async ({ guildId, memberId, reason }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const member = await guild.members.fetch(memberId);
      if (!member) {
        throw new Error("Member not found");
      }

      await member.ban({ reason });

      return `Banned ${member.displayName}${reason ? ` for: ${reason}` : ''}`;
    },
  }),

  sendMessage: tool({
    description: "Send a message to a channel",
    inputSchema: z.object({
      channelId: z.string(),
      content: z.string(),
    }),
    execute: async ({ channelId, content }) => {
      const channel = botDiscord.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if ('send' in channel) {
        await channel.send(content);
      }

      return `Message sent to channel`;
    },
  }),

  sendEmbed: tool({
    description: "Send an embed message to a channel",
    inputSchema: z.object({
      channelId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      color: z.string().optional(),
      fields: z.array(z.object({
        name: z.string(),
        value: z.string(),
        inline: z.boolean().optional(),
      })).optional(),
      buttons: z.array(z.object({
        label: z.string(),
        url: z.string().optional(),
        style: z.enum(['primary', 'secondary', 'success', 'danger', 'link']).optional(),
      })).optional(),
    }),
    execute: async ({ channelId, title, description, color, fields, buttons }) => {
      const channel = botDiscord.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if ('send' in channel) {
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
              const style = buttonStyleMap[btn.style || 'primary'];
              const button: any = {
                type: 2,
                label: btn.label,
                style,
              };
              
              if (btn.url && style === 5) {
                button.url = btn.url;
              } else if (!btn.url) {
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
            color: color ? parseInt(color.replace('#', ''), 16) : undefined,
            fields,
          }],
          components: components.length > 0 ? components : undefined,
        });
      }

      return `Embed sent to channel`;
    },
  }),

  muteMember: tool({
    description: "Mute a member in voice channel",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
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

      await member.voice.setMute(true);

      return `Muted ${member.displayName}`;
    },
  }),

  unmuteMember: tool({
    description: "Unmute a member in voice channel",
    inputSchema: z.object({
      guildId: z.string(),
      memberId: z.string(),
    }),
    execute: async ({ guildId, memberId }) => {
      const guild = botDiscord.guilds.cache.get(guildId);
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

      await member.voice.setMute(false);

      return `Unmuted ${member.displayName}`;
    },
  }),

  searchInternet: tool({
    description: "Search the internet for information using DuckDuckGo",
    inputSchema: z.object({
      query: z.string(),
      maxResults: z.number().optional(),
    }),
    execute: async ({ query, maxResults = 5 }) => {
      const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const response = await fetch(searchUrl);
      const data: any = await response.json();

      let results = [];

      if (data.AbstractText) {
        results.push({
          title: data.Heading || 'Summary',
          snippet: data.AbstractText,
          url: data.AbstractURL,
        });
      }

      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        const topics = data.RelatedTopics
          .filter((topic: any) => topic.Text && topic.FirstURL)
          .slice(0, maxResults - results.length)
          .map((topic: any) => ({
            title: topic.Text.split(' - ')[0] || 'Related',
            snippet: topic.Text,
            url: topic.FirstURL,
          }));
        results = results.concat(topics);
      }

      if (results.length === 0) {
        throw new Error(`No results found for: ${query}`);
      }

      return results;
    },
  }),

  deleteMessagesFromUser: tool({
    description: "Delete messages from a specific user in a channel",
    inputSchema: z.object({
      channelId: z.string(),
      userId: z.string(),
      limit: z.number().optional(),
    }),
    execute: async ({ channelId, userId, limit = 100 }) => {
      const channel = botDiscord.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if ('messages' in channel && 'bulkDelete' in channel) {
        const messages = await channel.messages.fetch({ limit: Math.min(limit, 100) });
        const userMessages = messages.filter(msg => msg.author.id === userId);
        
        if (userMessages.size === 0) {
          throw new Error("No messages found from this user");
        }

        await channel.bulkDelete(userMessages, true);

        return `Deleted ${userMessages.size} message(s) from user`;
      }

      throw new Error("Channel does not support message deletion");
    },
  }),

  deleteMessagesInChannel: tool({
    description: "Delete multiple messages in a channel",
    inputSchema: z.object({
      channelId: z.string(),
      limit: z.number().optional(),
    }),
    execute: async ({ channelId, limit = 100 }) => {
      const channel = botDiscord.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error("Channel not found or not a text channel");
      }

      if ('messages' in channel && 'bulkDelete' in channel) {
        const messages = await channel.messages.fetch({ limit: Math.min(limit, 100) });
        
        if (messages.size === 0) {
          throw new Error("No messages found in this channel");
        }

        await channel.bulkDelete(messages, true);

        return `Deleted ${messages.size} message(s) from channel`;
      }

      throw new Error("Channel does not support message deletion");
    },
  }),

  sendDm: tool({
    description: "Send a direct message (DM) to a user",
    inputSchema: z.object({
      userId: z.string(),
      content: z.string(),
    }),
    execute: async ({ userId, content }) => {
      const user = await botDiscord.users.fetch(userId);
      if (!user) {
        throw new Error("User not found");
      }

      await user.send(content);

      return `DM sent to ${user.username}`;
    },
  }),

  sendDmEmbed: tool({
    description: "Send a direct message (DM) embed to a user",
    inputSchema: z.object({
      userId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      color: z.string().optional(),
      fields: z.array(z.object({
        name: z.string(),
        value: z.string(),
        inline: z.boolean().optional(),
      })).optional(),
      buttons: z.array(z.object({
        label: z.string(),
        url: z.string().optional(),
        style: z.enum(['primary', 'secondary', 'success', 'danger', 'link']).optional(),
      })).optional(),
    }),
    execute: async ({ userId, title, description, color, fields, buttons }) => {
      const user = await botDiscord.users.fetch(userId);
      if (!user) {
        throw new Error("User not found");
      }

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
            const style = buttonStyleMap[btn.style || 'primary'];
            const button: any = {
              type: 2,
              label: btn.label,
              style,
            };
            
            if (btn.url && style === 5) {
              button.url = btn.url;
            } else if (!btn.url) {
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
          color: color ? parseInt(color.replace('#', ''), 16) : undefined,
          fields,
        }],
        components: components.length > 0 ? components : undefined,
      });

      return `DM embed sent to ${user.username}`;
    },
  }),

  joinVoiceChannel: tool({
    description: "Join a voice channel",
    inputSchema: z.object({
      channelId: z.string(),
      guildId: z.string(),
    }),
    execute: async ({ channelId, guildId }) => {
      return "Voice functionality not yet implemented - joinVoice function missing";
    },
  }),

  leaveVoiceChannel: tool({
    description: "Leave the current voice channel",
    inputSchema: z.object({}),
    execute: async () => {
      return "Voice functionality not yet implemented - leaveVoice function missing";
    },
  }),

  respondInVoice: tool({
    description: "Respond to the user in voice in their voice channel. Use this when the user explicitly asks for a voice response (e.g., 'tell me in voice', 'respond in voc', 'talk to me about'). The text should be conversational, without markdown, adapted to be spoken aloud.",
    inputSchema: z.object({
      guildId: z.string(),
      userId: z.string(),
      text: z.string(),
    }),
    execute: async ({ guildId, userId, text }) => {
      return "Voice functionality not yet implemented - respondInVoice function missing";
    },
  }),
};