import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * A user "uses social login" if they have a linked OAuth account (GitHub,
 * Google, …). Those users' name/email are owned by the provider, so we don't
 * let them edit those fields here. Email-password and magic-link users have no
 * accounts row and can edit freely.
 */
export async function usesSocialLogin(userId: string): Promise<boolean> {
  const rows = await db
    .select({ provider: accounts.provider })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);
  return rows.length > 0;
}
