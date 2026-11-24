# Turso / libSQL migration

The production app selects Turso when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are configured. The root `drizzle/0001_productive_daredevil.sql` migration is MySQL SQL; do not run it against Turso.

The reported settings query can result from missing application tables or an owner row. PostQueue runs an additive, idempotent SQLite bootstrap when it first connects to Turso. It creates `users`, `posts`, `postSettings`, and the posts user lookup index only when they are absent. It does not alter or delete existing tables or rows; existing `users` tables and rows are left unchanged.

`0001_postqueue_tables.sql` is the versioned SQL equivalent for manual inspection or recovery. The runtime statements are in `server/turso-schema.ts`. Do not run `pnpm db:push` for Turso; that command follows the MySQL configuration.
