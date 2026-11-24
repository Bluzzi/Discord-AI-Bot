import type { ToolSet } from "ai";
import { attempt } from "#/utils/attempt";
import { tool } from "ai";
import dedent from "dedent";
import { Sandbox } from "railway";
import { z } from "zod";

const maxFileBytes = 10 * 1024 * 1024;
const maxExportedBytes = 25 * 1024 * 1024;
const sandboxPath = z.string().startsWith("/").max(1024).describe("Absolute path in the Linux sandbox");

export const createRailwayTools = (
  token: string | undefined,
  attachmentUrls: ReadonlyMap<string, { url: string; size: number }>,
  registerAttachment: (file: { attachment: Buffer; name: string }) => string,
): ToolSet => {
  if (token === undefined) return {};
  // Keep one pending or active VM per request:
  let sandbox: ReturnType<typeof Sandbox.create> | undefined;
  let exportedBytes = 0;

  const getSandbox = async () => {
    if (sandbox === undefined) throw new Error("Call createRailwaySandbox first");
    return sandbox;
  };

  return {
    createRailwaySandbox: tool({
      description: dedent`
        Create a temporary Linux VM for this Discord request. Use it to merge tournament CSVs and compute standings, plot channel activity from records you can read, convert images and return a ZIP, run a script on sample inputs and report observed results, or for any other relevant task that benefits from a Linux VM.
        Wait for this tool before calling other Railway tools. The VM expires after 5 minutes of inactivity.
      `,
      inputSchema: z.object({}),
      execute: async () => {
        // Reuse the current VM while it is still available:
        const previous = sandbox;
        if (previous !== undefined) {
          const vm = await previous;
          await vm.refresh();
          if (vm.status === "DESTROYED" && sandbox === previous) sandbox = undefined;
        }
        // Start an isolated VM and release the cached promise if creation fails:
        sandbox ??= Sandbox.create({
          token,
          authType: "project-token",
          idleTimeoutMinutes: 5,
          networkIsolation: "ISOLATED",
        });
        const creation = sandbox;
        const result = await attempt(async () => creation);
        if (!result.ok) {
          if (sandbox === creation) sandbox = undefined;
          throw result.error;
        }
        return { status: "ready" };
      },
    }),
    runRailwayCommand: tool({
      description: "Run a shell command in the current Railway VM and return its exit code, stdout, and stderr. Each command can run for up to 60 seconds.",
      inputSchema: z.object({
        command: z.string().min(1).max(16000).describe("Shell command. Use absolute paths or change directory in the command."),
      }),
      execute: async ({ command }) => {
        const vm = await getSandbox();
        return vm.execHttp(command, { timeoutSec: 60 });
      },
    }),
    uploadRailwayAttachment: tool({
      description: "Copy a Discord attachment from getReplyContext into the current Railway VM. The file can be up to 10 MiB.",
      inputSchema: z.object({
        attachmentId: z.string().describe("Attachment ID from getReplyContext"),
        path: sandboxPath,
      }),
      execute: async ({ attachmentId, path }) => {
        const vm = await getSandbox();
        const file = attachmentUrls.get(attachmentId);
        if (file === undefined) throw new Error("Attachment ID not found in this reply context");
        if (file.size > maxFileBytes) throw new Error("Discord attachment exceeds 10 MiB");
        const response = await fetch(file.url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`Discord attachment download failed (HTTP ${String(response.status)})`);
        const bytes = await response.bytes();
        if (bytes.length > maxFileBytes) throw new Error("Discord attachment exceeds 10 MiB");
        await vm.files.write(path, bytes);
        return { path };
      },
    }),
    writeRailwayFile: tool({
      description: "Write a script or text data to a file in the current Railway VM.",
      inputSchema: z.object({ path: sandboxPath, content: z.string().max(64000) }),
      execute: async ({ path, content }) => {
        const vm = await getSandbox();
        await vm.files.write(path, content);
        return { path };
      },
    }),
    downloadRailwayFile: tool({
      description: "Export a file from the current Railway VM. Pass the resulting attachmentRef to sendReply or sendMessage. Use attachmentRefs to attach several files. Exports are limited to 10 MiB per file and 25 MiB per request.",
      inputSchema: z.object({
        path: sandboxPath,
        name: z.string().min(1).max(128).regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u).describe("Filename shown in Discord, including its extension"),
      }),
      outputSchema: z.object({ attachmentRef: z.uuid() }),
      execute: async ({ path, name }) => {
        const vm = await getSandbox();
        const limit = Math.min(maxFileBytes, maxExportedBytes - exportedBytes);
        const bytes = await vm.files.read(path, { format: "bytes", length: limit + 1 });
        if (bytes.length > maxFileBytes || bytes.length + exportedBytes > maxExportedBytes) throw new Error("Sandbox output exceeds the file or request size limit");
        exportedBytes += bytes.length;
        return { attachmentRef: registerAttachment({ attachment: Buffer.from(bytes), name }) };
      },
    }),
    destroyRailwaySandbox: tool({
      description: "Destroy the current Railway VM. Call this once commands and exports are finished, before replying. Exported attachment references remain usable after destruction.",
      inputSchema: z.object({}),
      execute: async () => {
        const current = sandbox;
        if (current !== undefined) {
          const vm = await current;
          await vm.destroy();
          if (sandbox === current) sandbox = undefined;
        }
        return { status: "destroyed" };
      },
    }),
  };
};
