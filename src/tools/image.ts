import { generateOpenRouterImage } from "#/integrations/openrouter";
import { tool } from "ai";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const createImageTools = () => {
  const attachments = new Map<string, Awaited<ReturnType<typeof generateOpenRouterImage>>>();

  return {
    tools: {
      generateImage: tool({
        description: "Generate one image from text when the user requests it. Pass the returned attachmentRef to sendReply or sendMessage to attach the image to the final response.",
        inputSchema: z.object({
          prompt: z.string().trim().min(1).max(4000).describe("Visual description of the image to generate"),
        }),
        outputSchema: z.object({ attachmentRef: z.uuid() }),
        execute: async ({ prompt }) => {
          const attachment = await generateOpenRouterImage(prompt);
          const attachmentRef = randomUUID();
          attachments.set(attachmentRef, attachment);
          return { attachmentRef };
        },
      }),
    },
    resolveAttachment: (attachmentRef: string) => {
      const attachment = attachments.get(attachmentRef);
      if (attachment === undefined) throw new Error("Attachment not found in this conversation run");
      return attachment;
    },
  };
};
