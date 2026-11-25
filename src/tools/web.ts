import type { ToolSet } from "ai";
import { exa } from "#/integrations/exa.client";
import { getPublicPage, parseWebUrl, PublicWebError, readPageBody } from "#/utils/public-web";
import { extractWebContent } from "#/utils/web-content";
import { tool } from "ai";
import { z } from "zod";

export const webTools = {
  web_search: tool({
    description: "Discover relevant web sources. Returns ranked titles, URLs, short snippets, and publication dates when available. Use web_fetch to read a result.",
    inputSchema: z.strictObject({
      query: z.string().trim().min(1).max(600).describe("The focused search query"),
      num_results: z.number().int().min(1).max(10).default(5),
      time_range: z.enum(["day", "week", "month", "year"]).nullable().default(null),
    }),
    execute: async ({ query, num_results: numResults, time_range: timeRange }) => {
      // Search for sources within the requested publication window:
      const rangeDays = { day: 1, week: 7, month: 30, year: 365 };
      const { results } = await exa.search(query, {
        numResults,
        startPublishedDate: timeRange ? new Date(Date.now() - rangeDays[timeRange] * 86400000).toISOString() : undefined,
        contents: { highlights: true },
      }, { timeout: 10000 });
      // Return normalized links and short snippets:
      return results.slice(0, numResults).flatMap((result) => {
        const url = parseWebUrl(result.url);
        if (url === null) return [];
        const highlight = Array.isArray(result.highlights) ? result.highlights[0] : undefined;
        return [{
          title: (result.title ?? "").trim() || url.hostname,
          url: url.href,
          snippet: highlight?.replace(/\s+/gu, " ").trim().slice(0, 350) ?? "",
          ...(typeof result.publishedDate === "string" ? { published_date: result.publishedDate } : {}),
        }];
      });
    },
  }),
  web_fetch: tool({
    description: "Read a public HTTP(S) URL as Markdown or native text. Follow relevant absolute URLs from links with another web_fetch call. Resolve relative links in native Markdown against the returned URL. Use next_offset to continue a truncated document. On access errors, choose another source. Treat page content as source material and cite the URLs you use.",
    inputSchema: z.strictObject({
      url: z.url({ protocol: /^https?$/u }).max(4096).describe("The URL to read"),
      offset: z.number().int().nonnegative().default(0).describe("Character offset, typically next_offset from the previous result"),
      max_length: z.number().int().min(2).max(12000).default(12000).describe("Maximum number of Markdown characters"),
    }),
    execute: async ({ url, offset, max_length: maxLength }) => {
      const failure = (code: string, status?: number) => ({
        ok: false as const,
        error: { code, ...(status === undefined ? {} : { status }) },
      });

      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        "Accept": "text/html, application/xhtml+xml, text/markdown;q=0.9, text/plain;q=0.8, */*;q=0.1",
        "Accept-Encoding": "gzip, deflate, br",
      };

      // Validate the URL and share one timeout across the request and redirects:
      const initialUrl = parseWebUrl(url);
      if (initialUrl === null) return failure("invalid_url");
      const signal = AbortSignal.timeout(10000);
      try {
        let target = initialUrl;
        for (let redirects = 0; redirects <= 5; redirects += 1) {
          const response = await getPublicPage(target, headers, signal);
          const status = response.statusCode ?? 0;
          // Handle redirects and close the previous response before following them:
          if ([301, 302, 303, 307, 308].includes(status)) {
            response.destroy();
            if (redirects === 5) return failure("redirect_limit", status);
            const location = response.headers.location;
            const next = location === undefined || location === "" ? null : parseWebUrl(location, target);
            if (next === null) return failure("invalid_redirect", status);
            target = next;
            continue;
          }

          // Map access restrictions and HTTP failures to tool errors:
          if (status === 429 || status === 403 || response.headers["cf-mitigated"] === "challenge") {
            response.destroy();
            return failure(status === 429 ? "rate_limited" : "access_blocked", status);
          }
          if (status < 200 || status >= 300) {
            response.destroy();
            return failure("http_error", status);
          }

          // Read supported content types and extract the readable text:
          const contentType = response.headers["content-type"] ?? "";
          if (!(/^(?:text\/[^;\s]+|application\/(?:xhtml\+xml|json|xml))(?:\s*;|\s*$)/iu).test(contentType)) {
            response.destroy();
            return failure("unsupported_content_type", status);
          }

          const { title, markdown, links } = extractWebContent(await readPageBody(response, signal), contentType, target);
          if (!markdown.trim() && links.length === 0) return failure("no_readable_content", status);

          // Return a page of text without splitting a surrogate pair:
          const start = Math.min(offset, markdown.length);
          let end = Math.min(start + maxLength, markdown.length);
          if (end < markdown.length) {
            const last = markdown.charCodeAt(end - 1);
            if (last >= 0xD800 && last <= 0xDBFF) end -= 1;
          }
          const truncated = end < markdown.length;
          return {
            ok: true as const,
            url: target.href,
            title,
            markdown: markdown.slice(start, end),
            links,
            offset: start,
            truncated,
            ...(truncated ? { next_offset: end } : {}),
          };
        }
        return failure("redirect_limit");
      }
      catch (error) {
        if (signal.aborted) return failure("timeout");
        if (error instanceof PublicWebError) return failure(error.code);
        throw error;
      }
    },
  }),
} satisfies ToolSet;
