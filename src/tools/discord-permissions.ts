import type { DiscordToolName as ToolName } from "#/tools/discord";
import type { ToolExecuteFunction, ToolSet } from "ai";
import type { GuildBasedChannel, GuildMember, Message } from "discord.js";
import { discordClient, findDiscordGuildMember, getDiscordChannelPermissions, requireDiscordChannelPermissions } from "#/integrations/discord";
import { discordReadTools, discordTools, getDiscordToolInputSchema } from "#/tools/discord";
import { ChannelType, GuildScheduledEventEntityType, PermissionFlagsBits as permissionFlags } from "discord.js";
import { z } from "zod";

type Input = Record<string, unknown>;
type ChannelSelector = (input: Input, member: GuildMember) => unknown;
type Scope = { permission: bigint; resolve?: ChannelSelector; threadPermission?: bigint };
type Check = (input: Input, member: GuildMember) => void | Promise<void>;
type Rule = { guild?: bigint; channel?: Scope; check?: Check };

const id = z.string().regex(/^\d{1,20}$/u);
const object = z.record(z.string(), z.unknown());
const isPresent = (value: unknown) => value !== undefined && value !== null;
const denied = () => new Error("The requesting member does not have permission for this Discord action");

const hasGuildPermission = (member: GuildMember, permission: bigint) => permission === 0n
  || (!member.isCommunicationDisabled() && member.permissions.has(permission));

const targetChannel = async (member: GuildMember, channelId: unknown) => member.guild.channels.fetch(id.parse(channelId));
const checkChannel = async (member: GuildMember, channelId: unknown, permission: bigint) => {
  const channel = await targetChannel(member, channelId);
  if (channel === null) throw denied();
  await requireDiscordChannelPermissions(member, channel, permission);
  return channel;
};

const permissionIn = (target: GuildBasedChannel, scope: Scope) => target.isThread() ? scope.threadPermission ?? scope.permission : scope.permission;

const checkMemberHierarchy = async (member: GuildMember, userId: unknown, allowAbsent = false) => {
  const targetId = id.parse(userId);
  if (targetId === member.guild.ownerId || targetId === member.id) throw denied();
  if (member.id === member.guild.ownerId) return;

  const target = allowAbsent ? await findDiscordGuildMember(member.guild, targetId) : await member.guild.members.fetch(targetId);
  if (target !== null && member.roles.highest.comparePositionTo(target.roles.highest) <= 0) throw denied();
};

const checkRoleHierarchy = (member: GuildMember, roleId: unknown, position?: unknown) => {
  const role = member.guild.roles.cache.get(id.parse(roleId));
  if (role === undefined || role.managed || role.id === member.guild.id) throw denied();
  if (member.id === member.guild.ownerId) return;
  if (member.roles.highest.comparePositionTo(role) <= 0) throw denied();
  if (typeof position === "number" && position >= member.roles.highest.position) throw denied();
};

const checkRolePermissions = (member: GuildMember, permissions: unknown) => {
  if (typeof permissions === "string" && !member.permissions.has(BigInt(permissions))) throw denied();
};

const guild = (permission = 0n, check?: Check): Rule => ({ guild: permission, check });
const channel = (permission = 0n, resolve: ChannelSelector = (input) => input.channelId, check?: Check): Rule => ({
  channel: { permission, resolve },
  check,
});
const manageChannel = (check?: Check): Rule => ({
  channel: { permission: permissionFlags.ManageChannels, threadPermission: permissionFlags.ManageThreads, resolve: (input) => input.channelId },
  check,
});
const bodyChannel = (input: Input) => object.parse(input.body).channel_id;
const thread = (permission: bigint) => channel(permission, (input) => input.threadId);
const botVoice = (permission: bigint) => channel(permission, (_input, member) => member.guild.voiceStates.cache.get(discordClient.user?.id ?? "")?.channelId);
const memberVoice = (permission: bigint, check?: Check) => channel(permission, (input, member) => member.guild.voiceStates.cache.get(id.parse(input.memberId ?? input.userId))?.channelId, check);
const checkModerationTarget: Check = async (input, member) => checkMemberHierarchy(member, input.memberId ?? input.userId);
const stageModerator = permissionFlags.ManageChannels | permissionFlags.MuteMembers | permissionFlags.MoveMembers;

