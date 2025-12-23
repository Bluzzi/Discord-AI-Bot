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
    ignores: ["**/tools"],
  },
);
