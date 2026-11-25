import { postgres } from "#/integrations/postgres.client";
import { connectRailwaySandbox, railwayFileSchema } from "#/integrations/railway.helper";
import { tableRailwaySandbox } from "#/tables/railway-sandbox";
import { env } from "#/utils/env";
import { tool } from "ai";
import { eq } from "drizzle-orm";
import { setTimeout } from "node:timers/promises";
import { Sandbox } from "railway";
import { z } from "zod";

const sandboxInput = railwayFileSchema.pick({ sandboxId: true });
const fileInput = railwayFileSchema.pick({ sandboxId: true, path: true });

export const railwayTools = {
  createRailwaySandbox: tool({
    description: "Create an isolated Linux VM. Create it once and pass the returned sandboxId to later tools. It expires after 5 minutes of inactivity.",
    inputSchema: z.object({}),
    execute: async () => {
      // Create an isolated VM with the usual idle timeout:
      const token = env.RAILWAY_TOKEN;
      if (token === undefined) throw new Error("Railway is not configured");
      const sandbox = await Sandbox.create({ token, authType: "project-token", idleTimeoutMinutes: 5, networkIsolation: "ISOLATED" });

      // Record the VM before returning its ID:
      await postgres.insert(tableRailwaySandbox).values({ sandboxId: sandbox.id, type: sandbox.networkIsolation });
      return { sandboxId: sandbox.id };
    },
  }),
  createRailwaySandboxWithURL: tool({
    description: "Use instead of createRailwaySandbox for a web service that needs a temporary public preview URL. Reuse sandboxId with the same tools. Start the server in the background on 0.0.0.0 at the chosen port before sharing the URL. Keep the VM running while the preview is needed; it expires automatically.",
    inputSchema: z.object({
      port: z.number().int().min(1).max(65535),
      durationMinutes: z.number().int().min(5).max(60),
    }),
    execute: async ({ port, durationMinutes }) => {
      // Request a public HTTPS route for the chosen port:
      const token = env.RAILWAY_TOKEN;
      if (token === undefined) throw new Error("Railway is not configured");
      const sandbox = await Sandbox.create({
        token,
        authType: "project-token",
        idleTimeoutMinutes: durationMinutes,
        networkIsolation: "PRIVATE",
        domains: [{ port }],
      });

      // Persist the fixed deadline before waiting for the domain:
      const expiresAt = new Date(Date.now() + durationMinutes * 60_000);
      await postgres.insert(tableRailwaySandbox).values({ sandboxId: sandbox.id, expiresAt, type: sandbox.networkIsolation });

      // Wait for Railway to publish the route:
      for (let attempt = 0; sandbox.domains.length === 0 && attempt < 15; attempt += 1) {
        await setTimeout(1000);
        await sandbox.refresh();
      }
      const domain = sandbox.domains.find((entry) => entry.port === port);
      if (domain === undefined) throw new Error("Railway did not publish the preview URL");

      // Store and return the public URL and its deadline:
      const previewUrl = `https://${domain.domain}`;
      await postgres.update(tableRailwaySandbox).set({ previewUrl }).where(eq(tableRailwaySandbox.sandboxId, sandbox.id));
      return { sandboxId: sandbox.id, previewUrl, expiresAt: expiresAt.toISOString() };
    },
  }),
  runRailwayCommand: tool({
    description: "Run a shell command in the Railway VM for up to 60 seconds.",
    inputSchema: sandboxInput.extend({ command: z.string().min(1).max(16000) }),
    execute: async ({ sandboxId, command }, { messages }) => {
      const sandbox = await connectRailwaySandbox(sandboxId, messages);
      return sandbox.execHttp(command, { timeoutSec: 60 });
    },
  }),
  uploadRailwayAttachment: tool({
    description: "Copy a file into the Railway VM using the fileId returned by readFile.",
    inputSchema: fileInput.extend({ fileId: z.string().min(1) }),
    execute: async ({ sandboxId, fileId, path }, { messages }) => {
      // Recover the original bytes from the readFile result in this conversation:
      const result = messages.flatMap((message) => message.role === "tool" ? message.content : [])
        .find((part) => part.type === "tool-result" && part.toolName === "readFile" && part.toolCallId === fileId);
      const metadata = result?.type === "tool-result" && result.output.type === "content" ? result.output.value[0] : undefined;
      const data = metadata?.providerOptions?.readFile?.data;
      if (typeof data !== "string") throw new Error("File ID not returned by readFile in this conversation");

      // Write the file directly to the VM:
      const sandbox = await connectRailwaySandbox(sandboxId, messages);
      await sandbox.files.write(path, Buffer.from(data, "base64"));
      return { path };
    },
  }),
  writeRailwayFile: tool({
    description: "Write text to an absolute path in the Railway VM.",
    inputSchema: fileInput.extend({ content: z.string().max(64000) }),
    execute: async ({ sandboxId, path, content }, { messages }) => {
      const sandbox = await connectRailwaySandbox(sandboxId, messages);
      await sandbox.files.write(path, content);
      return { path };
    },
  }),
  destroyRailwaySandbox: tool({
    description: "Destroy the Railway VM when it is no longer needed. Leave it running if sendReply or sendMessage needs to attach its files.",
    inputSchema: sandboxInput,
    execute: async ({ sandboxId }, { messages }) => {
      // Destroy the VM and record the outcome:
      const sandbox = await connectRailwaySandbox(sandboxId, messages);
      if (sandbox.status !== "DESTROYED" && sandbox.status !== "DESTROYING") await sandbox.destroy();
      await postgres.update(tableRailwaySandbox).set({ isDestroy: true }).where(eq(tableRailwaySandbox.sandboxId, sandboxId));
      return { status: "destroyed" };
    },
  }),
};
