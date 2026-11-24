import { Sandbox } from "railway";

export const createRailwaySandbox = async (token: string) => Sandbox.create({
  token,
  authType: "project-token",
  idleTimeoutMinutes: 5,
  networkIsolation: "ISOLATED",
});