const webhook = (permission: bigint, check?: Check): Rule => ({
  channel: { permission },
  check: async (input, member) => {
    if (input.webhookUrl !== undefined) throw denied();
    const target = await discordClient.fetchWebhook(id.parse(input.webhookId));
    if (target.guildId !== member.guild.id) throw denied();
    const webhookChannel = await checkChannel(member, target.channelId, permission);
    if (input.threadId !== undefined) {
      const targetThread = await checkChannel(member, input.threadId, permission);
      if (!targetThread.isThread() || targetThread.parentId !== webhookChannel.id) throw denied();
    }
    await check?.(input, member);
  },
});

const scheduledEvent = (modify = false) => guild(modify ? permissionFlags.ManageEvents : 0n, async (input, member) => {
  const event = await member.guild.scheduledEvents.fetch(id.parse(input.eventId));
  if (event.channelId !== null) {
    const voicePermission = event.entityType === GuildScheduledEventEntityType.StageInstance ? stageModerator : permissionFlags.Connect;
    await checkChannel(member, event.channelId, modify ? permissionFlags.ManageEvents | voicePermission : 0n);
  }
  const newChannelId = input.body === undefined ? undefined : bodyChannel(input);
  if (isPresent(newChannelId)) {
    const target = await checkChannel(member, newChannelId, permissionFlags.ManageEvents);
    await requireDiscordChannelPermissions(member, target, target.type === ChannelType.GuildStageVoice ? stageModerator : permissionFlags.Connect);
  }
});

type ToolsByPermission = Partial<Record<keyof typeof permissionFlags | "Everyone", readonly ToolName[]>>;

const guildToolsByPermission = {
  Everyone: [
    "getGuildInfo",
    "listGuildMembers",
    "searchGuildMembers",
    "getGuildMember",
    "getGuildMemberPermissions",
    "getGuildRolePermissions",
    "getMembers",
    "getMemberInfo",
    "getChannels",
    "getActiveThreads",
    "getRoles",
    "getRole",
    "getRoleMemberCounts",
    "getDefaultSoundboardSounds",
    "getGuildSoundboardSounds",
    "getGuildSoundboardSound",
    "getGuildEmojis",
    "getGuildEmoji",
    "getGuildSticker",
    "getGuildStickers",
    "getGuildEvents",
    "getUserInfo",
    "getInvite",
    "getSticker",
  ],
  Administrator: ["pruneMembers"],
  BanMembers: ["getGuildBans", "getGuildBan", "unbanMember", "banMember"],
  CreateEvents: ["createGuildEvent"],
  CreateGuildExpressions: ["createEmoji", "createSticker"],
  KickMembers: ["kickMember"],
  ManageChannels: ["createChannel", "reorderChannels"],
  ManageGuild: [
    "getGuildDetails",
    "editGuildIncidentActions",
    "listAutoModerationRules",
    "getAutoModerationRule",
    "createAutoModerationRule",
    "editAutoModerationRule",
    "deleteAutoModerationRule",
    "getGuildInvites",
    "editGuild",
  ],
  ManageGuildExpressions: ["editEmoji", "deleteEmoji", "editSticker", "deleteSticker"],
  ManageNicknames: ["renameMember"],
  ManageRoles: [
    "createRole",
    "setMemberRoles",
    "editRole",
    "deleteRole",
    "changeRolePosition",
    "reorderRoles",
    "addRoleToMember",
    "removeRoleFromMember",
  ],
  ManageWebhooks: ["getGuildWebhooks"],
  ModerateMembers: ["timeoutMember", "removeMemberTimeout"],
  ViewAuditLog: ["getAuditLog"],
} satisfies ToolsByPermission;

