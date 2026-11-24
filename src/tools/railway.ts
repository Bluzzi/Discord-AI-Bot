import { downloadDiscordAttachment } from "#/integrations/discord.helper";
import { connectRailwaySandbox, railwayFileSchema } from "#/integrations/railway.helper";
import { env } from "#/utils/env";
import { tool } from "ai";
import { Sandbox } from "railway";
import { z } from "zod";

const sandboxInput = railwayFileSchema.pick({ sandboxId: true });
const fileInput = railwayFileSchema.pick({ sandboxId: true, path: true });
const discordAttachment = z.object({ attachment: z.object({ url: z.string(), size: z.number() }) });

export const railwayTools = {
  createRailwaySandbox: tool({
    description: "Create an isolated Linux VM. Create it once and pass the returned sandboxId to later tools. It expires after 5 minutes of inactivity.",
    inputSchema: z.object({}),
    execute: async () => {
      // Create the VM and return its ID for subsequent calls:
      const token = env.RAILWAY_TOKEN;
      if (token === undefined) throw new Error("Railway is not configured");
      const sandbox = await Sandbox.create({ token, authType: "project-token", idleTimeoutMinutes: 5, networkIsolation: "ISOLATED" });
      return { sandboxId: sandbox.id };
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
    description: "Copy a Discord attachment into the Railway VM. Use its URL from getReplyContext. Max 10 MiB.",
    inputSchema: fileInput.extend({ url: z.url() }),
    execute: async ({ sandboxId, url, path }, { messages }) => {
      // Limit downloads to Discord attachments listed in the preloaded conversation:
      const maxBytes = 10 * 1024 * 1024;
      const isAvailable = messages.some((message) => message.role === "tool" && message.content.some((part) => part.type === "tool-result" && part.toolName === "getReplyContext"
        && part.output.type === "content" && part.output.value.some((item) => {
        if (!("text" in item)) return false;
        const metadata: unknown = JSON.parse(item.text);
        const result = discordAttachment.safeParse(metadata);
        return result.success && result.data.attachment.url === url && result.data.attachment.size <= maxBytes;
      }),
      ));
      if (!isAvailable) throw new Error("Attachment is missing from this conversation or exceeds 10 MiB");

      // Download the attachment within the size limit and write it to the VM:
      const sandbox = await connectRailwaySandbox(sandboxId, messages);
      const bytes = await downloadDiscordAttachment(url, maxBytes, AbortSignal.timeout(20_000));
      await sandbox.files.write(path, bytes);
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
      const sandbox = await connectRailwaySandbox(sandboxId, messages);
      await sandbox.destroy();
      return { status: "destroyed" };
    },
  }),
};
