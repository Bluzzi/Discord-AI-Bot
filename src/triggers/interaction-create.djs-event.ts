import type { DiscordApprovalAction } from "#/tools/discord-approval";
import type { GuildMember, SendableChannels } from "discord.js";
import { executeApprovedDiscordAction, validateDiscordApprovalAction } from "#/integrations/discord.helper-permissions";
import { postgres } from "#/integrations/postgres.client";
import { tableWaitingApproval } from "#/tables/waiting-approval.table";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import dedent from "dedent";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { and, eq, lt } from "drizzle-orm";

const applyButtonId = "discord-approval:apply";
const cancelButtonId = "discord-approval:cancel";
const approvalLifetimeMs = 15 * 60_000;

export const requestDiscordApproval = async (
  channel: SendableChannels,
  requester: GuildMember,
  proposedActions: DiscordApprovalAction[],
  summary: string,
) => {
  // Validate all proposed actions before presenting them:
  const actions = await Promise.all(proposedActions.map(async ({ toolName, input }) => ({
    toolName,
    input: await validateDiscordApprovalAction(toolName, input, requester),
  })));
  // Build the approval message with the exact action parameters:
  const now = new Date();
  const expiresAt = new Date(now.getTime() + approvalLifetimeMs);
  const overview = dedent`
    - 👤 Demande de <@${requester.id}>, en attente de son approbation
    - ⏳ Expire <t:${Math.floor(expiresAt.getTime() / 1000)}:R>

    ${summary}
  `;
  const parameters = JSON.stringify(actions, null, 2);
  const inlineDescription = `${overview}\n\n\`\`\`json\n${parameters.replaceAll("`", "\\u0060")}\n\`\`\``;
  const inline = inlineDescription.length <= 4096;
  const embed = new EmbedBuilder()
    .setTitle("Actions Discord")
    .setDescription(inline ? inlineDescription : `${overview}\n\nLe détail des actions figure dans le fichier joint, dans l’ordre d’exécution.`);
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(cancelButtonId).setLabel("Annuler").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(applyButtonId).setLabel("Approuver").setStyle(ButtonStyle.Success),
  );

  // Remove expired requests and send the new approval message:
  await postgres.delete(tableWaitingApproval).where(lt(tableWaitingApproval.expiresAt, now));
  const message = await channel.send({
    embeds: [embed],
    components: [buttons],
    files: inline ? [] : [{ attachment: Buffer.from(parameters), name: "parametres-des-actions.json" }],
    allowedMentions: { parse: [] },
  });

  // Save the request or remove the message if it cannot be approved:
  try {
    await postgres.insert(tableWaitingApproval).values({
      requesterMember: requester.id,
      validatingMessageId: message.id,
      channelId: channel.id,
      actions,
      expiresAt,
    });
  }
  catch (error) {
    try {
      await message.delete();
    }
    catch {
      logger.warn(`Could not delete Discord approval message ${message.id}`);
    }
    throw new Error("Could not save the Discord approval request", { cause: error });
  }

  return { status: "waiting_approval" as const, approvalMessageUrl: message.url };
};

trigger.discordEvent({
  eventName: "interactionCreate",
  handler: async (interaction) => {
  // Accept approval buttons in a server:
    if (!interaction.isButton() || (interaction.customId !== applyButtonId && interaction.customId !== cancelButtonId)) return;
    const { guild, message, user } = interaction;
    if (guild === null) return;

    // Claim the request once and only for its author:
    await interaction.deferUpdate();
    const [approval] = await postgres.delete(tableWaitingApproval).where(and(
      eq(tableWaitingApproval.validatingMessageId, message.id),
      eq(tableWaitingApproval.channelId, message.channelId),
      eq(tableWaitingApproval.requesterMember, user.id),
    )).returning();
    if (approval === undefined) {
      await interaction.followUp({ content: "Cette demande est indisponible ou vous n’en êtes pas l’auteur.", flags: MessageFlags.Ephemeral });
      return;
    }

    // Reject edited, expired or cancelled plans:
    const approvalMessage = await message.fetch();
    if (approvalMessage.editedTimestamp !== null) {
      await approvalMessage.edit({
        embeds: [new EmbedBuilder().setTitle("Actions Discord").setDescription("Le message d’approbation a été modifié.").setFooter({ text: "Demande annulée" })],
        components: [],
      });
      return;
    }
    const embed = new EmbedBuilder(approvalMessage.embeds[0]?.toJSON()).setTitle("Actions Discord").setFields();
    const description = embed.data.description;
    if (description !== undefined) {
      embed.setDescription(description.replace(/^(- 👤 Demande de <@\d+>), en attente de son approbation\n- ⏳ Expire <t:\d+:R>/u, "$1"));
    }
    if (approval.expiresAt.getTime() <= Date.now()) {
      await approvalMessage.edit({ embeds: [embed.setFooter({ text: "Demande expirée" })], components: [] });
      return;
    }
    if (interaction.customId === cancelButtonId) {
      await approvalMessage.edit({ embeds: [embed.setFooter({ text: "Demande annulée" })], components: [] });
      return;
    }

    // Reload the requester and recheck permissions as each action runs:
    let member: GuildMember;
    try {
      member = await guild.members.fetch({ user: user.id, force: true });
    }
    catch (error) {
      await approvalMessage.edit({ embeds: [embed.setFooter({ text: "Plan interrompu · Impossible de vérifier le membre demandeur." })], components: [] });
      throw error;
    }
    let completed = 0;
    for (const { toolName, input } of approval.actions) {
      try {
        await executeApprovedDiscordAction(toolName, input, member, `${approval.id}-${String(completed)}`);
      }
      catch (error) {
        const text = `Plan interrompu · ${String(completed)}/${String(approval.actions.length)} actions exécutées. Arrêt sur ${toolName}.`;
        await approvalMessage.edit({ embeds: [embed.setFooter({ text })], components: [] });
        throw error;
      }
      completed += 1;
    }

    await approvalMessage.edit({ embeds: [embed.setFooter({ text: "Demande validée" })], components: [] });
  },
});
