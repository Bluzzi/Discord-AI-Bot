import { eslintConfig } from "@bluzzi/eslint-config";

export default eslintConfig(
  {
    typescript: { tsconfigPath: "./tsconfig.json" },
  },
  {
    rules: {
      "@typescript-eslint/no-misused-promises": "off",
    },
  },
  {
    ignores: [
      "src/tools/discord.ts",
      "src/tools/giphy.ts",
      "src/tools/github.ts",
      "src/tools/igdb.ts",
      "src/tools/image.ts",
      "src/tools/news.ts",
      "src/tools/pastebin.ts",
      "src/tools/pdf.ts",
      "src/tools/school-42.ts",
      "src/tools/steam.ts",
      "src/tools/websearch.ts",
    ],
  },
);
