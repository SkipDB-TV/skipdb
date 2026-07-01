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

const actionSchema = z.object({ action: z.enum(["disable", "enable"]) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (READ_ONLY) return readOnlyError();
  const staff = await requireStaff();
  if (!staff) return apiError("Forbidden", 403);

  const { id } = await params;
  if (id === staff.id)
    return apiError("You can't disable your own account", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return apiError("action must be disable or enable", 422);

  const [exists] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!exists) return apiError("User not found", 404);

  if (parsed.data.action === "disable") {
    await disableUser(id, staff.id);
  } else {
    await enableUser(id, staff.id);
  }

  return json({ id, disabled: parsed.data.action === "disable" });
}
