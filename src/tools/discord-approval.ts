import type { DiscordToolName } from "#/tools/discord";
import type { ToolSet } from "ai";
import { discordReadTools, discordTools, getDiscordToolInputSchema } from "#/tools/discord";
import dedent from "dedent";
import { z } from "zod";

export type DiscordApprovalAction = { toolName: DiscordToolName; input: Record<string, unknown> };
export type RequestApproval = (actions: DiscordApprovalAction[], summary: string) => Promise<{ status: "waiting_approval"; approvalMessageUrl: string }>;

export const discordApprovalTools = {
  proposeDiscordActions: {
    description: "Ask the requesting member to approve Discord actions, including creations, updates and deletions. Submit all intended changes in execution order. Returns immediately with an approval message URL. The actions are still pending.",
    inputSchema: (() => {
      // Derive the approval schema from the registered mutation tools:
      const [first, ...rest] = (Object.keys(discordTools) as DiscordToolName[]).filter((name) => !discordReadTools.has(name)).map((name) => {
        const description = discordTools[name].description;
        return z.object({
          toolName: z.literal(name),
          input: getDiscordToolInputSchema(name).describe(typeof description === "string" ? description : name),
        });
      });
      if (first === undefined) throw new Error("No Discord actions available for approval");

      return z.object({
        actions: z.array(z.discriminatedUnion("toolName", [first, ...rest])).min(1).max(10),
        summary: z.string().trim().min(1).max(1000).describe(dedent`
          Résume en français, en un seul paragraphe de texte simple, ce que les actions vont changer et sur quelles cibles. Regroupe les actions identiques en citant leurs cibles dans la phrase.
          Identifie les cibles d’après les paramètres de chaque action et le contexte. Avec les identifiants exacts, utilise <@USER_ID> pour un utilisateur ou un membre, <#CHANNEL_ID> pour un salon textuel, vocal ou un fil, et <@&ROLE_ID> pour un rôle. Pour un message, utilise son lien Discord si tu peux le former avec les identifiants exacts du serveur, du salon et du message.
          Quand la cible ne se prête pas à une mention ou à un lien, comme un serveur, une invitation, un webhook, un sticker, un événement ou une règle AutoMod, indique son nom, son code ou son identifiant connu. Précise les paramètres qui changent l’effet de l’action, comme une destination, une durée, une permission, une quantité ou une nouvelle valeur.
          Décris uniquement les actions prévues. Omet le statut de la demande, la procédure d’approbation et les boutons, qui figurent déjà dans l’embed.
          Utilise uniquement des références et des détails connus. Présente les liens utiles sous la forme [libellé](https://example.com).

          Discord also supports native message syntax:
          - User mentions (<@USER_ID>), channel or thread links (<#CHANNEL_ID>), and role mentions (<@&ROLE_ID>).
          - Custom emoji (<:name:EMOJI_ID>) and animated custom emoji (<a:name:EMOJI_ID>).
          - Slash command links (</command:COMMAND_ID>, </command subcommand:COMMAND_ID>, or </command group subcommand:COMMAND_ID>).
          - Localized timestamps (<t:UNIX_SECONDS:f>) and relative timestamps (<t:UNIX_SECONDS:R>).
        `),
      });
    })(),
    execute: async ({ actions, summary }: { actions: DiscordApprovalAction[]; summary: string }, { context }: { context: { requestApproval: RequestApproval } }) => context.requestApproval(actions, summary.replace(/\s*[\r\n]+\s*/gu, " ")),
  },
} satisfies ToolSet;
