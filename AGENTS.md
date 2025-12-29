# Discord AI Bot – Tool-Driven

An AI bot for Discord designed to act freely using various tools.  

## Key Patterns

- **Triggered by anything** – messages, voice activity, scheduled tasks…  
- **Tool-driven code** – the AI uses code and APIs as tools to act, instead of being constrained by pre-written scripts.  
- **Acts freely** – minimal constraints, sometimes too free.  
- **Natural behavior** – integrates seamlessly, reacts like a real user.  

> The focus is on giving the AI tools to solve problems, not writing code to control the AI.

## Project Stack

- **Node.js v24.11.0 (LTS)** is used as the runtime.
  Node.js-specific APIs are therefore allowed and expected.

- **PNPM** is the only package manager used in this project.  
  Other package managers MUST NOT be used.

- **TypeScript** and **ESLint** are used to enforce code quality.  
  After any codebase update, the following commands MUST be executed and all reported errors MUST be fixed:
  - `pnpm run ts:check` — checks for TypeScript errors.
  - `pnpm run lint:fix` — automatically fixes ESLint errors when possible and reports remaining ones.

## Global Guidelines

- **No `try` / `catch` blocks are allowed in high-level functions.**  
  Error handling is intentionally centralized in a small number of low-level functions written by human developers.  
  In high-level functions, errors MUST be propagated using:
  ```ts
  throw new Error("Details");
  ```

- **Naming conventions**
  - Folder and file names MUST use `kebab-case`
  - Variable names MUST use `camelCase`

- Use of `dedent` for multi-line strings, allowing clean and consistent indentation to be preserved.

## Protected Areas (Read-Only)

The following files and directories are **STRICTLY read-only** and MUST NOT be modified:

- `.github/**`
- `.gitignore`
- `AI_POLICY.md`
- `eslint.config.js`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`

Instead of editing these files, the AI can suggest changes to the developer and then let the developer apply them before proceeding with the update.
