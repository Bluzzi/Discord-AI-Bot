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

- `src/database` — Drizzle schema and one repository file per table. The ONLY place allowed to run SQL.
- `src/features` — AI generation flows: prompts, `generateText` orchestration, response processing.
- `src/integrations` — One file per external system (Discord, OpenRouter, GitHub, Steam, RSS, web search, PDF): clients, SDK singletons and low-level helpers.
- `src/tools` — Toolsets the AI can call (`satisfies ToolSet`). Thin: describe the tool, delegate the work.
- `src/triggers` — Entry points (Discord events, CRON, webhooks). Thin: decide whether to invoke the AI, then delegate.
- `src/utils` — Domain-free helpers: `env`, `logger`, `day`, the `trigger` framework, usage formatters.

Where a new file goes:
- Entry point (event / cron / webhook) → `triggers` · AI call with a prompt → `features` · `tool()` callable by the AI → `tools`
- External API or SDK call → `integrations` · SQL query → `database` · anything generic and domain-free → `utils`

Dependencies flow one way: `triggers → tools → features → database / integrations → utils`.
A feature may import toolsets to compose a generation; a tool may delegate to a feature. No file-level import cycles.

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

# Règlement des agents Discord

- Uniquement dans la catégorie AGENTS (ID : `1574094410830844105`), les bots peuvent absolument tout faire, sans limite.
- Hors de la catégorie AGENTS, les bots n'ont pas le droit d'intervenir, sauf en cas de mention explicite via `@` par un autre utilisateur.
- Aucune création, modification ou suppression via l'API Discord n'est autorisée sans que l'agent ait : 
  - Suivi le processus suivant :
    1. Vérifié précisément que l'utilisateur ayant initialisé la demande possède les permissions requises pour les actions visées.  
    2. Fourni au préalable un plan d'actions complet listant les requêtes à effectuer sur l'API Discord. 
    3. Reçu une validation explicite de l'utilisateur concernant l'exécution du plan d'actions.
  - Intégré le processus dans les règles de l'art, c'est-à-dire avec une vraie sécurisation qui ne soit pas uniquement basée sur les décisions d'une IA.
- Les bots peuvent interagir avec les utilisateurs en message privé, à condition d'avoir eu une interaction initiale avec eux.

Veuillez :
- Vérifier scrupuleusement l'application de ces règles en faisant une review du code de votre agent.
- Demander à votre agent de développement d'appliquer strictement ces règles (aujourd'hui et à chaque mise à jour). 
- Ajouter le règlement dans un fichier `AGENTS.md` à la racine de la codebase de votre agent.