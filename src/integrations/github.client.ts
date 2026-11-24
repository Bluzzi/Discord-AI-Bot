import { env } from "#/utils/env";
import { Octokit } from "octokit";

export const octokit = new Octokit({
  auth: env.GITHUB_TOKEN,
  userAgent: "discord-ai-bot-github-explorer",
  retry: { enabled: false },
  throttle: { enabled: false },
});
