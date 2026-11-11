const GITHUB_API_URL = "https://api.github.com";

const GITHUB_API_HEADERS: Record<string, string> = {
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

export const githubFetch = async <T>(endpoint: string): Promise<T> => {
  const response = await fetch(`${GITHUB_API_URL}${endpoint}`, { headers: GITHUB_API_HEADERS });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`GitHub resource not found: ${endpoint}`);
    }
    throw new Error(`GitHub API error: ${String(response.status)} ${response.statusText}`);
  }

  return await response.json() as T;
};
