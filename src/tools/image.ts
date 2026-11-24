import { generateOpenRouterImage } from "#/integrations/openrouter";
import { tool } from "ai";
import { z } from "zod";

export const createImageTools = (registerAttachment: (file: { attachment: Buffer; name: string }) => string) => ({
  generateImage: tool({
    description: "Generate one image from text when the user requests it. Pass the returned attachmentRef to sendReply or sendMessage to attach the image to the final response.",
    inputSchema: z.object({
      prompt: z.string().trim().min(1).max(4000).describe("Visual description of the image to generate"),
    }),
    outputSchema: z.object({ attachmentRef: z.uuid() }),
    execute: async ({ prompt }) => {
      const attachment = await generateOpenRouterImage(prompt);
      return { attachmentRef: registerAttachment(attachment) };
    },
  }),
});
