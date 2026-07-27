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
  votes_up: number;
  votes_down: number;
  score: number;
} | null> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // start_ms/end_ms are bigint columns — cast to int so node-postgres
    // returns JS numbers instead of strings (its default for int8/bigint).
    const { rows } = await client.query(
      `select start_ms::int as start_ms, end_ms::int as end_ms, status, submitted_by,
              votes_up, votes_down, score
       from segments where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  } finally {
    await client.end();
  }
}

/**
 * Raw read of a user row by email — register/login never echo back the
 * user's id or reputation, but tests need both to promote a test account to
 * staff and to assert reputation changes after a disable/vote-purge.
 */
export async function getUserByEmail(email: string): Promise<{
  id: string;
  role: "user" | "moderator" | "admin";
  reputation: number;
  disabled: boolean;
} | null> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select id, role, reputation, disabled from users where email = $1`,
      [email],
    );
    return rows[0] ?? null;
  } finally {
    await client.end();
  }
}

/**
 * Directly promote a test account to staff — there's no API for this (by
 * design), so admin-endpoint tests reach past the app to set it up.
 */
export async function setUserRole(
  id: string,
  role: "user" | "moderator" | "admin",
): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`update users set role = $1 where id = $2`, [role, id]);
  } finally {
    await client.end();
  }
}

/** Count of vote rows still owned by a user — used to assert a purge worked. */
export async function countVotesByUser(userId: string): Promise<number> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select count(*)::int as count from votes where user_id = $1`,
      [userId],
    );
    return rows[0].count;
  } finally {
    await client.end();
  }
}
