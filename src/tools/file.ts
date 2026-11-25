import type { ToolResultPart } from "ai";
import { openRouterApi } from "#/integrations/openrouter.helper-pricing";
import { env } from "#/utils/env";
import { tool } from "ai";
import { z } from "zod";

const maxFileBytes = 10 * 1024 * 1024;
const maxTextBytes = 32 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.url({ protocol: /^https$/u }),
  mediaType: z.string().nullable(),
  size: z.number().nonnegative(),
});
const replyContextSchema = z.object({
  conversation: z.array(z.object({ attachments: z.array(attachmentSchema) })),
});

export const fileTools = {
  readFile: tool({
    description: "Download an attachment by ID from getReplyContext. Returns a fileId for uploadRailwayAttachment and readable content when supported. Max 10 MiB.",
    inputSchema: z.object({ attachmentId: z.string().min(1) }),
    execute: async ({ attachmentId }, { messages, abortSignal }) => {
      // Resolve the attachment ID against the preloaded conversation:
      const context = messages.flatMap((message) => message.role === "tool" ? message.content : [])
        .find((part) => part.type === "tool-result" && part.toolName === "getReplyContext");
      if (context?.type !== "tool-result" || context.output.type !== "json") throw new Error("Reply context is missing");
      const { conversation } = replyContextSchema.parse(context.output.value);
      const attachment = conversation.flatMap(({ attachments }) => attachments).find(({ id }) => id === attachmentId);
      if (attachment === undefined) throw new Error("Attachment is missing from this conversation");

      // Enforce the size limit before and during the download:
      const { url, name, size, mediaType } = attachment;
      if (size > maxFileBytes) throw new Error("Attachment exceeds 10 MiB");
      const timeout = AbortSignal.timeout(20_000);
      const signal = abortSignal === undefined ? timeout : AbortSignal.any([abortSignal, timeout]);
      const response = await fetch(url, { redirect: "error", signal });
      if (!response.ok || response.body === null) {
        throw new Error(`Attachment download failed (HTTP ${String(response.status)})`);
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      for await (const chunk of response.body.values()) {
        totalBytes += chunk.byteLength;
        if (totalBytes > maxFileBytes) throw new Error("Attachment exceeds 10 MiB");
        chunks.push(chunk);
      }

      // Determine whether OpenRouter can display the downloaded file:
      const mimeType = mediaType ?? "application/octet-stream";
      const canShowFile = mimeType === "application/pdf" || (imageTypes.has(mimeType) && await openRouterApi.acceptsImages(env.OPENROUTER_MODEL));
      return { bytes: Buffer.concat(chunks, totalBytes), mediaType: mimeType, filename: name, canShowFile };
    },
    toModelOutput: ({ toolCallId, output: { bytes, mediaType, filename, canShowFile } }) => {
      // Show the file ID and keep the original bytes with the tool result for Railway:
      const isText = mediaType.startsWith("text/") || mediaType === "application/json";
      const canShowText = isText && bytes.length <= maxTextBytes;
      const metadata = {
        type: "text" as const,
        text: JSON.stringify({ fileId: toolCallId, filename, mediaType, contentIncluded: canShowFile || canShowText }),
        providerOptions: { readFile: { data: bytes.toString("base64") } },
      };
      const content: Extract<ToolResultPart["output"], { type: "content" }>["value"] = [metadata];

      // Add any content the model can read:
      if (canShowText) {
        const text = { type: "text" as const, text: bytes.toString("utf8") };
        content.push(text);
      }
      if (canShowFile) {
        const file = { type: "file" as const, data: { type: "data" as const, data: bytes }, mediaType, filename };
        content.push(file);
      }

      return { type: "content", value: content };
    },
  }),
};
