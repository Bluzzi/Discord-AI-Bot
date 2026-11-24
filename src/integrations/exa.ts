import { env } from "#/utils/env";
import Exa from "exa-js";

// Resolve the API key on request so an empty key only fails web search:
export const exa = new Exa(() => env.EXA_API_KEY, {
  baseURL: "https://api.exa.ai",
  fetch: async (input, init) => fetch(input, { ...init, redirect: "error" }),
});
