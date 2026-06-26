import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { json, apiError } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/password";
import { createUserSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin-emails";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { READ_ONLY, readOnlyError } from "@/lib/read-only";

export const runtime = "nodejs";

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

  const user = (
    await db.select().from(users).where(eq(users.email, email))
  )[0];

  // Generic error to avoid leaking which emails are registered.
  const ok = user && (await verifyPassword(password, user.passwordHash));
  if (!user || !ok) return apiError("Invalid email or password", 401);

  // Keep admin promotion in sync for configured emails.
  if (isAdminEmail(email) && user.role !== "admin") {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
  }

  await createUserSession(user.id);
  return json({ ok: true, user: { email: user.email } });
}
