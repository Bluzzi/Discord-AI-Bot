import { createOpenAI } from "@ai-sdk/openai";
import { env } from "#/utils/env";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL });

export const aiModel = openai(env.OPENAI_MODEL);
