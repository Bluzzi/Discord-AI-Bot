import { env } from "#/utils/env";
import { Octokit } from "octokit";

const token = env.GITHUB_TOKEN ?? "";
export const octokit = new Octokit({
  auth: token || undefined,
  userAgent: "discord-ai-bot-github-explorer",
  retry: { enabled: false },
  throttle: { enabled: false },
});
