import type { DiscordApprovalAction } from "#/tools/discord-approval";
import type { GuildMember, SendableChannels } from "discord.js";
import { tableWaitingApproval } from "#/tables/waiting-approval";
import { discordTools } from "#/tools/discord";
import { executeApprovedDiscordAction, validateDiscordApprovalAction } from "#/tools/discord-permissions";
import { attempt } from "#/utils/attempt";
import { logger } from "#/utils/logger";
import { postgres } from "#/utils/postgres";
import { trigger } from "#/utils/trigger";
import dedent from "dedent";
import { EmbedBuilder } from "discord.js";
import { and, eq, lt } from "drizzle-orm";

const approvalEmoji = "✅";
const approvalLifetimeMs = 15 * 60_000;

export const requestDiscordApproval = async (
  channel: SendableChannels,
  requester: GuildMember,
  proposedActions: DiscordApprovalAction[],
) => {
  const actions = await Promise.all(proposedActions.map(async ({ toolName, input }) => ({
    toolName,
    input: await validateDiscordApprovalAction(toolName, input, requester),
  })));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + approvalLifetimeMs);
  const actionDescriptions = actions.map(({ toolName }, index) => {
    const description = discordTools[toolName].description;
    return `${String(index + 1)}. ${typeof description === "string" ? description : toolName}`;
  });
  const overview = dedent`
    Demande de <@${requester.id}> · Expire <t:${Math.floor(expiresAt.getTime() / 1000)}:R>

    ${actionDescriptions.join("\n")}
  `;
  const parameters = JSON.stringify(actions.map(({ input }) => input), null, 2);
  const inlineDescription = `${overview}\n\n\`\`\`json\n${parameters.replaceAll("`", "\\u0060")}\n\`\`\``;
  const inline = inlineDescription.length <= 4096;
  const embed = new EmbedBuilder()
    .setTitle("Actions Discord à approuver")
    .setDescription(inline ? inlineDescription : `${overview}\n\nLes paramètres complets sont dans le fichier joint, dans le même ordre.`)
    .setFooter({ text: `Auteur de la demande, ajoute ${approvalEmoji} pour approuver toutes les actions.` });

  await postgres.delete(tableWaitingApproval).where(lt(tableWaitingApproval.expiresAt, now));
  const message = await channel.send({
    embeds: [embed],
    files: inline ? [] : [{ attachment: Buffer.from(parameters), name: "parametres-des-actions.json" }],
    allowedMentions: { parse: [] },
  });

  const saved = await attempt(() => postgres.insert(tableWaitingApproval).values({
    requesterMember: requester.id,
    validatingMessageId: message.id,
    channelId: channel.id,
    actions,
    expiresAt,
  }));
  if (!saved.ok) {
    const removed = await attempt(async () => message.delete());
    if (!removed.ok) logger.warn(`Could not delete Discord approval message ${message.id}`);
    throw new Error("Could not save the Discord approval request", { cause: saved.error });
  }

  const seeded = await attempt(async () => message.react(approvalEmoji));
  if (!seeded.ok) logger.warn(`Could not seed approval reaction on Discord message ${message.id}`);
  return { status: "waiting_approval" as const, approvalMessageUrl: message.url };
};

trigger.discordEvent("messageReactionAdd", async (reaction, user) => {
  if (user.bot || reaction.emoji.id !== null || reaction.emoji.name !== approvalEmoji) return;
  const message = reaction.message;
  const guild = message.guild;
  if (guild === null) return;

  const [approval] = await postgres.delete(tableWaitingApproval).where(and(
    eq(tableWaitingApproval.validatingMessageId, message.id),
    eq(tableWaitingApproval.channelId, message.channelId),
    eq(tableWaitingApproval.requesterMember, user.id),
  )).returning();
  if (approval === undefined) return;

  const approvalMessage = await message.fetch();
  if (approvalMessage.editedTimestamp !== null) {
    await approvalMessage.edit({
      embeds: [new EmbedBuilder().setTitle("Demande annulée").setDescription("Le message d’approbation a été modifié.")],
    });
    return;
  }
  const embed = new EmbedBuilder(approvalMessage.embeds[0]?.toJSON());
  if (approval.expiresAt.getTime() <= Date.now()) {
    await approvalMessage.edit({ embeds: [embed.setTitle("Demande expirée").setFooter(null)] });
    return;
  }

  const member = await attempt(async () => guild.members.fetch({ user: user.id, force: true }));
  if (!member.ok) {
    await approvalMessage.edit({ embeds: [embed.setTitle("Plan interrompu").setFooter({ text: "Impossible de vérifier le membre demandeur." })] });
    return;
  }
  let completed = 0;
  for (const { toolName, input } of approval.actions) {
    const result = await attempt(async () => executeApprovedDiscordAction(toolName, input, member.value, `${approval.id}-${String(completed)}`));
    if (!result.ok) {
      logger.warn(`Discord approval ${approval.id} stopped at ${toolName}`);
      const text = `${String(completed)}/${String(approval.actions.length)} actions exécutées. Arrêt sur ${toolName}.`;
      await approvalMessage.edit({ embeds: [embed.setTitle("Plan interrompu").setFooter({ text })] });
      return;
    }
    completed += 1;
  }

  await approvalMessage.edit({ embeds: [embed.setTitle("✅ Plan exécuté").setFooter({ text: `${String(completed)} action(s) exécutée(s).` })] });
});
