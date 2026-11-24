import type { ToolSet } from "ai";
import { attempt } from "#/utils/attempt";
import { env } from "#/utils/env";
import { tool } from "ai";
import dedent from "dedent";
import { randomUUID } from "node:crypto";
import { Sandbox } from "railway";
import { z } from "zod";

export type RailwayRunState = { sandbox?: ReturnType<typeof Sandbox.create>; exportedBytes: number };

export const railwayTools: ToolSet = env.RAILWAY_TOKEN === undefined ? {} : {
  createRailwaySandbox: tool({
    description: dedent`
      Create a temporary Linux VM for this Discord request. Use it to merge tournament CSVs and compute standings, plot channel activity from records you can read, convert images and return a ZIP, run a script on sample inputs and report observed results, or for any other relevant task that benefits from a Linux VM.
      Wait for this tool before calling other Railway tools. The VM expires after 5 minutes of inactivity.
    `,
    inputSchema: z.object({}),
    contextSchema: z.object({
      state: z.custom<RailwayRunState>((value) => typeof value === "object" && value !== null),
    }),
    execute: async (_input, { context }) => {
      const token = env.RAILWAY_TOKEN;
      if (token === undefined) throw new Error("Railway sandbox is unavailable");

      // Reuse the current VM while it is still available:
      const previous = context.state.sandbox;
      if (previous !== undefined) {
        const vm = await previous;
        await vm.refresh();
        if (vm.status === "DESTROYED" && context.state.sandbox === previous) context.state.sandbox = undefined;
      }
      // Start an isolated VM and release the cached promise if creation fails:
      context.state.sandbox ??= Sandbox.create({
        token,
        authType: "project-token",
        idleTimeoutMinutes: 5,
        networkIsolation: "ISOLATED",
      });
      const creation = context.state.sandbox;
      const result = await attempt(async () => creation);
      if (!result.ok) {
        if (context.state.sandbox === creation) context.state.sandbox = undefined;
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
    contextSchema: z.object({
      state: z.custom<RailwayRunState>((value) => typeof value === "object" && value !== null),
    }),
    execute: async ({ command }, { context }) => {
      if (context.state.sandbox === undefined) throw new Error("Call createRailwaySandbox first");
      const vm = await context.state.sandbox;
      return vm.execHttp(command, { timeoutSec: 60 });
    },
  }),
  uploadRailwayAttachment: tool({
    description: "Copy a Discord attachment from getReplyContext into the current Railway VM. The file can be up to 10 MiB.",
    inputSchema: z.object({
      attachmentId: z.string().describe("Attachment ID from getReplyContext"),
      path: z.string().startsWith("/").max(1024).describe("Absolute path in the Linux sandbox"),
    }),
    contextSchema: z.object({
      state: z.custom<RailwayRunState>((value) => typeof value === "object" && value !== null),
      attachmentUrls: z.custom<ReadonlyMap<string, { url: string; size: number }>>((value) => value instanceof Map),
    }),
    execute: async ({ attachmentId, path }, { context }) => {
      if (context.state.sandbox === undefined) throw new Error("Call createRailwaySandbox first");
      const vm = await context.state.sandbox;
      const maxFileBytes = 10 * 1024 * 1024;
      const file = context.attachmentUrls.get(attachmentId);
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
    inputSchema: z.object({ path: z.string().startsWith("/").max(1024).describe("Absolute path in the Linux sandbox"), content: z.string().max(64000) }),
    contextSchema: z.object({
      state: z.custom<RailwayRunState>((value) => typeof value === "object" && value !== null),
    }),
    execute: async ({ path, content }, { context }) => {
      if (context.state.sandbox === undefined) throw new Error("Call createRailwaySandbox first");
      const vm = await context.state.sandbox;
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
    contextSchema: z.object({
      state: z.custom<RailwayRunState>((value) => typeof value === "object" && value !== null),
      replyAttachments: z.custom<Map<string, { attachment: Buffer; name: string }>>((value) => value instanceof Map),
    }),
    execute: async ({ path, name }, { context }) => {
      if (context.state.sandbox === undefined) throw new Error("Call createRailwaySandbox first");
      const vm = await context.state.sandbox;
      const maxFileBytes = 10 * 1024 * 1024;
      const maxExportedBytes = 25 * 1024 * 1024;
      const limit = Math.min(maxFileBytes, maxExportedBytes - context.state.exportedBytes);
      const bytes = await vm.files.read(path, { format: "bytes", length: limit + 1 });
      if (bytes.length > maxFileBytes || bytes.length + context.state.exportedBytes > maxExportedBytes) throw new Error("Sandbox output exceeds the file or request size limit");
      context.state.exportedBytes += bytes.length;
      const attachmentRef = randomUUID();
      context.replyAttachments.set(attachmentRef, { attachment: Buffer.from(bytes), name });
      return { attachmentRef };
    },
  }),
  destroyRailwaySandbox: tool({
    description: "Destroy the current Railway VM. Call this once commands and exports are finished, before replying. Exported attachment references remain usable after destruction.",
    inputSchema: z.object({}),
    contextSchema: z.object({
      state: z.custom<RailwayRunState>((value) => typeof value === "object" && value !== null),
    }),
    execute: async (_input, { context }) => {
      const current = context.state.sandbox;
      if (current !== undefined) {
        const vm = await current;
        await vm.destroy();
        if (context.state.sandbox === current) context.state.sandbox = undefined;
      }
      return { status: "destroyed" };
    },
  }),
};
