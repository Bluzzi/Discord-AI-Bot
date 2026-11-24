import type { ToolSet } from "ai";
import { createRailwaySession } from "#/integrations/railway";
import { tool } from "ai";
import dedent from "dedent";
import { z } from "zod";

const maxFileBytes = 10 * 1024 * 1024;
const sandboxPath = z.string().startsWith("/").max(1024).describe("Absolute path in the Linux sandbox");

export const createRailwayTools = (
  token: string | undefined,
  attachmentUrls: ReadonlyMap<string, { url: string; size: number }>,
  registerAttachment: (file: { attachment: Buffer; name: string }) => string,
): { tools: ToolSet; destroy: () => Promise<void> } => {
  if (token === undefined) return { tools: {}, destroy: async () => Promise.resolve() };
  const session = createRailwaySession(token);
  let exportedBytes = 0;

  return {
    destroy: session.destroy,
    tools: {
      railwaySandbox: tool({
        description: dedent`
          Work in a temporary Linux VM for this Discord request. Use it to merge tournament CSVs and compute standings, plot channel activity from records you can read, convert images and return a ZIP, or run a script on sample inputs and report observed results.
          Call create first. Use uploadAttachment with an attachment ID from getReplyContext to copy a Discord file into the VM. Use writeFile to add a script or text data. Run commands with exec (60 seconds maximum) and inspect exitCode, stdout and stderr. Use downloadFile for each result and pass the returned attachmentRef to sendReply or sendMessage (use attachmentRefs for multiple files). Destroy the VM after downloading the results and before replying. The VM expires after 5 minutes of inactivity.
          Transfers are limited to 10 MiB per file and 25 MiB of exported files per request.
        `,
        inputSchema: z.object({ operation: z.discriminatedUnion("action", [
          z.object({ action: z.literal("create") }),
          z.object({ action: z.literal("exec"), command: z.string().min(1).max(16000).describe("Shell command. Use absolute paths or change directory in the command.") }),
          z.object({ action: z.literal("uploadAttachment"), attachmentId: z.string().describe("Attachment ID from getReplyContext"), path: sandboxPath }),
          z.object({ action: z.literal("writeFile"), path: sandboxPath, content: z.string().max(64000) }),
          z.object({ action: z.literal("downloadFile"), path: sandboxPath, name: z.string().min(1).max(128).regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u).describe("Filename shown in Discord, including its extension") }),
          z.object({ action: z.literal("destroy") }),
        ]) }),
        execute: async ({ operation: input }) => {
          if (input.action === "create") {
            await session.create();
            return { status: "ready" };
          }
          if (input.action === "exec") {
            return session.use(async (sandbox) => {
              const { exitCode, stdout, stderr, timedOut, truncated } = await sandbox.execHttp(input.command, { timeoutSec: 60 });
              return { exitCode, stdout, stderr, timedOut, truncated };
            });
          }
          if (input.action === "uploadAttachment") {
            return session.use(async (sandbox) => {
              const file = attachmentUrls.get(input.attachmentId);
              if (file === undefined) throw new Error("Attachment ID not found in this reply context");
              if (file.size > maxFileBytes) throw new Error("Discord attachment exceeds 10 MiB");
              const response = await fetch(file.url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
              if (!response.ok) throw new Error(`Discord attachment download failed (HTTP ${String(response.status)})`);
              const bytes = await response.bytes();
              if (bytes.length > maxFileBytes) throw new Error("Discord attachment exceeds 10 MiB");
              await sandbox.files.write(input.path, bytes);
              return { path: input.path };
            });
          }
          if (input.action === "writeFile") {
            await session.use(async (sandbox) => sandbox.files.write(input.path, input.content));
            return { path: input.path };
          }
          if (input.action === "downloadFile") {
            return session.use(async (sandbox) => {
              const remainingBytes = 25 * 1024 * 1024 - exportedBytes;
              const limit = Math.min(maxFileBytes, remainingBytes);
              const bytes = await sandbox.files.read(input.path, { format: "bytes", length: limit + 1 });
              if (bytes.length > limit) throw new Error("Sandbox output exceeds the file or request size limit");
              exportedBytes += bytes.length;
              return { attachmentRef: registerAttachment({ attachment: Buffer.from(bytes), name: input.name }) };
            });
          }
          await session.destroy();
          return { status: "destroyed" };
        },
      }),
    },
  };
};
