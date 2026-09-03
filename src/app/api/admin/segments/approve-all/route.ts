import { db } from "@/db";
import { segments } from "@/db/schema";
import { json, apiError } from "@/lib/api";
import { requireStaff } from "@/lib/admin";
import { moderateSegments } from "@/lib/moderate";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  submitted_by: z.string().min(1),
});

/**
 * Approve every pending submission from one contributor in a single pass —
 * the "approve all from this user" shortcut on the review queue. Only touches
 * `pending` rows, so anything already actioned (or a disabled user's
 * soft-disabled segments) is left alone.
 */
export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return apiError("Forbidden", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("submitted_by is required", 422);

  const pending = await db
    .select()
    .from(segments)
    .where(
      and(
        eq(segments.submittedBy, parsed.data.submitted_by),
        eq(segments.status, "pending"),
      ),
    );

  await moderateSegments(pending, "approve", staff.id, null);

  return json({ approved: pending.length, ids: pending.map((s) => s.id) });
}