const channelToolsByPermission = {
  Everyone: [
    "getChannelInfo",
    "getChannelDetails",
    "getChannelMemberPermissions",
    "getChannelRolePermissions",
    "getStageInstance",
  ],
  Administrator: ["deleteChannelPermission"],
  Connect: ["joinVoiceChannel"],
  CreateInstantInvite: ["createInvite"],
  CreatePrivateThreads: ["createPrivateThread"],
  ManageChannels: ["setChannelTopic", "getChannelInvites"],
  ManageMessages: [
    "deleteMessage",
    "bulkDeleteMessages",
    "removeReaction",
    "clearEmojiReactions",
    "clearMessageReactions",
    "endPoll",
  ],
  ManageWebhooks: ["getWebhooks", "createWebhook"],
  PinMessages: ["pinMessage", "unpinMessage"],
  ReadMessageHistory: [
    "getPublicArchivedThreads",
    "getMessage",
    "getChannelMessages",
    "getPinnedMessages",
    "getReactions",
    "getReactionUsers",
    "getPollVoters",
  ],
  SendMessages: ["triggerTyping"],
} satisfies ToolsByPermission;

const additionalChecks: Partial<Record<ToolName, Check>> = {
  editGuild: async ({ body }, member) => {
    const settings = object.parse(body);
    if (settings.features !== undefined && !hasGuildPermission(member, permissionFlags.Administrator)) throw denied();
    for (const field of ["afk_channel_id", "system_channel_id", "rules_channel_id", "public_updates_channel_id", "safety_alerts_channel_id"]) {
      if (isPresent(settings[field])) await checkChannel(member, settings[field], 0n);
    }
  },
  getUserInfo: async ({ userId }, member) => { await member.guild.members.fetch(id.parse(userId)); },
  setMemberRoles: async ({ userId, body }, member) => {
    await checkMemberHierarchy(member, userId);
    const target = await member.guild.members.fetch(id.parse(userId));
    const roles = z.array(id).parse(object.parse(body).roles);
    for (const roleId of new Set([...roles, ...target.roles.cache.keys()])) {
      if (roleId !== member.guild.id && roles.includes(roleId) !== target.roles.cache.has(roleId)) {
        checkRoleHierarchy(member, roleId);
      }
    }
  },
  renameMember: checkModerationTarget,
  timeoutMember: checkModerationTarget,
  removeMemberTimeout: checkModerationTarget,
  kickMember: checkModerationTarget,
  banMember: async ({ userId }, member) => checkMemberHierarchy(member, userId, true),
  createChannel: async ({ categoryId }, member) => {
    if (categoryId !== undefined) await checkChannel(member, categoryId, permissionFlags.ManageChannels);
  },
  reorderChannels: async ({ body }, member) => {
    for (const item of z.array(object).parse(body)) {
      await checkChannel(member, item.id, permissionFlags.ManageChannels | (item.lock_permissions === true ? permissionFlags.Administrator : 0n));
      if (isPresent(item.parent_id)) await checkChannel(member, item.parent_id, permissionFlags.ManageChannels);
    }
  },
  editRole: ({ roleId, body }, member) => {
    checkRoleHierarchy(member, roleId);
    checkRolePermissions(member, object.parse(body).permissions);
  },
  deleteRole: ({ roleId }, member) => checkRoleHierarchy(member, roleId),
  changeRolePosition: ({ roleId, position }, member) => checkRoleHierarchy(member, roleId, position),
  reorderRoles: ({ body }, member) => {
    for (const role of z.array(object).parse(body)) checkRoleHierarchy(member, role.id, role.position);
  },
  addRoleToMember: async ({ memberId, roleId }, member) => {
    await checkMemberHierarchy(member, memberId);
    checkRoleHierarchy(member, roleId);
  },
  removeRoleFromMember: async ({ memberId, roleId }, member) => {
    await checkMemberHierarchy(member, memberId);
    checkRoleHierarchy(member, roleId);
  },
  getInvite: async ({ code }, member) => {
    const invite = await discordClient.fetchInvite(z.string().regex(/^[\w-]+$/u).parse(code));
    if (invite.guild?.id !== member.guild.id) throw denied();
    await checkChannel(member, invite.channelId, 0n);
  },
  getSticker: async ({ stickerId }, member) => {
    const sticker = await discordClient.fetchSticker(id.parse(stickerId));
    if (sticker.guildId !== null && sticker.guildId !== member.guild.id) throw denied();
  },
  createGuildEvent: async ({ channelId }, member) => {
    if (channelId === undefined) return;
    const target = await checkChannel(member, channelId, permissionFlags.CreateEvents);
    await checkChannel(member, channelId, target.type === ChannelType.GuildStageVoice ? stageModerator : permissionFlags.Connect);
  },
};

