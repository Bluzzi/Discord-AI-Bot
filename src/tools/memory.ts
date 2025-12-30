import type { ToolSet } from "ai";
import { postgres } from "#/postgres/client";
import {
  tableDiscordGuildMemory,
  tableDiscordUserMemory,
  tableDiscordChannelMemory,
} from "#/postgres/schema";
import { tool } from "ai";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

export const memoryTools: ToolSet = {
  createGuildMemory: tool({
    description: "Enregistre une information de mémoire liée à un serveur (guild). L'IA DOIT utiliser cette mémoire pour stocker des informations contextuelles ou persistantes à propos d'un serveur. Utiliser cet outil si un utilisateur demande l'enregistrement d'une information concernant le serveur OU si une information concernant le serveur est partagé.",
    inputSchema: z.object({
      guildId: z.string().describe("ID du serveur Discord"),
      memoryText: z.string().describe("Texte à enregistrer dans la mémoire du serveur, le texte doit être AI-friendly et plutôt concis"),
    }),
    outputSchema: z.object({
      id: z.string().describe("ID de l'enregistrement inséré"),
      guildId: z.string().describe("ID du serveur"),
      memoryText: z.string().describe("Texte enregistré"),
      createdAt: z.string().describe("Date de création"),
    }),
    execute: async ({ guildId, memoryText }) => {
      const rows = await postgres
        .insert(tableDiscordGuildMemory)
        .values({ guildId, memoryText })
        .returning();

      const row = rows[0];
      if (!row) throw new Error("Insert failed");

      return {
        id: row.id,
        guildId: row.guildId,
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      };
    },
  }),

  getGuildMemory: tool({
    description: "Récupère les entrées de mémoire pour un serveur. L'IA doit lire ces entrées pour retrouver le contexte pertinent lié au serveur.",
    inputSchema: z.object({
      guildId: z.string().describe("ID du serveur Discord"),
      limit: z.number().min(1).max(100).optional().describe("Nombre maximum d'entrées à retourner"),
    }),
    outputSchema: z.object({
      guildId: z.string().describe("ID du serveur"),
      memories: z.array(z.object({
        id: z.string().describe("ID de l'enregistrement"),
        memoryText: z.string().describe("Texte enregistré"),
        createdAt: z.string().describe("Date de création"),
      })),
      total: z.number().describe("Nombre d'entrées retournées"),
    }),
    execute: async ({ guildId, limit = 50 }) => {
      const rows = await postgres
        .select()
        .from(tableDiscordGuildMemory)
        .where(eq(tableDiscordGuildMemory.guildId, guildId))
        .orderBy(desc(tableDiscordGuildMemory.createdAt))
        .limit(limit);

      const memories = rows.map((row) => ({
        id: row.id,
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      }));

      return { guildId, memories, total: memories.length };
    },
  }),

  createUserMemory: tool({
    description: "Enregistre une information de mémoire liée à un utilisateur. L'IA DOIT utiliser cette mémoire pour stocker des informations personnelles ou préférences liées à un utilisateur. Utiliser cet outil si un utilisateur demande l'enregistrement d'une information concernant un utilisateur OU si une information concernant un utilisateur est partagé.",
    inputSchema: z.object({
      userId: z.string().describe("ID de l'utilisateur Discord"),
      memoryText: z.string().describe("Texte à enregistrer dans la mémoire utilisateur, le texte doit être AI-friendly et plutôt concis"),
    }),
    outputSchema: z.object({
      id: z.string().describe("ID de l'enregistrement inséré"),
      userId: z.string().describe("ID de l'utilisateur"),
      memoryText: z.string().describe("Texte enregistré"),
      createdAt: z.string().describe("Date de création"),
    }),
    execute: async ({ userId, memoryText }) => {
      const rows = await postgres
        .insert(tableDiscordUserMemory)
        .values({ userId, memoryText })
        .returning();

      const row = rows[0];
      if (!row) throw new Error("Insert failed");

      return {
        id: row.id,
        userId: row.userId,
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      };
    },
  }),

  getUserMemory: tool({
    description: "Récupère les entrées de mémoire pour un utilisateur. L'IA doit lire ces entrées pour retrouver les préférences et le contexte utilisateur.",
    inputSchema: z.object({
      userId: z.string().describe("ID de l'utilisateur Discord"),
      limit: z.number().min(1).max(100).optional().describe("Nombre maximum d'entrées à retourner"),
    }),
    outputSchema: z.object({
      userId: z.string().describe("ID de l'utilisateur"),
      memories: z.array(z.object({
        id: z.string().describe("ID de l'enregistrement"),
        memoryText: z.string().describe("Texte enregistré"),
        createdAt: z.string().describe("Date de création"),
      })),
      total: z.number().describe("Nombre d'entrées retournées"),
    }),
    execute: async ({ userId, limit = 50 }) => {
      const rows = await postgres
        .select()
        .from(tableDiscordUserMemory)
        .where(eq(tableDiscordUserMemory.userId, userId))
        .orderBy(desc(tableDiscordUserMemory.createdAt))
        .limit(limit);

      const memories = rows.map((row) => ({
        id: row.id,
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      }));

      return { userId, memories, total: memories.length };
    },
  }),

  createChannelMemory: tool({
    description: "Enregistre une information de mémoire liée à un channel. L'IA DOIT utiliser cette mémoire pour stocker des informations contextuelles liées à un channel spécifique. Utiliser cet outil si un utilisateur demande l'enregistrement d'une information concernant un channel OU si une information concernant un channel est partagé.",
    inputSchema: z.object({
      channelId: z.string().describe("ID du channel Discord"),
      memoryText: z.string().describe("Texte à enregistrer dans la mémoire du channel, le texte doit être AI-friendly et plutôt concis"),
    }),
    outputSchema: z.object({
      id: z.string().describe("ID de l'enregistrement inséré"),
      channelId: z.string().describe("ID du channel"),
      memoryText: z.string().describe("Texte enregistré"),
      createdAt: z.string().describe("Date de création"),
    }),
    execute: async ({ channelId, memoryText }) => {
      const rows = await postgres
        .insert(tableDiscordChannelMemory)
        .values({ channelId, memoryText })
        .returning();

      const row = rows[0];
      if (!row) throw new Error("Insert failed");

      return {
        id: row.id,
        channelId: row.channelId,
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      };
    },
  }),

  getChannelMemory: tool({
    description: "Récupère les entrées de mémoire pour un channel. L'IA doit lire ces entrées pour retrouver le contexte lié au channel.",
    inputSchema: z.object({
      channelId: z.string().describe("ID du channel Discord"),
      limit: z.number().min(1).max(100).optional().describe("Nombre maximum d'entrées à retourner"),
    }),
    outputSchema: z.object({
      channelId: z.string().describe("ID du channel"),
      memories: z.array(z.object({
        id: z.string().describe("ID de l'enregistrement"),
        memoryText: z.string().describe("Texte enregistré"),
        createdAt: z.string().describe("Date de création"),
      })),
      total: z.number().describe("Nombre d'entrées retournées"),
    }),
    execute: async ({ channelId, limit = 50 }) => {
      const rows = await postgres
        .select()
        .from(tableDiscordChannelMemory)
        .where(eq(tableDiscordChannelMemory.channelId, channelId))
        .orderBy(desc(tableDiscordChannelMemory.createdAt))
        .limit(limit);

      const memories = rows.map((row) => ({
        id: row.id,
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      }));

      return { channelId, memories, total: memories.length };
    },
  }),
};
