import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { json, apiError } from "@/lib/api";
import { requireStaff } from "@/lib/admin";
import { READ_ONLY, readOnlyError } from "@/lib/read-only";
import { getUserDetail, disableUser, enableUser } from "@/lib/user-admin";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await requireStaff();
  if (!staff) return apiError("Forbidden", 403);

  const { id } = await params;
  const page = Number(new URL(req.url).searchParams.get("page")) || 1;

  const detail = await getUserDetail(id, { page });
  if (!detail) return apiError("User not found", 404);
  return json(detail);
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["disable", "enable"]) }),
  // Admin-only: let trusted people into the review queue (or take them out).
  z.object({ action: z.literal("set-role"), role: z.enum(["user", "moderator"]) }),
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (READ_ONLY) return readOnlyError();
  const staff = await requireStaff();
  if (!staff) return apiError("Forbidden", 403);
  // Disabling purges votes and hides every submission at once, and roles grant
  // access — both admin-only. Moderators can still view users.
  if (staff.role !== "admin")
    return apiError("Only admins can change user accounts", 403);

  const { id } = await params;
  if (id === staff.id)
    return apiError("You can't change your own account", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success)
    return apiError("action must be disable, enable or set-role", 422);

  const [exists] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!exists) return apiError("User not found", 404);
  // Admins can't disable or demote each other — that's done in the database.
  if (exists.role === "admin")
    return apiError("Admins can't be changed here", 400);

  if (parsed.data.action === "set-role") {
    await db
      .update(users)
      .set({ role: parsed.data.role })
      .where(eq(users.id, id));
    return json({ id, role: parsed.data.role });
  }

  if (parsed.data.action === "disable") {
    await disableUser(id, staff.id);
  } else {
    await enableUser(id, staff.id);
  }

  return json({ id, disabled: parsed.data.action === "disable" });
}
