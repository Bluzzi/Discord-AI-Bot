import { env } from "#/utils/env";
import Exa from "exa-js";

let exa: Exa | undefined;

export const getExa = () => {
  // Keep configuration errors scoped to web search:
  exa ??= new Exa(env.EXA_API_KEY, {
    baseURL: "https://api.exa.ai",
    fetch: async (input, init) => fetch(input, { ...init, redirect: "error" }),
  });

  return exa;
};