const specificRules = {
  bulkBanMembers: guild(permissionFlags.BanMembers | permissionFlags.ManageGuild, async ({ body }, member) => {
    const users = z.array(id).parse(object.parse(body).user_ids);
    await Promise.all([...new Set(users)].map(async (userId) => checkMemberHierarchy(member, userId, true)));
  }),
  getPruneCount: guild(permissionFlags.ManageGuild | permissionFlags.KickMembers),

  renameChannel: manageChannel(),
  editChannel: manageChannel(async ({ body, channelId }, member) => {
    const settings = object.parse(body);
    if (isPresent(settings.parent_id)) await checkChannel(member, settings.parent_id, permissionFlags.ManageChannels);
    if (settings.permission_overwrites !== undefined) await checkChannel(member, channelId, permissionFlags.Administrator);
  }),
  deleteChannel: manageChannel(),
  setChannelPermission: channel(permissionFlags.ManageRoles, (input) => input.channelId, async ({ channelId, overwriteId, body }, member) => {
    const target = await checkChannel(member, channelId, permissionFlags.ManageRoles);
    const overwrite = object.parse(body);
    if (overwrite.type === 0 && overwriteId !== member.guild.id) checkRoleHierarchy(member, overwriteId);
    if (overwrite.type === 1) await checkMemberHierarchy(member, overwriteId);
    checkRolePermissions(member, overwrite.allow);
    checkRolePermissions(member, overwrite.deny);
    if (!target.isThread()) {
      const old = target.permissionOverwrites.cache.get(id.parse(overwriteId));
      checkRolePermissions(member, old?.allow.bitfield.toString());
      checkRolePermissions(member, old?.deny.bitfield.toString());
    }
  }),
  followAnnouncementChannel: channel(0n, (input) => input.channelId, async ({ body }, member) => {
    await checkChannel(member, object.parse(body).webhook_channel_id, permissionFlags.ManageWebhooks);
  }),
  createThread: channel(permissionFlags.CreatePublicThreads | permissionFlags.ReadMessageHistory),
  createForumPost: channel(permissionFlags.SendMessages | permissionFlags.EmbedLinks, (input) => input.channelId, async ({ channelId, body }, member) => {
    const tags = z.array(id).optional().parse(object.parse(body).applied_tags);
    if (tags === undefined) return;
    const target = await checkChannel(member, channelId, permissionFlags.SendMessages);
    if ((target.type === ChannelType.GuildForum || target.type === ChannelType.GuildMedia)
      && target.availableTags.some(({ id: tagId, moderated }) => moderated && tags.includes(tagId))) {
      await requireDiscordChannelPermissions(member, target, permissionFlags.ManageThreads);
    }
  }),
  getPrivateArchivedThreads: channel(permissionFlags.ReadMessageHistory | permissionFlags.ManageThreads),
  getJoinedArchivedThreads: channel(permissionFlags.ReadMessageHistory | permissionFlags.ManageThreads),
  joinThread: thread(permissionFlags.SendMessages),
  leaveThread: thread(permissionFlags.SendMessages),
  addThreadMember: channel(permissionFlags.SendMessages, (input) => input.threadId, async ({ threadId }, member) => {
    const target = await checkChannel(member, threadId, permissionFlags.SendMessages);
    if (target.type === ChannelType.PrivateThread && target.invitable !== true) {
      await requireDiscordChannelPermissions(member, target, permissionFlags.ManageThreads);
    }
  }),
  removeThreadMember: thread(permissionFlags.ManageThreads),
  getThreadMember: thread(permissionFlags.ReadMessageHistory),
  getThreadMembers: thread(permissionFlags.ReadMessageHistory),

  searchGuildMessages: {
    channel: { permission: permissionFlags.ReadMessageHistory },
    check: async ({ query }, member) => {
      const channels = z.array(id).nonempty().parse(object.parse(query).channel_id);
      await Promise.all(channels.map(async (channelId) => checkChannel(member, channelId, permissionFlags.ReadMessageHistory)));
    },
  },
  sendEmbed: channel(permissionFlags.SendMessages | permissionFlags.EmbedLinks, (input) => input.channelId, ({ userId }) => {
    if (userId !== undefined) throw denied();
  }),
  sendFile: channel(permissionFlags.SendMessages | permissionFlags.AttachFiles),
  sendRichMessage: channel(permissionFlags.SendMessages | permissionFlags.EmbedLinks | permissionFlags.AttachFiles | permissionFlags.SendTTSMessages | permissionFlags.UseExternalStickers),
  editRichMessage: channel(permissionFlags.SendMessages | permissionFlags.ManageMessages | permissionFlags.EmbedLinks | permissionFlags.AttachFiles),
  sendVoiceMessage: channel(permissionFlags.SendMessages | permissionFlags.SendVoiceMessages | permissionFlags.AttachFiles),
  forwardMessage: channel(permissionFlags.ReadMessageHistory, (input) => input.channelId, async ({ toChannelId }, member) => {
    await checkChannel(member, toChannelId, permissionFlags.SendMessages);
  }),
  crosspostMessage: channel(permissionFlags.SendMessages | permissionFlags.ManageMessages),
  editMessage: channel(permissionFlags.SendMessages | permissionFlags.ManageMessages),
  addReaction: channel(permissionFlags.AddReactions | permissionFlags.ReadMessageHistory),
  createPoll: channel(permissionFlags.SendMessages | permissionFlags.SendPolls),

  leaveVoiceChannel: botVoice(permissionFlags.Connect),
  controlVoiceAudio: botVoice(permissionFlags.Connect | permissionFlags.Speak),
  setBotVoiceMute: botVoice(permissionFlags.Connect),
  playAudio: botVoice(permissionFlags.Connect | permissionFlags.Speak),
  getBotVoiceState: botVoice(0n),
  getMemberVoiceState: memberVoice(0n),
  moveMember: memberVoice(permissionFlags.MoveMembers, async ({ channelId }, member) => { await checkChannel(member, channelId, permissionFlags.MoveMembers | permissionFlags.Connect); }),
  moveAllMembers: channel(permissionFlags.MoveMembers, (input) => input.fromChannelId, async ({ toChannelId }, member) => {
    await checkChannel(member, toChannelId, permissionFlags.MoveMembers | permissionFlags.Connect);
  }),
  disconnectMember: memberVoice(permissionFlags.MoveMembers),
  muteMember: memberVoice(permissionFlags.MuteMembers),
  unmuteMember: memberVoice(permissionFlags.MuteMembers),
  deafenMember: memberVoice(permissionFlags.DeafenMembers),
  undeafenMember: memberVoice(permissionFlags.DeafenMembers),
  startVoiceActivity: channel(permissionFlags.Connect | permissionFlags.CreateInstantInvite | permissionFlags.UseEmbeddedActivities),
  editBotStageVoiceState: channel(permissionFlags.Connect | permissionFlags.RequestToSpeak, bodyChannel),
  setStageMemberSuppressed: channel(permissionFlags.MuteMembers, bodyChannel, (input, member) => {
    if (member.guild.voiceStates.cache.get(id.parse(input.userId))?.channelId !== bodyChannel(input)) throw denied();
  }),
  setVoiceChannelStatus: channel(permissionFlags.SetVoiceChannelStatus, (input) => input.channelId, async ({ channelId }, member) => {
    if (member.voice.channelId !== channelId) await checkChannel(member, channelId, permissionFlags.ManageChannels);
  }),
  createStageInstance: channel(stageModerator, bodyChannel),
  editStageInstance: channel(stageModerator),
  deleteStageInstance: channel(stageModerator),
  sendSoundboardSound: channel(permissionFlags.Connect | permissionFlags.UseSoundboard, (input) => input.channelId, ({ body }, member) => {
    const sourceGuildId = object.parse(body).source_guild_id;
    if (sourceGuildId !== undefined && sourceGuildId !== member.guild.id) throw denied();
  }),

  deleteInvite: {
    channel: { permission: permissionFlags.ManageChannels },
    check: async ({ code }, member) => {
      const invite = await discordClient.fetchInvite(z.string().regex(/^[\w-]+$/u).parse(code));
      if (invite.guild?.id !== member.guild.id) throw denied();
      await checkChannel(member, invite.channelId, permissionFlags.ManageChannels);
    },
  },
  getWebhook: webhook(permissionFlags.ManageWebhooks),
  editWebhook: webhook(permissionFlags.ManageWebhooks, async ({ body }, member) => {
    const channelId = bodyChannel({ body });
    if (channelId !== undefined) await checkChannel(member, channelId, permissionFlags.ManageWebhooks);
  }),
  deleteWebhook: webhook(permissionFlags.ManageWebhooks),
  sendWebhookMessage: webhook(permissionFlags.ManageWebhooks | permissionFlags.SendMessages),
  getWebhookMessage: webhook(permissionFlags.ManageWebhooks | permissionFlags.ReadMessageHistory),
  editWebhookMessage: webhook(permissionFlags.ManageWebhooks | permissionFlags.SendMessages),
  deleteWebhookMessage: webhook(permissionFlags.ManageWebhooks | permissionFlags.ManageMessages),

  getGuildEvent: scheduledEvent(),
  editGuildEvent: scheduledEvent(true),
  deleteGuildEvent: scheduledEvent(true),
  getGuildEventSubscribers: scheduledEvent(),
} satisfies Partial<Record<ToolName, Rule>>;

