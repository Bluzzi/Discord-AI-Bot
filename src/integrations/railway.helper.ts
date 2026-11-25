import type { ModelMessage } from "ai";
import { env } from "#/utils/env";
import { Sandbox } from "railway";
import { z } from "zod";

export const railwayFileSchema = z.object({
  sandboxId: z.string().min(1),
  path: z.string().startsWith("/").max(1024),
  name: z.string().min(1).max(128).regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u),
});

export const connectRailwaySandbox = async (sandboxId: string, messages: ModelMessage[]) => {
  // Accept only a sandbox ID returned by a successful tool call in this run:
  const wasCreated = messages.some((message) => message.role === "tool" && message.content.some((part) => part.type === "tool-result"
    && (part.toolName === "createRailwaySandbox" || part.toolName === "createRailwaySandboxWithURL")
    && part.output.type === "json" && typeof part.output.value === "object" && part.output.value !== null
    && "sandboxId" in part.output.value && part.output.value.sandboxId === sandboxId,
  ));
  if (!wasCreated) throw new Error("Sandbox ID not created in this conversation");

  const token = env.RAILWAY_TOKEN;
  if (token === undefined) throw new Error("Railway is not configured");
  return Sandbox.connect(sandboxId, { token, authType: "project-token" });
};

export const readRailwayReplyFiles = async (files: z.infer<typeof railwayFileSchema>[], messages: ModelMessage[]) => {
  // Read the requested files within the Discord attachment budget:
  const attachments: { attachment: Buffer; name: string }[] = [];
  let remainingBytes = 25 * 1024 * 1024;
  for (const { sandboxId, path, name } of files) {
    const sandbox = await connectRailwaySandbox(sandboxId, messages);
    const limit = Math.min(10 * 1024 * 1024, remainingBytes);
    const bytes = await sandbox.files.read(path, { format: "bytes", length: limit + 1 });
    if (bytes.length > limit) throw new Error("Sandbox output exceeds the file or reply size limit");
    remainingBytes -= bytes.length;
    attachments.push({ attachment: Buffer.from(bytes), name });
  }
  return attachments;
};
