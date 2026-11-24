# Discord Agent

Discord Agent is a conversational bot. Mention it to get a concise answer that follows the conversation and uses Discord Markdown for links, mentions, and code.

Consult [README.md](README.md) for details about the bot's features and service architecture, including cloud infrastructure and external services.

## Feature requirements

- Start an AI response when the message explicitly `@` mentions the bot or replies directly to a message from the bot. A direct reply is sufficient with or without Discord's automatic reply ping. Role mentions and `@everyone` are insufficient on their own.
- Change prompts sent to the model only when the user explicitly requests the change. When adding or updating a tool, keep its model-facing descriptions and schema text as concise and direct as possible. Preserve the bot's behavior unless the user explicitly requests a behavior change.
- When adding or changing a Discord tool, keep its input schema and permission rule aligned in [src/tools/discord.ts](src/tools/discord.ts) and [src/integrations/discord-permissions.helper.ts](src/integrations/discord-permissions.helper.ts). Use the shared rules to filter the tools offered to the model and enforce the original requester's effective Discord permissions on the actual targets. Check the relevant server, channel or thread, and role or member hierarchy where applicable. The bot's own permissions cannot authorize an action on the requester's behalf.
- Only `sendReply` and `sendMessage` may bypass the requester's Discord permission checks when responding in the channel that triggered the current run, including when attaching files. `sendReply` must target the triggering message. `sendMessage` to another channel requires the requester's effective permissions there, and run-scoped attachment references may only be used in the originating channel.
- Route all Discord tools that create, modify, or delete resources other than messages through `proposeDiscordActions`. Validate the exact inputs and the requester's permissions before presenting the plan. Wait for the original requester to click **Approve** on the pending request, then fetch their current membership and recheck permissions for each action before executing it. Reject the action if the permission check fails. Message operations are exempt from the mandatory approval rule and still follow their applicable Discord permission and conversation checks. [Approval handler](src/triggers/interaction-create.djs-event.ts)

## Development approach

- Be ultra-pragmatic: never over-engineer, never build anything that was not asked for, always prefer absolute simplicity.
- Read the existing code before implementing: rely on the content of the files and folders mentioned in the request, and search the codebase for similar examples to follow their syntax, structure and logic.
- If something extra genuinely deserves to be added (technical, security, optimization or clarity reasons) but is not part of the request and requires more code than asked: do not implement it, recommend it to the user instead and let them decide.

## Code rules

- **Keep the full workflow in the function that implements it (*locality of behavior*).** Write the steps in execution order. A long function is fine if it reads clearly from top to bottom. Extract a function only when a genuinely generic utility is essential or a technical constraint requires it. Length alone is insufficient reason to extract a block.
- **Use guard clauses (*early return*, *fail fast*).** Handle cases that interrupt the flow as soon as you detect them, using `return`, `throw`, `continue`, or `break`. Keep the happy path at the outermost indentation level, avoid `else` and `else if`, and end the function with its intended result or action.
- **Name intermediate values when the name adds meaning.** Introduce a `const` when its name clarifies what the result represents or when several steps use the same value. Keep short, obvious expressions inline. A multi-step calculation can stay in the function as a sequence of statements.
- **Prefer duplication to premature abstraction (*AHA*, *Avoid Hasty Abstractions*).** Keep separate implementations for behaviors that can evolve independently. Similar blocks can stay duplicated. Avoid merging them behind a `mode`, `variant`, or `isEdit` parameter.
- **Initialize dependencies separately and use them directly.** Configure and export each SDK, ORM, or library instance from a dedicated module with the minimum setup required. Import the instance where the feature is implemented and call its API directly. Write feature-specific queries and calls at the point of use, without repositories, predefined query helpers, or service wrappers.
- **Import shared values where they are used.** Import shared constants, utilities, and configured instances in the module that uses them. Avoid passing them as props or arguments through functions or components that only forward them. Use props and parameters for inputs supplied by the caller, such as request-specific data.
- **Type the contracts and let TypeScript infer the details.** Annotate signatures when the type expresses a contract the implementation must satisfy. Let TypeScript infer local variable types when their initializers provide enough information. Check explicitly for `null` or `undefined` when that is how the API represents absence.
- **Structure functions around clear intent.** Introduce each logical block with a short English comment that describes its purpose and ends with a colon, such as `// Check whether the item is already archived:`. Use English names that say what each value represents, such as `totalProducts` or `passwordIsValid`.

## Continuous Integration

Run both commands after changing code and fix any errors they report.

- `pnpm run ts:check`
- `pnpm run lint:fix`

## Stack

- The project uses TypeScript and pnpm. It uses Discord.js (`discord.js`) to interact with Discord. [Discord.js documentation](https://discordjs.dev/docs/packages/discord.js/main)
- Vercel AI SDK (`ai`) handles AI generation and tool calling. Model calls go through OpenRouter. [AI SDK documentation](https://ai-sdk.dev/docs/getting-started/nodejs) · [OpenRouter documentation](https://openrouter.ai/docs/quickstart)
- Use Zod (`zod`) to define schemas for AI interactions, such as tool inputs and structured model outputs, and wherever else runtime validation is needed. For responses with a reliable contract, such as those from a trusted API SDK, rely on the SDK's types unless there is a specific reason to validate at runtime. [Zod documentation](https://zod.dev/)
- The `webfetch` and `websearch` tools follow OpenCode's implementations. Use OpenCode as the preferred open-source reference when maintaining these tools. [OpenCode tools documentation](https://opencode.ai/docs/tools/#web)
- Environment variables are listed and documented in [src/utils/env.ts](src/utils/env.ts).
- The project uses PostgreSQL with Drizzle ORM (`drizzle-orm`). The database connection is configured in [src/integrations/postgres.client.ts](src/integrations/postgres.client.ts), and [src/tables](src/tables) defines one table per file. Treat the database used during development as production. Migrations are applied automatically at startup. Create new migrations with `pnpm run db:migration:create`. [Drizzle PostgreSQL documentation](https://orm.drizzle.team/docs/get-started-postgresql)
