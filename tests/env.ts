import { loadEnvFile } from "node:process";

// Imported by both the global setup (spawns the server, resets the DB) and
// individual test files (need the DB URL to assert state the API responses
// don't echo back, e.g. an edited segment's new start/end times). Node's
// built-in loader (stable since v20.12) avoids pulling in dotenv just for
// this — fine here since this module is always the first thing to touch
// these vars in a fresh vitest worker, so there's nothing to override.
loadEnvFile(".env.test");

export const TEST_PORT = 3100;
export const BASE_URL = `http://localhost:${TEST_PORT}`;
export const DATABASE_URL = process.env.DATABASE_URL!;
