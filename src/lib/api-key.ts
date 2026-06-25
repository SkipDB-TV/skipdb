import { createHash, randomBytes } from "node:crypto";
import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const PREFIX = "skdb_";

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Generate a new API key for a user, revoking any previous active key.
 * Returns the plaintext key ONCE — it is never stored or shown again.
 */
export async function generateApiKey(userId: string): Promise<{
  key: string;
  prefix: string;
}> {
  const secret = randomBytes(24).toString("base64url");
  const key = `${PREFIX}${secret}`;
  const keyHash = hashKey(key);
  const keyPrefix = key.slice(0, PREFIX.length + 4); // e.g. skdb_a1b2

  // Revoke existing active keys (one active key per user).
  await db
    .update(apiKeys)
    .set({ revoked: true })
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.revoked, false)));

  await db.insert(apiKeys).values({ userId, keyHash, keyPrefix });
  return { key, prefix: keyPrefix };
}

export async function revokeApiKeys(userId: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({ revoked: true })
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.revoked, false)));
}

/** Look up the user owning a (non-revoked) API key, updating last-used. */
export async function userForApiKey(plaintext: string) {
  if (!plaintext.startsWith(PREFIX)) return null;
  const keyHash = hashKey(plaintext);
  const rows = await db
    .select({ key: apiKeys, user: users })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.revoked, false)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // best-effort touch; don't block the request on it
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.key.id))
    .catch(() => {});
  return row.user;
}

/** Return the active key metadata (prefix only) for display in the UI. */
export async function activeKeyInfo(userId: string) {
  const rows = await db
    .select({
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.revoked, false)))
    .limit(1);
  return rows[0] ?? null;
}