const rules: Partial<Record<ToolName, Rule>> = { ...specificRules };
const registerTools = (groups: ToolsByPermission, makeRule: (permission: bigint) => Rule) => {
  for (const name of Object.keys(groups) as (keyof ToolsByPermission)[]) {
    const rule = makeRule(name === "Everyone" ? 0n : permissionFlags[name]);
    for (const toolName of groups[name] ?? []) rules[toolName] = { ...rule, check: additionalChecks[toolName] };
  }
};
registerTools(guildToolsByPermission, guild);
registerTools(channelToolsByPermission, channel);

const dmTools = new Set<ToolName>([
  "getChannelInfo",
  "getMessage",
  "getChannelMessages",
  "getPinnedMessages",
  "getReactions",
  "getReactionUsers",
  "getPollVoters",
]);

const filterChannelResults = (name: ToolName, result: unknown, member: GuildMember): unknown => {
  const visible = (channelId: unknown, permission = 0n) => {
    if (typeof channelId !== "string") return false;
    const target = member.guild.channels.cache.get(channelId);
    return target !== undefined && getDiscordChannelPermissions(member, target).has(permissionFlags.ViewChannel | permission);
  };
  if (name === "getChannels") return z.array(object).parse(result).filter((item) => visible(item.id));
  if (name === "getGuildWebhooks") return z.array(object).parse(result).filter((item) => visible(item.channelId, permissionFlags.ManageWebhooks));
  if (name === "getGuildInvites") return z.array(object).parse(result).filter((item) => visible(object.safeParse(item.channel).data?.id, permissionFlags.ManageChannels));
  if (name === "getGuildEvents") return z.array(object).parse(result).filter((item) => item.channel_id === null || visible(item.channel_id));
  if (name === "getActiveThreads") {
    const data = z.object({ threads: z.array(object), members: z.array(object) }).parse(result);
    const threads = data.threads.filter((item) => visible(item.parent_id, item.type === ChannelType.PrivateThread ? permissionFlags.ManageThreads : 0n));
    const ids = new Set(threads.map((item) => item.id));
    return { threads, members: data.members.filter((item) => ids.has(item.id)) };
  }
  return result;
};

