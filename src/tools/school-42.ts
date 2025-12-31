import type { ToolSet } from "ai";
import { env } from "#/utils/env";
import { tool } from "ai";
import { z } from "zod";

let accessToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  if (!env.FORTYTWO_CLIENT_ID || !env.FORTYTWO_CLIENT_SECRET) {
    throw new Error("42 API credentials not configured");
  }

  const response = await fetch("https://api.intra.42.fr/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: env.FORTYTWO_CLIENT_ID,
      client_secret: env.FORTYTWO_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get 42 API token: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    access_token: string;
    expires_in: number;
  };

  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

  return accessToken;
}

export const fortyTwoTools: ToolSet = {
  getUserInfo: tool({
    description: "Récupère toutes les informations d'un utilisateur 42 (profil, projets, niveau, campus, cursus, achievements, etc.). Utilise ce tool quand quelqu'un demande des infos sur un étudiant 42.",
    inputSchema: z.object({
      login: z.string().describe("Le login 42 de l'utilisateur (ex: 'jdoe', 'mhaugira')"),
    }),
    outputSchema: z.object({
      id: z.number().describe("ID de l'utilisateur"),
      login: z.string().describe("Login de l'utilisateur"),
      email: z.string().describe("Email de l'utilisateur"),
      firstName: z.string().describe("Prénom"),
      lastName: z.string().describe("Nom de famille"),
      usualFullName: z.string().optional().describe("Nom usuel complet"),
      displayname: z.string().describe("Nom d'affichage"),
      imageUrl: z.string().optional().describe("URL de l'image de profil"),
      staff: z.boolean().describe("Est-ce un membre du staff"),
      correctionPoint: z.number().describe("Points de correction"),
      poolMonth: z.string().optional().describe("Mois de la piscine"),
      poolYear: z.string().optional().describe("Année de la piscine"),
      location: z.string().optional().describe("Localisation actuelle"),
      wallet: z.number().describe("Wallet (points)"),
      alumni: z.boolean().describe("Est-ce un alumni"),
      active: z.boolean().describe("Est-ce actif"),
      campus: z.array(z.object({
        id: z.number().describe("ID du campus"),
        name: z.string().describe("Nom du campus"),
        timeZone: z.string().describe("Fuseau horaire"),
      })).describe("Liste des campus"),
      cursusUsers: z.array(z.object({
        id: z.number().describe("ID du cursus_user"),
        grade: z.string().optional().describe("Grade"),
        level: z.number().describe("Niveau"),
        cursusId: z.number().describe("ID du cursus"),
        cursusName: z.string().describe("Nom du cursus"),
        skills: z.array(z.object({
          name: z.string().describe("Nom de la compétence"),
          level: z.number().describe("Niveau de la compétence"),
        })).describe("Compétences"),
      })).describe("Cursus de l'utilisateur"),
      projectsUsers: z.array(z.object({
        id: z.number().describe("ID du projet_user"),
        finalMark: z.number().optional().describe("Note finale"),
        status: z.string().describe("Statut du projet"),
        validated: z.boolean().optional().describe("Validé ou non"),
        projectName: z.string().describe("Nom du projet"),
        projectSlug: z.string().describe("Slug du projet"),
      })).describe("TOUS les projets de l'utilisateur"),
      achievements: z.array(z.object({
        id: z.number().describe("ID de l'achievement"),
        name: z.string().describe("Nom de l'achievement"),
        description: z.string().describe("Description"),
        tier: z.string().describe("Tier"),
        kind: z.string().describe("Type"),
      })).describe("TOUS les achievements de l'utilisateur"),
    }),
    execute: async ({ login }) => {
      const token = await getAccessToken();

      const response = await fetch(`https://api.intra.42.fr/v2/users/${login}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Utilisateur '${login}' introuvable sur l'intra 42`);
        }
        throw new Error(`42 API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        "id": number;
        "login": string;
        "email": string;
        "first_name": string;
        "last_name": string;
        "usual_full_name"?: string;
        "displayname": string;
        "image"?: {
          link?: string;
        };
        "staff?": boolean;
        "correction_point": number;
        "pool_month"?: string;
        "pool_year"?: string;
        "location"?: string;
        "wallet": number;
        "alumni?": boolean;
        "active?": boolean;
        "campus": {
          id: number;
          name: string;
          time_zone: string;
        }[];
        "cursus_users": {
          id: number;
          grade?: string;
          level: number;
          cursus_id: number;
          cursus: {
            id: number;
            name: string;
          };
          skills: {
            name: string;
            level: number;
          }[];
        }[];
        "projects_users": {
          "id": number;
          "final_mark"?: number;
          "status": string;
          "validated?": boolean;
          "project": {
            id: number;
            name: string;
            slug: string;
          };
        }[];
        "achievements": {
          id: number;
          name: string;
          description: string;
          tier: string;
          kind: string;
        }[];
      };

      return {
        id: data.id,
        login: data.login,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        usualFullName: data.usual_full_name,
        displayname: data.displayname,
        imageUrl: data.image?.link,
        staff: data["staff?"],
        correctionPoint: data.correction_point,
        poolMonth: data.pool_month,
        poolYear: data.pool_year,
        location: data.location,
        wallet: data.wallet,
        alumni: data["alumni?"],
        active: data["active?"],
        campus: data.campus.map((c) => ({
          id: c.id,
          name: c.name,
          timeZone: c.time_zone,
        })),
        cursusUsers: data.cursus_users.map((cu) => ({
          id: cu.id,
          grade: cu.grade,
          level: cu.level,
          cursusId: cu.cursus_id,
          cursusName: cu.cursus.name,
          skills: cu.skills.map((s) => ({
            name: s.name,
            level: s.level,
          })),
        })),
        projectsUsers: data.projects_users.map((pu) => ({
          id: pu.id,
          finalMark: pu.final_mark,
          status: pu.status,
          validated: pu["validated?"],
          projectName: pu.project.name,
          projectSlug: pu.project.slug,
        })),
        achievements: data.achievements.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          tier: a.tier,
          kind: a.kind,
        })),
      };
    },
  }),
};
