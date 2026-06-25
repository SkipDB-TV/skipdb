import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { sessions } from "@/db/schema";

const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days, matching Auth.js default

/** Whether Auth.js would use secure cookies (https deployment). */
function isSecureCookies(): boolean {
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  return url.startsWith("https://");
}

/** The session cookie name Auth.js v5 reads, matching its secure-prefix logic. */
export function sessionCookieName(): string {
  return isSecureCookies()
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

/**
 * Create a database session for a user and set the Auth.js-compatible session
 * cookie. This lets email/password logins produce the exact same session that
 * `auth()` reads for OAuth and magic-link logins — no JWT strategy needed.
 */
export async function createUserSession(userId: string): Promise<void> {
  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_S * 1000);

  await db.insert(sessions).values({ sessionToken, userId, expires });

  const store = await cookies();
  store.set(sessionCookieName(), sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecureCookies(),
    expires,
  });
}
