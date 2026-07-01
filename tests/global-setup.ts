import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { TEST_PORT, BASE_URL, DATABASE_URL } from "./env";

const TSCONFIG_PATH = "tsconfig.json";

/** Recreate the test database from scratch so every run starts clean. */
async function resetTestDatabase() {
  const url = new URL(DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, "");

  const maintenanceUrl = new URL(DATABASE_URL);
  maintenanceUrl.pathname = "/postgres";

  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    // FORCE (PG 13+) drops even if a previous run left connections open.
    await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }
}

async function runMigrations() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  await pool.end();
}

async function waitForServer(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 429) return; // server is up and responding
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server at ${url} did not become ready in time: ${lastError}`);
}

export default async function globalSetup() {
  console.log(`[tests] Resetting test database…`);
  await resetTestDatabase();

  console.log(`[tests] Running migrations…`);
  await runMigrations();

  // Next.js auto-patches tsconfig.json's `include` with references to each
  // distDir it manages (for generated route types). Since the test server
  // runs its own distDir (see next.config.mjs) alongside a possibly-running
  // `pnpm dev`, it does this to our real, tracked tsconfig.json — snapshot it
  // now and restore it verbatim once the test server is gone.
  const tsconfigSnapshot = readFileSync(TSCONFIG_PATH, "utf8");

  console.log(`[tests] Starting test server on port ${TEST_PORT}…`);
  // Spawn the `next` binary directly rather than via `npx next` — npx adds a
  // wrapper process, and if it doesn't reliably forward our kill signal to
  // its `next` child, the real process can outlive our shutdown wait and
  // write to tsconfig.json again after we've already restored it below.
  const server: ChildProcess = spawn(
    "node_modules/.bin/next",
    ["dev", "-p", String(TEST_PORT)],
    {
      // SKIPDB_TEST_SERVER routes this instance to a separate distDir (see
      // next.config.mjs) so its dev-server lockfile doesn't collide with an
      // already-running `pnpm dev` in the same checkout.
      env: { ...process.env, SKIPDB_TEST_SERVER: "1" },
      stdio: process.env.CI ? "pipe" : "ignore",
    },
  );

  server.on("exit", (code) => {
    if (code != null && code !== 0) {
      console.error(`[tests] Test server exited early with code ${code}`);
    }
  });

  await waitForServer(`${BASE_URL}/api/dump`, 60_000);
  console.log(`[tests] Test server ready.`);

  return async () => {
    // Wait for the process to actually exit before restoring tsconfig.json —
    // otherwise its own shutdown could still be mid-write to the file. Force
    // it if it ignores SIGTERM rather than racing a timeout, since a
    // still-alive process could write to tsconfig.json after we restore it.
    const exited = new Promise<void>((resolve) => server.once("exit", () => resolve()));
    server.kill("SIGTERM");
    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(true), 10_000)),
    ]);
    if (timedOut) {
      server.kill("SIGKILL");
      await exited;
    }
    writeFileSync(TSCONFIG_PATH, tsconfigSnapshot);
  };
}
