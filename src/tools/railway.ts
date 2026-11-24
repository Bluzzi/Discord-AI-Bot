import type { ToolSet } from "ai";
import { env } from "#/utils/env";
import { tool } from "ai";
import dedent from "dedent";
import { randomUUID } from "node:crypto";
import { Sandbox } from "railway";
import { z } from "zod";

export const bindRailwayTools = (
  attachmentUrls: ReadonlyMap<string, { url: string; size: number }>,
  replyAttachments: Map<string, { attachment: Buffer; name: string }>,
): ToolSet => {
  const railwayToken = env.RAILWAY_TOKEN;
  if (railwayToken === undefined) return {};

  // Keep the sandbox and export budget scoped to this Discord request:
  let sandbox: ReturnType<typeof Sandbox.create> | undefined;
  let exportedBytes = 0;

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
          token: railwayToken,
          authType: "project-token",
          idleTimeoutMinutes: 5,
          networkIsolation: "ISOLATED",
        });
        const creation = sandbox;
        try {
          await creation;
        }
        catch (error) {
          if (sandbox === creation) sandbox = undefined;
          throw error;
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
        if (sandbox === undefined) throw new Error("Call createRailwaySandbox first");
        const vm = await sandbox;
        return vm.execHttp(command, { timeoutSec: 60 });
      },
    }),
    uploadRailwayAttachment: tool({
      description: "Copy a Discord attachment from the current Discord conversation into the current Railway VM. The file can be up to 10 MiB.",
      inputSchema: z.object({
        attachmentId: z.string().describe("Attachment ID from the current Discord conversation"),
        path: z.string().startsWith("/").max(1024).describe("Absolute path in the Linux sandbox"),
      }),
      execute: async ({ attachmentId, path }) => {
        if (sandbox === undefined) throw new Error("Call createRailwaySandbox first");
        const vm = await sandbox;

        // Resolve the attachment and enforce its size limit:
        const maxFileBytes = 10 * 1024 * 1024;
        const file = attachmentUrls.get(attachmentId);
        if (file === undefined) throw new Error("Attachment ID not found in this reply context");
        if (file.size > maxFileBytes) throw new Error("Discord attachment exceeds 10 MiB");

        // Download the attachment and write it to the VM:
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
      inputSchema: z.object({ path: z.string().startsWith("/").max(1024).describe("Absolute path in the Linux sandbox"), content: z.string().max(64000) }),
      execute: async ({ path, content }) => {
        if (sandbox === undefined) throw new Error("Call createRailwaySandbox first");
        const vm = await sandbox;
        await vm.files.write(path, content);
        return { path };
      },
    }),
    downloadRailwayFile: tool({
      description: "Export a file from the current Railway VM. Pass the resulting attachmentRef to sendReply or sendMessage. Use attachmentRefs to attach several files. Exports are limited to 10 MiB per file and 25 MiB per request.",
      inputSchema: z.object({
        path: z.string().startsWith("/").max(1024).describe("Absolute path in the Linux sandbox"),
        name: z.string().min(1).max(128).regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u).describe("Filename shown in Discord, including its extension"),
      }),
      outputSchema: z.object({ attachmentRef: z.uuid() }),
      execute: async ({ path, name }) => {
        if (sandbox === undefined) throw new Error("Call createRailwaySandbox first");
        const vm = await sandbox;

        // Read the output within the per-file and per-request limits:
        const maxFileBytes = 10 * 1024 * 1024;
        const maxExportedBytes = 25 * 1024 * 1024;
        const limit = Math.min(maxFileBytes, maxExportedBytes - exportedBytes);
        const bytes = await vm.files.read(path, { format: "bytes", length: limit + 1 });
        if (bytes.length > maxFileBytes || bytes.length + exportedBytes > maxExportedBytes) throw new Error("Sandbox output exceeds the file or request size limit");

        // Register the exported file for this Discord response:
        exportedBytes += bytes.length;
        const attachmentRef = randomUUID();
        replyAttachments.set(attachmentRef, { attachment: Buffer.from(bytes), name });
        return { attachmentRef };
      },
    }),
    destroyRailwaySandbox: tool({
      description: "Destroy the current Railway VM. Call this once commands and exports are finished, before replying. Exported attachment references remain usable after destruction.",
      inputSchema: z.object({}),
      execute: async () => {
        // Release the current VM without clearing a replacement created concurrently:
        const current = sandbox;
        if (current === undefined) return { status: "destroyed" };

        const vm = await current;
        await vm.destroy();
        if (sandbox === current) sandbox = undefined;
        return { status: "destroyed" };
      },
    }),
  };
};
