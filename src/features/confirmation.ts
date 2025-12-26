import { createConfirmationId, addPendingConfirmation } from "../events/interaction-create";
import { env } from "../utils/env";
import { discord } from "#/discord";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type Message } from "discord.js";
import OpenAI from "openai";

const mistral = new OpenAI({
  apiKey: env.MISTRAL_API_KEY,
  baseURL: env.MISTRAL_BASE_URL,
});

const DESTRUCTIVE_ACTIONS = [
  "deleteChannel",
  "deleteRole",
  "kickMember",
  "banMember",
  "renameGuild",
];

export const requiresConfirmation = (toolName: string): boolean => {
  return DESTRUCTIVE_ACTIONS.includes(toolName);
};

export const sendConfirmationRequest = async (
  message: Message,
  actions: { toolName: string; args: any }[],
  allArgs: any,
  requesterId: string,
): Promise<string> => {
  const confirmationId = createConfirmationId();

  const actionsDescription = actions.map(({ toolName, args }) => {
    const details = Object.entries(args)
      .filter(([k]) => k !== "guildId")
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return `${toolName}(${details})`;
  }).join("\n");

  const aiSummary = await mistral.chat.completions.create({
    model: "mistral-small-latest",
    messages: [
      {
        role: "user",
        content: `Résume ces actions Discord en une phrase claire et concise en français (max 100 caractères):\n${actionsDescription}`,
      },
    ],
  });

  const summary = aiSummary.choices?.[0]?.message?.content || "Actions destructives";

  const actionsList = actions.map(({ toolName, args }) => {
    let detail = "";
    if (args.channelId) {
      const channel = discord.client.channels.cache.get(args.channelId);
      detail = channel && "name" in channel ? ` (${channel.name})` : "";
    }
    else if (args.memberId) {
      detail = ` (ID: ${args.memberId})`;
    }
    else if (args.roleId) {
      detail = ` (ID: ${args.roleId})`;
    }
    return `• \`${toolName}\`${detail}`;
  }).join("\n");

  const chunkedActions = actionsList.length > 1024
    ? `${actionsList.substring(0, 1021)}...`
    : actionsList;

  const embed = new EmbedBuilder()
    .setColor(0xFF6B6B)
    .setTitle("⚠️ Confirmation requise")
    .setDescription(`**${summary}**\n\n${actions.length} action(s) irréversible(s)`)
    .addFields(
      { name: "Actions", value: chunkedActions, inline: false },
      { name: "Timeout", value: "60 secondes", inline: true },
    )
    .setFooter({ text: "⚠️ Ces actions sont irréversibles" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:${confirmationId}`)
        .setLabel("✅ Confirmer")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel:${confirmationId}`)
        .setLabel("❌ Annuler")
        .setStyle(ButtonStyle.Secondary),
    );

  await message.reply({
    embeds: [embed],
    components: [row],
  });

  addPendingConfirmation(confirmationId, actions, allArgs, requesterId);

  return "CONFIRMATION_PENDING";
};
