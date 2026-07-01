import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { DATABASE_URL } from "./env";

export { BASE_URL } from "./env";

/**
 * A fresh email per call so tests can register independent users without
 * colliding. Uses a real, MX-having domain — `/api/register` does a live DNS
 * lookup and rejects domains without one (e.g. example.com has none).
 */
export function uniqueEmail(): string {
  return `skipdb-test-${randomUUID()}@gmail.com`;
}

export const TEST_PASSWORD = "correct horse battery staple";

/**
 * Raw read of a segment row, for assertions on fields the API doesn't echo
 * back in its responses (e.g. PATCH only returns status/reasons, not the new
 * start/end times).
 */
export async function getSegmentRow(id: number): Promise<{
  start_ms: number;
  end_ms: number;
  status: string;
  submitted_by: string | null;
} | null> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // start_ms/end_ms are bigint columns — cast to int so node-postgres
    // returns JS numbers instead of strings (its default for int8/bigint).
    const { rows } = await client.query(
      `select start_ms::int as start_ms, end_ms::int as end_ms, status, submitted_by
       from segments where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  } finally {
    await client.end();
  }
}
