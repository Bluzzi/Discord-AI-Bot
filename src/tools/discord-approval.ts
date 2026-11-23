import type { DiscordToolName } from "#/tools/discord";
import { discordNativeMessageSyntax, discordTools, getDiscordToolInputSchema } from "#/tools/discord";
import { tool } from "ai";
import dedent from "dedent";
import { z } from "zod";

export type DiscordApprovalAction = { toolName: DiscordToolName; input: Record<string, unknown> };

export const createDiscordApprovalTool = (
  names: DiscordToolName[],
  requestApproval: (actions: DiscordApprovalAction[], summary: string) => Promise<{ status: "waiting_approval"; approvalMessageUrl: string }>,
) => {
  const [first, ...rest] = names.map((name) => {
    const description = discordTools[name].description;
    return z.object({
      toolName: z.literal(name),
      input: getDiscordToolInputSchema(name).describe(typeof description === "string" ? description : name),
    });
  });
  if (first === undefined) throw new Error("No Discord actions available for approval");

  return tool({
    description: "Ask the requesting member to approve Discord actions, including creations, updates and deletions. Submit all intended changes in execution order. Returns immediately with an approval message URL. The actions are still pending.",
    inputSchema: z.object({
      actions: z.array(z.discriminatedUnion("toolName", [first, ...rest])).min(1).max(10),
      summary: z.string().trim().min(1).max(1000).describe(dedent`
        Résume en français, en un seul paragraphe de texte simple, ce que les actions vont changer et sur quelles cibles. Regroupe les actions identiques en citant leurs cibles dans la phrase.
        Identifie les cibles d’après les paramètres de chaque action et le contexte. Avec les identifiants exacts, utilise <@USER_ID> pour un utilisateur ou un membre, <#CHANNEL_ID> pour un salon textuel, vocal ou un fil, et <@&ROLE_ID> pour un rôle. Pour un message, utilise son lien Discord si tu peux le former avec les identifiants exacts du serveur, du salon et du message.
        Quand la cible ne se prête pas à une mention ou à un lien, comme un serveur, une invitation, un webhook, un sticker, un événement ou une règle AutoMod, indique son nom, son code ou son identifiant connu. Précise les paramètres qui changent l’effet de l’action, comme une destination, une durée, une permission, une quantité ou une nouvelle valeur.
        Décris uniquement les actions prévues. Omet le statut de la demande, la procédure d’approbation et les boutons, qui figurent déjà dans l’embed.
        Utilise uniquement des références et des détails connus. Présente les liens utiles sous la forme [libellé](https://example.com).

        ${discordNativeMessageSyntax}
      `),
    }),
    execute: async ({ actions, summary }) => requestApproval(actions, summary.replace(/\s*[\r\n]+\s*/gu, " ")),
  });
};
