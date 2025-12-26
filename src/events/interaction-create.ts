import type { Interaction } from "discord.js";
import { botDiscord } from "../utils/discord";
import { executeToolCall } from "../tools/discord";
import { logger } from "../utils/logger";

const pendingConfirmations = new Map<string, {
  actions: Array<{ toolName: string; args: any }>;
  args: any;
  requesterId: string;
  expiresAt: number;
}>();

export function setupInteractionHandler() {
  botDiscord.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (!interaction.isButton()) return;

      const [action, confirmationId] = interaction.customId.split(":");
    
      if (!action || !confirmationId) return;
      if (action !== "confirm" && action !== "cancel") return;

      const confirmation = pendingConfirmations.get(confirmationId);
      
      if (!confirmation) {
        await interaction.reply({
          content: "Cette confirmation a expiré ou n'existe plus.",
          ephemeral: true,
        });
        return;
      }

      if (interaction.user.id !== confirmation.requesterId) {
        await interaction.reply({
          content: "Seul l'utilisateur qui a demandé cette action peut la confirmer.",
          ephemeral: true,
        });
        return;
      }

      if (Date.now() > confirmation.expiresAt) {
        pendingConfirmations.delete(confirmationId);
        await interaction.reply({
          content: "Cette confirmation a expiré (timeout de 60 secondes).",
          ephemeral: true,
        });
        return;
      }

      if (action === "cancel") {
        pendingConfirmations.delete(confirmationId);
        await interaction.update({
          content: "❌ Action annulée.",
          embeds: [],
          components: [],
        });
        return;
      }

      await interaction.update({
        content: "⏳ Exécution en cours...",
        embeds: [],
        components: [],
      });

      try {
        const results: string[] = [];
        let hasError = false;
        
        for (const action of confirmation.actions) {
          const result = await executeToolCall(
            action.toolName,
            { ...action.args, guildId: confirmation.args.guildId },
            confirmation.requesterId
          );
          
          if (result?.error) {
            hasError = true;
            results.push(`${action.toolName}: ${String(result.error)}`);
          }
        }
        
        pendingConfirmations.delete(confirmationId);
        
        if (hasError) {
          await interaction.editReply({
            content: `❌ Certaines actions ont échoué:\n${results.join('\n')}`,
          });
        } else {
          await interaction.editReply({
            content: `✅ Toutes les actions ont été effectuées avec succès`,
          });
        }
      } catch (error) {
        logger.error("Error executing confirmed action:", error instanceof Error ? error.stack : String(error));
        await interaction.editReply({
          content: `❌ Erreur lors de l'exécution: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    } catch (error) {
      logger.error("Error in interaction handler:", error instanceof Error ? error.message : String(error));
      if (interaction.isButton() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Une erreur s'est produite lors du traitement de votre interaction.",
          ephemeral: true,
        }).catch(() => {});
      }
    }
  });
}

export function createConfirmationId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function addPendingConfirmation(
  confirmationId: string,
  actions: Array<{ toolName: string; args: any }>,
  args: any,
  requesterId: string
) {
  pendingConfirmations.set(confirmationId, {
    actions,
    args,
    requesterId,
    expiresAt: Date.now() + 60000,
  });

  setTimeout(() => {
    pendingConfirmations.delete(confirmationId);
  }, 60000);
}
