import { randomInt } from "node:crypto";

export const randomCode = (length: number = 5): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  return Array.from({ length: length }, () => {
    return chars.charAt(randomInt(chars.length));
  }).join("");
};
