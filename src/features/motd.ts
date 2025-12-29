import { discordClient } from "#/discord";
import { newsTools } from "#/tools/news";
import { aiModels } from "#/utils/ai-model";
import { generateText, Output } from "ai";
import { Cron } from "croner";
import dedent from "dedent";
import { ActivityType } from "discord.js";
import z from "zod";

const job = new Cron("0 0 * * *", async () => {
  if (!discordClient.user) throw new Error("Discord bot user is not available");

  // Generate MOTD:
  const motd = await generateText({
    model: aiModels.mistralLarge,
    output: Output.object({
      schema: z.object({
        emoji: z.string().describe("Un seul emoji unicode pertinent"),
        text: z.string().describe("Le texte du status sans emoji (33 caractères maximum)"),
      }),
    }),
    prompt: dedent`
      
    `,
    tools: {
      ...newsTools,
      // ...
    },
  });

  // Update Discord presence:
  discordClient.user.setPresence({
    status: "online",
    activities: [{
      name: "Custom",
      type: ActivityType.Custom,
      state: `${motd.output.emoji} ${motd.output.text}`,
    }],
  });
});

await job.trigger();