const tools: ToolSet = discordTools;

const parseToolArguments = (input: unknown) => {
  const args = object.parse(input);
  for (const [key, value] of Object.entries(args)) {
    if (key.endsWith("Id") && value !== undefined) id.parse(value);
  }
  return args;
};

const requireGuildToolPermission = async (args: Input, requester: GuildMember | null, rule: Rule) => {
  if (requester === null || !hasGuildPermission(requester, rule.guild ?? 0n)) throw denied();
  if (args.guildId !== undefined && args.guildId !== requester.guild.id) throw denied();
  const scope = rule.channel;
  if (scope?.resolve !== undefined) {
    const target = await targetChannel(requester, scope.resolve(args, requester));
    if (target === null) throw denied();
    await requireDiscordChannelPermissions(requester, target, permissionIn(target, scope));
  }
  await rule.check?.(args, requester);
  return requester;
};

export const validateDiscordApprovalAction = async (name: string, input: unknown, requester: GuildMember) => {
  if (!Object.hasOwn(discordTools, name) || !Object.hasOwn(rules, name)) throw denied();
  const toolName = name as ToolName;
  const rule = rules[toolName];
  if (discordReadTools.has(toolName) || rule === undefined) throw denied();

  const args = parseToolArguments(getDiscordToolInputSchema(toolName).parse(input));
  await requireGuildToolPermission(args, requester, rule);
  return args;
};

