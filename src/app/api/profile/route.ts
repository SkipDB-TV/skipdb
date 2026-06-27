import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { json, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";
import { profileSchema } from "@/lib/validation";
import { usesSocialLogin } from "@/lib/account";
import { hasMxRecord } from "@/lib/email-validation";

export const runtime = "nodejs";

// Update the current user's name and email. Blocked for social-login users.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("Authentication required.", 401);
  const userId = session.user.id;

  if (await usesSocialLogin(userId)) {
    return apiError(
      "Your name and email are managed by your social login provider.",
      403,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 422, {
      issues: parsed.error.issues.map((i) => i.message),
    });
  }
  const { name, email } = parsed.data;

  // Ensure the email isn't taken by another account.
  const clash = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), ne(users.id, userId)))
      .limit(1)
  )[0];
  if (clash) return apiError("That email is already in use.", 409);

  const current = (
    await db.select().from(users).where(eq(users.id, userId))
  )[0];
  const emailChanged = current?.email?.toLowerCase() !== email;

  if (emailChanged && !(await hasMxRecord(email))) {
    return apiError("That email address doesn't appear to be valid. Please check it and try again.", 422);
  }

  await db
    .update(users)
    .set({
      name,
      email,
      // Changing email invalidates prior verification (we don't enforce it).
      ...(emailChanged ? { emailVerified: null } : {}),
    })
    .where(eq(users.id, userId));

  return json({ ok: true, name, email });
}
