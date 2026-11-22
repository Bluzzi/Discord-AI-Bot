# Discord AI Bot – Tool-Driven

An AI bot for Discord designed to act freely using various tools.  

## Key Patterns

- **Triggered by anything** – messages, voice activity, scheduled tasks…  
- **Tool-driven code** – the AI uses code and APIs as tools to act, instead of being constrained by pre-written scripts.  
- **Acts freely** – minimal constraints, sometimes too free.  
- **Natural behavior** – integrates seamlessly, reacts like a real user.  

> The focus is on giving the AI tools to solve problems, not writing code to control the AI.

## Agent approach
- Be ultra-pragmatic: never over-engineer, never build anything that was not asked for, always prefer absolute simplicity.
- Read the existing code before implementing: rely on the content of the files and folders mentioned in the request, and search the codebase for similar examples to follow their syntax, structure and logic.
- If something extra genuinely deserves to be added (technical, security, optimization or clarity reasons) but is not part of the request and requires more code than asked: do not implement it, recommend it to the user instead and let them decide.

## Project Stack

- **Node.js v24.11.0 (LTS)** is used as the runtime.
  Node.js-specific APIs are therefore allowed and expected.

- **PNPM** is the only package manager used in this project.  
  Other package managers MUST NOT be used.

- **TypeScript** and **ESLint** are used to enforce code quality.  
  After any codebase update, the following commands MUST be executed and all reported errors MUST be fixed:
  - `pnpm run ts:check` — checks for TypeScript errors.
  - `pnpm run lint:fix` — automatically fixes ESLint errors when possible and reports remaining ones.

## Project Structure

Flat layout under `/src`: only folders, only `.ts` files inside them, one `main.ts` at the root.

- `src/tables` — Drizzle schema, one file per table.
- `src/integrations` — One file per external system (Discord, OpenRouter, GitHub, Steam, RSS, web search, PDF): clients, SDK singletons and low-level helpers.
- `src/tools` — Toolsets the AI can call (`satisfies ToolSet`). Thin: describe the tool, delegate the work.
- `src/triggers` — Entry points (Discord events, CRON, webhooks), AI generation flows and their usage tracking.
- `src/utils` — Shared helpers, including `postgres` for the Drizzle client, migrations and reusable columns.

Where a new file goes:
- Entry point or AI generation flow → `triggers` · `tool()` callable by the AI → `tools`
- External API or SDK call → `integrations` · Drizzle table definition → `tables` · shared helper → `utils`

Dependencies flow one way: `triggers → tools / tables / integrations → utils`. No file-level import cycles.

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
