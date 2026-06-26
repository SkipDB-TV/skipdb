import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

// Reuse the pool across invocations (dev hot reloads + warm Vercel Lambdas).
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString,
    max: 2, // serverless: one request per instance, small pool avoids connection exhaustion
  });

globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