export const executeApprovedDiscordAction = async (
  name: string,
  input: unknown,
  requester: GuildMember,
  toolCallId: string,
) => {
  const args = await validateDiscordApprovalAction(name, input, requester);
  const execute = tools[name]?.execute as ToolExecuteFunction<Input, unknown, undefined> | undefined;
  if (execute === undefined) throw new Error(`Discord tool ${name} cannot be executed`);
  await execute(args, { toolCallId, messages: [], context: undefined });
};

export const getDiscordToolsForMessage = (
  message: Message,
  resolveAttachment: (attachmentRef: string) => { attachment: Buffer; name: string },
) => {
  const isDm = message.guildId === null;
  const member = message.member;
  const visibleChannels = member?.guild.channels.cache.map((target) => ({
    target,
    permissions: getDiscordChannelPermissions(member, target),
  })).filter(({ permissions }) => permissions.has(permissionFlags.ViewChannel)) ?? [];

  const wrap = (name: ToolName, rule: Rule): ToolSet[string] => {
    const definition = tools[name]!;
    const execute = definition.execute!;
    const isReply = name === "sendMessage" || name === "sendReply";
    return {
      ...definition,
      contextSchema: isReply ? undefined : definition.contextSchema,
      execute: async (input, options) => {
        const args = parseToolArguments(input);
        const toolOptions = isReply ? { ...options, context: { resolveAttachment } } : options;
        if (name === "sendReply" && (args.channelId !== message.channelId || args.messageId !== message.id)) throw denied();
        if (name === "sendMessage" && (args.attachmentRef !== undefined || args.attachmentRefs !== undefined) && args.channelId !== message.channelId) throw denied();
        const isConversationReply = isReply && args.channelId === message.channelId;
        if (isDm || isConversationReply) {
          if (args.channelId !== message.channelId || args.userId !== undefined) throw denied();
          const result: unknown = await execute(input, toolOptions);
          return result;
        }

        const requester = await requireGuildToolPermission(args, message.member, rule);
        const result: unknown = await execute(input, toolOptions);
        return filterChannelResults(name, result, requester);
      },
    };
  };

  const available: Partial<Record<ToolName, ToolSet[string]>> = {};
  const approvalToolNames: ToolName[] = [];
  for (const [name, rule] of Object.entries(rules) as [ToolName, Rule][]) {
    if (isDm) {
      if (!dmTools.has(name)) continue;
    }
    else {
      if (member === null || !hasGuildPermission(member, rule.guild ?? 0n)) continue;
      const scope = rule.channel;
      if (scope !== undefined && !visibleChannels.some(({ target, permissions }) => permissions.has(permissionIn(target, scope)))) continue;
    }
    if (!discordReadTools.has(name)) {
      if (!isDm) approvalToolNames.push(name);
      continue;
    }
    available[name] = wrap(name, rule);
  }

  return {
    tools: {
      ...available,
      sendMessage: wrap("sendMessage", channel(permissionFlags.SendMessages)),
      sendReply: wrap("sendReply", {}),
    },
    approvalToolNames,
  };
};
