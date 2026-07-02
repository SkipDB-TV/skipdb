import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { json, apiError } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/password";
import { createUserSession } from "@/lib/session";
import { hasMxRecord } from "@/lib/email-validation";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { READ_ONLY, readOnlyError } from "@/lib/read-only";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (READ_ONLY) return readOnlyError();
  const rl = rateLimit(`register:${clientIp(req)}`, 10);
  if (!rl.ok) return apiError("Too many attempts. Try again shortly.", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 422, {
      issues: parsed.error.issues.map((i) => i.message),
    });
  }
  const { email, password, name } = parsed.data;

  if (!(await hasMxRecord(email))) {
    return apiError(
      "That email address doesn't appear to be valid. Please check it and try again.",
      422,
    );
  }

  const existing = (
    await db.select().from(users).where(eq(users.email, email))
  )[0];
  if (existing) {
    return apiError(
      "An account with that email already exists. Try signing in instead.",
      409,
    );
  }

  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(users)
    .values({
      email,
      name: name ?? email.split("@")[0],
      passwordHash,
      emailVerified: null,
      role: "user",
    })
    .returning();

  await createUserSession(created.id);
  return json({ ok: true, user: { email: created.email } }, { status: 201 });
}
