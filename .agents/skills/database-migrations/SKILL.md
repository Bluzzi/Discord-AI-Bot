---
name: database-migrations
description: MUST be loaded before changing a Drizzle table definition, generating or editing a migration, or changing how migrations run at startup. Covers schema changes and migration files.
---

# Database migrations

Drizzle Kit reads the table definitions in [src/tables](../../../src/tables) and writes migrations to [drizzle](../../../drizzle) according to [drizzle.config.ts](../../../drizzle.config.ts). The application applies pending migrations automatically at startup in [src/main.ts](../../../src/main.ts).

## Steps

1. Update the relevant Drizzle table definition.
2. Generate the migration with `pnpm run db:migration:create`.
3. Review the generated SQL and keep it with the corresponding snapshot and journal update in [drizzle/meta](../../../drizzle/meta).

## Constraints

- MUST treat the database used during development as production.
- MUST keep the migration SQL, snapshot, and journal update together.
