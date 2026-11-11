import type { ToolSet } from "ai";
import { githubFetch } from "#/utils/github-api";
import { tool } from "ai";
import { z } from "zod";

export const githubTools: ToolSet = {
  getUserProfile: tool({
    description: "Get a GitHub user profile: bio, company, location, follower counts and public repo stats. Present the profile as a Discord embed via sendEmbed (thumbnail: the user's avatarUrl), with human-readable dates, never raw JSON.",
    inputSchema: z.object({
      username: z.string().describe("The GitHub username (e.g. 'torvalds', 'octocat')"),
    }),
    outputSchema: z.object({
      login: z.string().describe("GitHub login"),
      id: z.number().describe("User ID"),
      avatarUrl: z.string().describe("Avatar URL"),
      htmlUrl: z.string().describe("Profile URL"),
      name: z.string().optional().describe("Full name"),
      company: z.string().optional().describe("Company"),
      blog: z.string().optional().describe("Website/blog"),
      location: z.string().optional().describe("Location"),
      email: z.string().optional().describe("Public email"),
      bio: z.string().optional().describe("Bio"),
      twitterUsername: z.string().optional().describe("Twitter/X username"),
      publicRepos: z.number().describe("Public repositories count"),
      publicGists: z.number().describe("Public gists count"),
      followers: z.number().describe("Followers count"),
      following: z.number().describe("Following count"),
      createdAt: z.string().describe("Account creation date (ISO)"),
      updatedAt: z.string().describe("Last update date (ISO)"),
    }),
    execute: async ({ username }) => {
      const data = await githubFetch<{
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
      }>(`/users/${encodeURIComponent(username)}`);

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
    description: "List the public repositories of a GitHub user with their stats (stars, forks, language, dates). Present the results as a Discord embed via sendEmbed, with human-readable dates, never raw JSON.",
    inputSchema: z.object({
      username: z.string().describe("The GitHub username"),
      sort: z.enum(["created", "updated", "pushed", "full_name"]).optional().describe("Sort repositories (default: updated)"),
      perPage: z.number().int().min(1).max(100).optional().describe("Results per page (default: 100)"),
    }),
    outputSchema: z.object({
      repos: z.array(z.object({
        id: z.number().describe("Repository ID"),
        name: z.string().describe("Repository name"),
        fullName: z.string().describe("Full name (owner/repo)"),
        description: z.string().optional().describe("Description"),
        htmlUrl: z.string().describe("Repository URL"),
        language: z.string().optional().describe("Main language"),
        stargazersCount: z.number().describe("Stars count"),
        forksCount: z.number().describe("Forks count"),
        watchersCount: z.number().describe("Watchers count"),
        openIssuesCount: z.number().describe("Open issues count"),
        size: z.number().describe("Size in KB"),
        createdAt: z.string().describe("Creation date (ISO)"),
        updatedAt: z.string().describe("Last update date (ISO)"),
        pushedAt: z.string().describe("Last push date (ISO)"),
        fork: z.boolean().describe("Whether the repository is a fork"),
        archived: z.boolean().describe("Whether the repository is archived"),
        topics: z.array(z.string()).describe("Topics/tags"),
      })).describe("Repositories"),
    }),
    execute: async ({ username, sort = "updated", perPage = 100 }) => {
      const data = await githubFetch<{
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
      }[]>(`/users/${encodeURIComponent(username)}/repos?sort=${sort}&per_page=${String(perPage)}`);

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
      };
    },
  }),

  getRepoInfo: tool({
    description: "Get detailed information about a GitHub repository: description, stats, license and enabled features. Present the result as a Discord embed via sendEmbed, with human-readable dates, never raw JSON.",
    inputSchema: z.object({
      owner: z.string().describe("The repository owner (username or organization)"),
      repo: z.string().describe("The repository name"),
    }),
    outputSchema: z.object({
      id: z.number().describe("Repository ID"),
      name: z.string().describe("Repository name"),
      fullName: z.string().describe("Full name (owner/repo)"),
      description: z.string().optional().describe("Description"),
      htmlUrl: z.string().describe("Repository URL"),
      homepage: z.string().optional().describe("Project website"),
      language: z.string().optional().describe("Main language"),
      stargazersCount: z.number().describe("Stars count"),
      forksCount: z.number().describe("Forks count"),
      watchersCount: z.number().describe("Watchers count"),
      openIssuesCount: z.number().describe("Open issues count"),
      size: z.number().describe("Size in KB"),
      defaultBranch: z.string().describe("Default branch"),
      createdAt: z.string().describe("Creation date (ISO)"),
      updatedAt: z.string().describe("Last update date (ISO)"),
      pushedAt: z.string().describe("Last push date (ISO)"),
      fork: z.boolean().describe("Whether the repository is a fork"),
      archived: z.boolean().describe("Whether the repository is archived"),
      disabled: z.boolean().describe("Whether the repository is disabled"),
      topics: z.array(z.string()).describe("Topics/tags"),
      license: z.object({
        key: z.string().describe("License key"),
        name: z.string().describe("License name"),
        spdxId: z.string().describe("SPDX ID"),
      }).optional().describe("Repository license"),
      hasIssues: z.boolean().describe("Whether issues are enabled"),
      hasProjects: z.boolean().describe("Whether projects are enabled"),
      hasWiki: z.boolean().describe("Whether the wiki is enabled"),
      hasPages: z.boolean().describe("Whether GitHub Pages is enabled"),
      hasDiscussions: z.boolean().describe("Whether discussions are enabled"),
    }),
    execute: async ({ owner, repo }) => {
      const data = await githubFetch<{
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
      }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);

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
    description: "Search GitHub repositories by keywords. Supports search qualifiers in the query (e.g. 'discord bot language:typescript stars:>100'). Present the results as a Discord embed via sendEmbed, with human-readable dates, never raw JSON.",
    inputSchema: z.object({
      query: z.string().describe("Search query (e.g. 'discord bot', 'machine learning stars:>500')"),
      sort: z.enum(["stars", "forks", "help-wanted-issues", "updated"]).optional().describe("Sort results"),
      order: z.enum(["asc", "desc"]).optional().describe("Sort order (default: desc)"),
      perPage: z.number().int().min(1).max(100).optional().describe("Results per page (default: 30)"),
    }),
    outputSchema: z.object({
      totalCount: z.number().describe("Total matching repositories"),
      repos: z.array(z.object({
        id: z.number().describe("Repository ID"),
        name: z.string().describe("Repository name"),
        fullName: z.string().describe("Full name (owner/repo)"),
        description: z.string().optional().describe("Description"),
        htmlUrl: z.string().describe("Repository URL"),
        language: z.string().optional().describe("Main language"),
        stargazersCount: z.number().describe("Stars count"),
        forksCount: z.number().describe("Forks count"),
        watchersCount: z.number().describe("Watchers count"),
        openIssuesCount: z.number().describe("Open issues count"),
        topics: z.array(z.string()).describe("Topics/tags"),
        createdAt: z.string().describe("Creation date (ISO)"),
        updatedAt: z.string().describe("Last update date (ISO)"),
      })).describe("Matching repositories"),
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

      const data = await githubFetch<{
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
      }>(`/search/repositories?${params.toString()}`);

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
