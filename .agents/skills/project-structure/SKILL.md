---
name: project-structure
description: MUST be loaded before creating any new file under src/ or whenever there is doubt about where to place a file or code in Discord Agent. Covers the repository layout, source file locations, naming conventions, and how new modules connect to the application.
---

# Project structure

Use this skill to choose the existing module or the exact path and filename for new code. Start with the code's responsibility and inspect the nearest reference implementation.

## Source layout

Use lowercase English kebab-case for filename stems. In the patterns below, each placeholder represents a kebab-case name.

| Responsibility | Path and naming |
| --- | --- |
| Application startup and registration of startup modules | `src/main.ts`. Use the existing entry point. |
| Configure and export an SDK, ORM, or library instance | `src/integrations/<integration>.client.ts`. Name the file after the integration the module exposes. `ai-sdk.client.ts` configures the model used by AI SDK through the OpenRouter provider. `openrouter.client.ts` initializes the official OpenRouter SDK. |
| Reusable code specific to one integration | `src/integrations/<integration>.helper.ts` for general helpers, or `src/integrations/<integration>.helper-<purpose>.ts` for a focused helper. Match the prefix of the corresponding client. For example, OpenRouter quota tracking lives in `openrouter.helper-quota.ts`. |
| Model-callable tools and their input schemas | `src/tools/<domain>.ts`, grouped by capability such as `web.ts` or `discord.ts`. Use `<domain>-<purpose>.ts` for a distinct group such as `discord-approval.ts`. |
| Discord.js event handler | `src/triggers/<event-name>.djs-event.ts`. Convert the Discord.js event name to kebab-case for the filename and pass the original name to `trigger.discordEvent`. For example, `messageCreate` lives in `message-create.djs-event.ts`. |
| Scheduled job | `src/triggers/<job-name>.cron.ts`. Name it after the task, such as `openrouter-quota.cron.ts`, and register it with `trigger.cron`. |
| Drizzle table definition | `src/tables/<table-name>.ts`. Use the singular table name in kebab-case for the file, snake_case for the SQL identifier, and `table<PascalCaseName>` for the exported table. Keep column definitions and table-specific enums with the table. |
| Shared utility | `src/utils/<purpose>.ts`. Use a short name such as `attempt.ts` or `web-content.ts`. Shared runtime setup such as environment validation and logging lives in the existing `env.ts` and `logger.ts` modules. |

Keep feature-specific workflow code in the function handling the feature. For example, a tool declares its schema and executes its action in the matching tool module, and message handling stays in the message event handler. Place reusable integration policy such as Discord tool permissions in the integration helper. See [discord-tools](../discord-tools/SKILL.md) for Discord approval and permission requirements.

Use the `#/` alias for source imports across folders. A trigger registers when its module is imported. Connect new triggers to the relevant startup import chain and preserve its timing. The message event is imported before Discord login and the quota job is imported after login. The interaction event is reached through the message event's import of the approval handler.

## Repository layout outside src

| Path | Responsibility |
| --- | --- |
| `drizzle.config.ts` | Drizzle Kit configuration. Reads schema definitions from `src/tables/` and writes migrations to `drizzle/`. |
| `drizzle/` and `drizzle/meta/` | Migration SQL, Drizzle snapshots, and the migration journal. See [database-migrations](../database-migrations/SKILL.md) for the migration workflow. |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Package scripts and declarations, pnpm workspace settings, and resolved dependencies. |
| `tsconfig.json`, `eslint.config.js` | TypeScript settings and source aliases, and ESLint configuration. |
| `Dockerfile`, `.github/workflows/ci.yml` | Container build and automated CI workflow. |
| `README.md`, `AGENTS.md`, `.agents/skills/` | Project documentation, repository-wide agent instructions, and on-demand skills. Follow the `skill` skill when modifying a skill. |
| `.gitignore` | Version-control exclusions. |

## Constraints

- MUST inspect existing modules with the same responsibility before choosing a destination or creating a file.
- MUST extend the existing owning module when it already covers the responsibility. Keep names consistent with the patterns above.
- MUST ask the user before adding or moving the affected code if there is any doubt about where the file or code belongs. Explain the ambiguity and give the plausible paths when available.
- MUST ask the user before introducing a new source directory or a filename convention that the project has not established.
