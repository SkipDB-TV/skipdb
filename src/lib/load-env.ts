import { loadEnvFile } from "node:process";

/**
 * Loads `.env` into process.env for standalone scripts (migrations, seed,
 * dump import/export, drizzle-kit config) that run outside Next.js's own env
 * loading. Node's built-in loader (stable since v20.12) replaces the
 * `dotenv` package.
 *
 * Import this for its side effect only, as the first import in the entry
 * file — e.g. `import "./load-env";` — so it runs before any sibling import
 * (like `@/db`) that reads `process.env` at module load time. A plain
 * statement placed before those imports would NOT work: import declarations
 * are evaluated before a module's own top-level statements regardless of
 * where they're written, but imports *do* run in the order listed relative
 * to each other — which this relies on.
 *
 * Swallows the "file not found" case — some of these scripts run in CI
 * (e.g. the data-export GitHub Action) where real env vars are injected
 * directly and no `.env` file is checked out.
 */
try {
  loadEnvFile();
} catch {
  // no .env file — fine, real env vars are expected to already be set
}
