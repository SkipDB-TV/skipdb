import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { json, apiError } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/password";
import { createUserSession } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { READ_ONLY, readOnlyError } from "@/lib/read-only";

export const runtime = "nodejs";

// Well-formed scrypt hash that matches no password. Verified against when the
// email is unknown (or has no password) so the response takes the same time
// either way — otherwise timing would reveal which emails are registered.
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

export async function POST(req: Request) {
  if (READ_ONLY) return readOnlyError();
  const rl = rateLimit(`login:${clientIp(req)}`, 10);
  if (!rl.ok) return apiError("Too many attempts. Try again shortly.", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid email or password", 401);
  const { email, password } = parsed.data;

  const user = (await db.select().from(users).where(eq(users.email, email)))[0];

  // Generic error to avoid leaking which emails are registered.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return apiError("Invalid email or password", 401);

  await createUserSession(user.id);
  return json({ ok: true, user: { email: user.email } });
}
