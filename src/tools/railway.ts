import { connectRailwaySandbox, railwayFileSchema } from "#/integrations/railway.helper";
import { env } from "#/utils/env";
import { tool } from "ai";
import { Sandbox } from "railway";
import { z } from "zod";

const sandboxInput = railwayFileSchema.pick({ sandboxId: true });
const fileInput = railwayFileSchema.pick({ sandboxId: true, path: true });

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
      const sandbox = await connectRailwaySandbox(sandboxId, messages);
      await sandbox.destroy();
      return { status: "destroyed" };
    },
  }),
};
