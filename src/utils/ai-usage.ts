import type { LanguageModelUsage } from "ai";

type AiToolCall = {
  toolName: string;
};

type AiContentPart = {
  type: string;
  toolName?: string;
};

const formatToolNameCounts = (toolNames: readonly string[]): string => {
  const counts = new Map<string, number>();

  for (const toolName of toolNames) {
    counts.set(toolName, (counts.get(toolName) ?? 0) + 1);
  }

  return [...counts.entries()].map(([toolName, count]) => count > 1 ? `${toolName} ×${String(count)}` : toolName).join(", ") || "none";
};

const formatTokenCount = (tokens: number | undefined, details: readonly string[]): string => {
  const tokenCount = tokens === undefined ? "n/a" : String(tokens);

  return `${tokenCount}${details.length > 0 ? ` (${details.join(", ")})` : ""}`;
};

export const aiUsage = {
  /** Format the number of calls per tool across all steps: "getUserMemory ×2, sendMessage" */
  formatToolCalls: (toolCalls: readonly AiToolCall[]): string => {
    return formatToolNameCounts(toolCalls.map((toolCall) => toolCall.toolName));
  },

  /** Format the number of errors per tool across all steps: "getNews ×2" */
  formatToolErrors: (content: readonly AiContentPart[]): string => {
    return formatToolNameCounts(content.flatMap((part) => part.type === "tool-error" && part.toolName !== undefined ? [part.toolName] : []));
  },

  /** Format token usage: "15320 input tokens (11200 cached) | 245 output tokens (31 reasoning)" */
  formatTokens: (usage: LanguageModelUsage): string => {
    const inputDetails: string[] = [];

    const cacheReadTokens = usage.inputTokenDetails.cacheReadTokens;
    if (cacheReadTokens !== undefined && cacheReadTokens > 0) inputDetails.push(`${String(cacheReadTokens)} cached`);

    const cacheWriteTokens = usage.inputTokenDetails.cacheWriteTokens;
    if (cacheWriteTokens !== undefined && cacheWriteTokens > 0) inputDetails.push(`${String(cacheWriteTokens)} written`);

    const outputDetails: string[] = [];

    const reasoningTokens = usage.outputTokenDetails.reasoningTokens;
    if (reasoningTokens !== undefined && reasoningTokens > 0) outputDetails.push(`${String(reasoningTokens)} reasoning`);

    return `${formatTokenCount(usage.inputTokens, inputDetails)} input tokens | ${formatTokenCount(usage.outputTokens, outputDetails)} output tokens`;
  },
};
