import type { ToolSet } from "ai";
import { env } from "#/utils/env";
import { tool } from "ai";
import { z } from "zod";

async function githubFetch(endpoint: string) {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const response = await fetch(`https://api.github.com${endpoint}`, { headers });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Ressource GitHub introuvable: ${endpoint}`);
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const githubTools: ToolSet = {
  getUserProfile: tool({
    description: `Récupère toutes les informations d'un profil GitHub (bio, stats, repos publics, followers, etc.).

⚠️ IMPORTANT:
- Pour les profils, TOUJOURS utiliser sendEmbed avec thumbnail
- Formate les dates en format lisible (ex: "12 janvier 2024")
- Si pas de token GitHub configuré, l'API fonctionne quand même (rate limit plus bas)
- NE JAMAIS afficher le JSON brut des tools - TOUJOURS envoyer l'embed d'abord puis répondre`,
    inputSchema: z.object({
      username: z.string().describe("Le nom d'utilisateur GitHub (ex: 'torvalds', 'octocat')"),
    }),
    outputSchema: z.object({
      login: z.string().describe("Login GitHub"),
      id: z.number().describe("ID de l'utilisateur"),
      avatarUrl: z.string().describe("URL de l'avatar"),
      htmlUrl: z.string().describe("URL du profil"),
      name: z.string().optional().describe("Nom complet"),
      company: z.string().optional().describe("Entreprise"),
      blog: z.string().optional().describe("Site web/blog"),
      location: z.string().optional().describe("Localisation"),
      email: z.string().optional().describe("Email public"),
      bio: z.string().optional().describe("Biographie"),
      twitterUsername: z.string().optional().describe("Nom d'utilisateur Twitter"),
      publicRepos: z.number().describe("Nombre de repos publics"),
      publicGists: z.number().describe("Nombre de gists publics"),
      followers: z.number().describe("Nombre de followers"),
      following: z.number().describe("Nombre de following"),
      createdAt: z.string().describe("Date de création du compte"),
      updatedAt: z.string().describe("Date de dernière mise à jour"),
    }),
    execute: async ({ username }) => {
      const data = await githubFetch(`/users/${username}`) as {
        login: string;
        id: number;
        avatar_url: string;
        html_url: string;
        name?: string;
        company?: string;
        blog?: string;
        location?: string;
        email?: string;
        bio?: string;
        twitter_username?: string;
        public_repos: number;
        public_gists: number;
        followers: number;
        following: number;
        created_at: string;
        updated_at: string;
      };

      return {
        login: data.login,
        id: data.id,
        avatarUrl: data.avatar_url,
        htmlUrl: data.html_url,
        name: data.name,
        company: data.company,
        blog: data.blog,
        location: data.location,
        email: data.email,
        bio: data.bio,
        twitterUsername: data.twitter_username,
        publicRepos: data.public_repos,
        publicGists: data.public_gists,
        followers: data.followers,
        following: data.following,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    },
  }),

  getUserRepos: tool({
    description: "Récupère TOUS les repositories publics d'un utilisateur GitHub avec leurs stats (stars, forks, language, etc.).",
    inputSchema: z.object({
      username: z.string().describe("Le nom d'utilisateur GitHub"),
      sort: z.enum(["created", "updated", "pushed", "full_name"]).optional().describe("Tri des repos (défaut: updated)"),
      perPage: z.number().optional().describe("Nombre de repos par page (max 100, défaut: 100)"),
    }),
    outputSchema: z.object({
      repos: z.array(z.object({
        id: z.number().describe("ID du repo"),
        name: z.string().describe("Nom du repo"),
        fullName: z.string().describe("Nom complet (user/repo)"),
        description: z.string().optional().describe("Description"),
        htmlUrl: z.string().describe("URL du repo"),
        language: z.string().optional().describe("Langage principal"),
        stargazersCount: z.number().describe("Nombre d'étoiles"),
        forksCount: z.number().describe("Nombre de forks"),
        watchersCount: z.number().describe("Nombre de watchers"),
        openIssuesCount: z.number().describe("Nombre d'issues ouvertes"),
        size: z.number().describe("Taille en KB"),
        createdAt: z.string().describe("Date de création"),
        updatedAt: z.string().describe("Date de dernière mise à jour"),
        pushedAt: z.string().describe("Date du dernier push"),
        fork: z.boolean().describe("Est-ce un fork"),
        archived: z.boolean().describe("Est-ce archivé"),
        topics: z.array(z.string()).describe("Topics/tags"),
      })).describe("Liste des repositories"),
      totalCount: z.number().describe("Nombre total de repos"),
    }),
    execute: async ({ username, sort = "updated", perPage = 100 }) => {
      const data = await githubFetch(`/users/${username}/repos?sort=${sort}&per_page=${perPage}`) as {
        id: number;
        name: string;
        full_name: string;
        description?: string;
        html_url: string;
        language?: string;
        stargazers_count: number;
        forks_count: number;
        watchers_count: number;
        open_issues_count: number;
        size: number;
        created_at: string;
        updated_at: string;
        pushed_at: string;
        fork: boolean;
        archived: boolean;
        topics: string[];
      }[];

      return {
        repos: data.map((repo) => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          htmlUrl: repo.html_url,
          language: repo.language,
          stargazersCount: repo.stargazers_count,
          forksCount: repo.forks_count,
          watchersCount: repo.watchers_count,
          openIssuesCount: repo.open_issues_count,
          size: repo.size,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
          pushedAt: repo.pushed_at,
          fork: repo.fork,
          archived: repo.archived,
          topics: repo.topics,
        })),
        totalCount: data.length,
      };
    },
  }),

  getRepoInfo: tool({
    description: "Récupère toutes les informations détaillées d'un repository GitHub (description, stats, languages, contributors, etc.).",
    inputSchema: z.object({
      owner: z.string().describe("Le propriétaire du repo (username ou org)"),
      repo: z.string().describe("Le nom du repository"),
    }),
    outputSchema: z.object({
      id: z.number().describe("ID du repo"),
      name: z.string().describe("Nom du repo"),
      fullName: z.string().describe("Nom complet (owner/repo)"),
      description: z.string().optional().describe("Description"),
      htmlUrl: z.string().describe("URL du repo"),
      homepage: z.string().optional().describe("Site web du projet"),
      language: z.string().optional().describe("Langage principal"),
      stargazersCount: z.number().describe("Nombre d'étoiles"),
      forksCount: z.number().describe("Nombre de forks"),
      watchersCount: z.number().describe("Nombre de watchers"),
      openIssuesCount: z.number().describe("Nombre d'issues ouvertes"),
      size: z.number().describe("Taille en KB"),
      defaultBranch: z.string().describe("Branche par défaut"),
      createdAt: z.string().describe("Date de création"),
      updatedAt: z.string().describe("Date de dernière mise à jour"),
      pushedAt: z.string().describe("Date du dernier push"),
      fork: z.boolean().describe("Est-ce un fork"),
      archived: z.boolean().describe("Est-ce archivé"),
      disabled: z.boolean().describe("Est-ce désactivé"),
      topics: z.array(z.string()).describe("Topics/tags"),
      license: z.object({
        key: z.string().describe("Clé de la licence"),
        name: z.string().describe("Nom de la licence"),
        spdxId: z.string().describe("SPDX ID"),
      }).optional().describe("Licence du projet"),
      hasIssues: z.boolean().describe("Issues activées"),
      hasProjects: z.boolean().describe("Projects activés"),
      hasWiki: z.boolean().describe("Wiki activé"),
      hasPages: z.boolean().describe("GitHub Pages activé"),
      hasDiscussions: z.boolean().describe("Discussions activées"),
    }),
    execute: async ({ owner, repo }) => {
      const data = await githubFetch(`/repos/${owner}/${repo}`) as {
        id: number;
        name: string;
        full_name: string;
        description?: string;
        html_url: string;
        homepage?: string;
        language?: string;
        stargazers_count: number;
        forks_count: number;
        watchers_count: number;
        open_issues_count: number;
        size: number;
        default_branch: string;
        created_at: string;
        updated_at: string;
        pushed_at: string;
        fork: boolean;
        archived: boolean;
        disabled: boolean;
        topics: string[];
        license?: {
          key: string;
          name: string;
          spdx_id: string;
        };
        has_issues: boolean;
        has_projects: boolean;
        has_wiki: boolean;
        has_pages: boolean;
        has_discussions: boolean;
      };

      return {
        id: data.id,
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        htmlUrl: data.html_url,
        homepage: data.homepage,
        language: data.language,
        stargazersCount: data.stargazers_count,
        forksCount: data.forks_count,
        watchersCount: data.watchers_count,
        openIssuesCount: data.open_issues_count,
        size: data.size,
        defaultBranch: data.default_branch,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        pushedAt: data.pushed_at,
        fork: data.fork,
        archived: data.archived,
        disabled: data.disabled,
        topics: data.topics,
        license: data.license ? {
          key: data.license.key,
          name: data.license.name,
          spdxId: data.license.spdx_id,
        } : undefined,
        hasIssues: data.has_issues,
        hasProjects: data.has_projects,
        hasWiki: data.has_wiki,
        hasPages: data.has_pages,
        hasDiscussions: data.has_discussions,
      };
    },
  }),

  searchRepos: tool({
    description: "Recherche des repositories GitHub par mots-clés avec filtres (language, stars, etc.).",
    inputSchema: z.object({
      query: z.string().describe("Requête de recherche (ex: 'discord bot', 'machine learning')"),
      sort: z.enum(["stars", "forks", "help-wanted-issues", "updated"]).optional().describe("Tri des résultats"),
      order: z.enum(["asc", "desc"]).optional().describe("Ordre de tri (défaut: desc)"),
      perPage: z.number().optional().describe("Nombre de résultats (max 100, défaut: 30)"),
    }),
    outputSchema: z.object({
      totalCount: z.number().describe("Nombre total de résultats"),
      repos: z.array(z.object({
        id: z.number().describe("ID du repo"),
        name: z.string().describe("Nom du repo"),
        fullName: z.string().describe("Nom complet (owner/repo)"),
        description: z.string().optional().describe("Description"),
        htmlUrl: z.string().describe("URL du repo"),
        language: z.string().optional().describe("Langage principal"),
        stargazersCount: z.number().describe("Nombre d'étoiles"),
        forksCount: z.number().describe("Nombre de forks"),
        watchersCount: z.number().describe("Nombre de watchers"),
        openIssuesCount: z.number().describe("Nombre d'issues ouvertes"),
        topics: z.array(z.string()).describe("Topics/tags"),
        createdAt: z.string().describe("Date de création"),
        updatedAt: z.string().describe("Date de dernière mise à jour"),
      })).describe("Liste des repositories trouvés"),
    }),
    execute: async ({ query, sort, order = "desc", perPage = 30 }) => {
      const params = new URLSearchParams({
        q: query,
        per_page: perPage.toString(),
        order,
      });

      if (sort) {
        params.append("sort", sort);
      }

      const data = await githubFetch(`/search/repositories?${params.toString()}`) as {
        total_count: number;
        items: {
          id: number;
          name: string;
          full_name: string;
          description?: string;
          html_url: string;
          language?: string;
          stargazers_count: number;
          forks_count: number;
          watchers_count: number;
          open_issues_count: number;
          topics: string[];
          created_at: string;
          updated_at: string;
        }[];
      };

      return {
        totalCount: data.total_count,
        repos: data.items.map((repo) => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          htmlUrl: repo.html_url,
          language: repo.language,
          stargazersCount: repo.stargazers_count,
          forksCount: repo.forks_count,
          watchersCount: repo.watchers_count,
          openIssuesCount: repo.open_issues_count,
          topics: repo.topics,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
        })),
      };
    },
  }),
};
