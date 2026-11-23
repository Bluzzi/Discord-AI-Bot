import type { ToolSet } from "ai";
import { octokit } from "#/integrations/github";
import { tool } from "ai";
import dedent from "dedent";
import { posix } from "node:path";
import { z } from "zod";

export const githubTools = {
  github_get_repo_info: tool({
    description: "Get public GitHub repository metadata, including its default branch, license and open issue count.",
    inputSchema: z.object({
      owner: z.string().trim().regex(/^[a-z0-9-]+$/iu).describe("GitHub user or organization that owns the public repository"),
      repo: z.string().trim().regex(/^(?!\.{1,2}$)[a-z0-9_.-]+$/iu).describe("Repository name without the owner or URL"),
    }),
    execute: async ({ owner, repo }) => {
      const { data } = await octokit.rest.repos.get({ owner, repo });
      const { full_name, description, default_branch, language, stargazers_count, topics, license, pushed_at, open_issues_count } = data;
      return { full_name, description, default_branch, language, stargazers_count, topics, license: license?.spdx_id, pushed_at, open_issues_count };
    },
  }),
  github_get_repo_tree: tool({
    description: "List file paths and sizes from a recursive GitHub tree. Use a branch, tag or full SHA, and optionally narrow by directory or pattern. A truncated result is incomplete.",
    inputSchema: z.object({
      owner: z.string().trim().regex(/^[a-z0-9-]+$/iu).describe("GitHub user or organization that owns the public repository"),
      repo: z.string().trim().regex(/^(?!\.{1,2}$)[a-z0-9_.-]+$/iu).describe("Repository name without the owner or URL"),
      branch: z.string().min(1).refine((value) => value !== "." && value !== "..").optional().describe("Branch, tag or SHA. Defaults to the repository's default branch."),
      path_prefix: z.string().optional().describe("Directory prefix relative to the repository root"),
      pattern: z.string().optional().describe("Path substring or glob, for example **/*.ts"),
    }),
    execute: async ({ owner, repo, branch, path_prefix: pathPrefix, pattern }) => {
      const { data } = await octokit.rest.git.getTree({ owner, repo, tree_sha: branch ?? "HEAD", recursive: "1" });
      const prefix = pathPrefix?.replace(/\/+$/u, "") ?? "";
      const files = data.tree.filter(({ path, type }) => type === "blob"
        && (!prefix || path === prefix || path.startsWith(`${prefix}/`))
        && (pattern === undefined || path.includes(pattern) || posix.matchesGlob(path, pattern)))
        .map(({ path, size }) => ({ path, size }));
      return { sha: data.sha, truncated: data.truncated, files };
    },
  }),
  github_read_file: tool({
    description: "Read a public GitHub text file with numbered lines. Without end_line, returns up to 300 lines from start_line (default 1).",
    inputSchema: z.object({
      owner: z.string().trim().regex(/^[a-z0-9-]+$/iu).describe("GitHub user or organization that owns the public repository"),
      repo: z.string().trim().regex(/^(?!\.{1,2}$)[a-z0-9_.-]+$/iu).describe("Repository name without the owner or URL"),
      path: z.string().min(1).describe("File path relative to the repository root"),
      ref: z.string().min(1).refine((value) => value !== "." && value !== "..").optional().describe("Branch, tag or commit SHA"),
      start_line: z.number().int().positive().optional().describe("First line to read, inclusive (1-based)"),
      end_line: z.number().int().positive().optional().describe("Last line to read, inclusive (1-based)"),
    }),
    execute: async ({ owner, repo, path, ref, start_line: startLine = 1, end_line: endLine }) => {
      if (endLine !== undefined && endLine < startLine) throw new Error("end_line must be at least start_line.");
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
      if (Array.isArray(data) || data.type !== "file" || data.encoding !== "base64") {
        throw new Error("GitHub did not return readable file content for this path.");
      }
      const content = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(data.content, "base64"));
      if (content.includes("\0")) throw new Error("GitHub file is binary.");
      const lines = content.split(/\r\n|\r|\n/u);
      if (lines.at(-1) === "") lines.pop();
      return {
        path,
        total_lines: lines.length,
        content: lines.slice(startLine - 1, endLine ?? startLine + 299)
          .map((line, index) => `${String(startLine + index)}: ${line}`).join("\n"),
      };
    },
  }),
  github_search_code: tool({
    description: "Search code in a public GitHub repository's default branch and return matching excerpts. This GitHub endpoint requires authentication.",
    inputSchema: z.object({
      owner: z.string().trim().regex(/^[a-z0-9-]+$/iu).describe("GitHub user or organization that owns the public repository"),
      repo: z.string().trim().regex(/^(?!\.{1,2}$)[a-z0-9_.-]+$/iu).describe("Repository name without the owner or URL"),
      query: z.string().trim().min(1).describe("GitHub code search terms or qualifiers"),
      limit: z.number().int().min(1).max(20).default(10),
    }),
    execute: async ({ owner, repo, query, limit }) => {
      const { data } = await octokit.rest.search.code({
        q: `${query} repo:${owner}/${repo}`,
        per_page: limit,
        headers: { accept: "application/vnd.github.text-match+json" },
      });
      return data.items.filter((item) => item.repository.full_name.toLowerCase() === `${owner}/${repo}`.toLowerCase())
        .map(({ path, html_url, text_matches }) => ({ path, html_url, text_matches }));
    },
  }),
  github_search_issues: tool({
    description: "Find issues, pull requests or GitHub Discussions in a public repository. Use type discussion to search GitHub Discussions with authentication.",
    inputSchema: z.object({
      owner: z.string().trim().regex(/^[a-z0-9-]+$/iu).describe("GitHub user or organization that owns the public repository"),
      repo: z.string().trim().regex(/^(?!\.{1,2}$)[a-z0-9_.-]+$/iu).describe("Repository name without the owner or URL"),
      query: z.string().trim().optional(),
      state: z.enum(["open", "closed", "all"]).default("all"),
      type: z.enum(["issue", "pr", "all", "discussion"]).default("all").describe("Use all for issues and pull requests together"),
      limit: z.number().int().min(1).max(20).default(10),
    }),
    execute: async ({ owner, repo, query, state, type, limit }) => {
      const q = [query, `repo:${owner}/${repo}`, state === "all" ? undefined : `is:${state}`].filter(Boolean).join(" ");
      if (type === "discussion") {
        const { search } = await octokit.graphql<{ search: { nodes: ({ repository: { nameWithOwner: string; visibility: string } } | null)[] } }>(dedent`
          query($q: String!, $limit: Int!) {
            search(query: $q, type: DISCUSSION, first: $limit) {
              nodes {
                ... on Discussion {
                  number title url closed createdAt updatedAt
                  author { login }
                  category { name }
                  comments { totalCount }
                  repository { nameWithOwner visibility }
                }
              }
            }
          }
        `, { q, limit });
        return search.nodes.filter((item) => item?.repository.visibility === "PUBLIC"
          && item.repository.nameWithOwner.toLowerCase() === `${owner}/${repo}`.toLowerCase());
      }

      const { data } = await octokit.rest.search.issuesAndPullRequests({
        q: type === "all" ? q : `${q} is:${type}`,
        per_page: limit,
      });
      const repositoryUrl = `https://api.github.com/repos/${owner}/${repo}`.toLowerCase();
      return data.items.filter((issue) => issue.repository_url.toLowerCase() === repositoryUrl)
        .map(({ number, title, state, pull_request, labels, user, created_at, updated_at, comments, body, html_url }) => ({
          number,
          title,
          state,
          is_pr: pull_request !== undefined,
          labels: labels.map((label) => typeof label === "string" ? label : label.name),
          author: user?.login,
          created_at,
          updated_at,
          comments_count: comments,
          body_excerpt: body?.slice(0, 400),
          html_url,
        }));
    },
  }),
  github_get_issue_or_pr: tool({
    description: "Read a public GitHub issue or pull request with comments and optional PR file summaries. The authenticated discussion mode includes the first 50 comments and first 10 replies per comment, with pagination indicators.",
    inputSchema: z.object({
      owner: z.string().trim().regex(/^[a-z0-9-]+$/iu).describe("GitHub user or organization that owns the public repository"),
      repo: z.string().trim().regex(/^(?!\.{1,2}$)[a-z0-9_.-]+$/iu).describe("Repository name without the owner or URL"),
      number: z.number().int().positive().describe("Issue, pull request or discussion number within the repository"),
      include_pr_files: z.boolean().default(false).describe("Include changed files and patch excerpts for pull requests"),
      type: z.enum(["issue_or_pr", "discussion"]).default("issue_or_pr").describe("Select the GitHub resource to read"),
    }),
    execute: async ({ owner, repo, number, include_pr_files: includeFiles, type }) => {
      if (type === "discussion") {
        const result = await octokit.graphql<{ repository: { visibility: string; discussion: unknown } | null }>(dedent`
          query($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
              visibility
              discussion(number: $number) {
                number title body url closed createdAt updatedAt
                author { login }
                answer { url }
                comments(first: 50) {
                  totalCount
                  pageInfo { hasNextPage }
                  nodes {
                    body url createdAt author { login }
                    replies(first: 10) {
                      totalCount
                      pageInfo { hasNextPage }
                      nodes { body url createdAt author { login } }
                    }
                  }
                }
              }
            }
          }
        `, { owner, repo, number });
        if (result.repository?.visibility !== "PUBLIC" || result.repository.discussion === null) {
          throw new Error("Discussion not found in a public GitHub repository.");
        }
        return result.repository.discussion;
      }

      const issueParams = { owner, repo, issue_number: number };
      const { data: issue } = await octokit.rest.issues.get(issueParams);
      const comments = await octokit.paginate(octokit.rest.issues.listComments, issueParams, (page) => page.data.map(({ user, body, created_at, html_url }) => ({ author: user?.login, body, created_at, html_url })));
      const files = issue.pull_request && includeFiles ? await octokit.paginate(octokit.rest.pulls.listFiles, { owner, repo, pull_number: number }, (page) => page.data.map(({ filename, status, additions, deletions, patch }) => ({
        filename,
        status,
        additions,
        deletions,
        patch_excerpt: patch?.slice(0, 1500),
      }))) : undefined;
      const { title, state, body, html_url } = issue;
      return { number, title, state, body, html_url, is_pr: issue.pull_request !== undefined, comments, files };
    },
  }),
} satisfies ToolSet;
