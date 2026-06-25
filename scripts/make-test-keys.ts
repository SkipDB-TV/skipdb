import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { users, apiKeys } from "../src/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: { users, apiKeys } });

async function keyFor(email: string, name: string, role: "user" | "moderator") {
  let u = (await db.select().from(users).where(eq(users.email, email)))[0];
  if (!u) {
    u = (await db.insert(users).values({ email, name, role }).returning())[0];
  }
  const key = `skdb_${randomBytes(24).toString("base64url")}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  await db
    .update(apiKeys)
    .set({ revoked: true })
    .where(eq(apiKeys.userId, u.id));
  await db
    .insert(apiKeys)
    .values({ userId: u.id, keyHash, keyPrefix: key.slice(0, 9) });
  return { email, role, key };
}

async function main() {
  const mod = await keyFor("seed@skipdb.local", "SkipDB Seed", "moderator");
  const newbie = await keyFor("newbie@skipdb.local", "Newbie", "user");
  console.log(JSON.stringify({ mod, newbie }, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
