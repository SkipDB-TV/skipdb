import { db } from "@/db";
import { segments, moderationLog, users } from "@/db/schema";
import { json, apiError } from "@/lib/api";
import { requireStaff } from "@/lib/admin";
import { config } from "@/lib/config";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await requireStaff();
  if (!staff) return apiError("Forbidden", 403);

  const { id } = await params;
  const segmentId = Number(id);
  if (!Number.isInteger(segmentId)) return apiError("Invalid id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return apiError("action must be approve or reject", 422);
  const { action, reason } = parsed.data;

  const segment = (
    await db.select().from(segments).where(eq(segments.id, segmentId))
  )[0];
  if (!segment) return apiError("Segment not found", 404);
  if (segment.status === "disabled")
    return apiError(
      "This segment belongs to a disabled user — re-enable the user instead of approving/rejecting directly.",
      409,
    );

  const newStatus = action === "approve" ? "approved" : "rejected";
  await db
    .update(segments)
    .set({
      status: newStatus,
      reviewedBy: staff.id,
      reviewedAt: new Date(),
      rejectionReason: action === "reject" ? (reason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(segments.id, segmentId));

  await db.insert(moderationLog).values({
    segmentId,
    moderatorId: staff.id,
    action,
    reason: reason ?? null,
  });

  // On approval, grant the contributor reputation.
  if (action === "approve" && segment.submittedBy) {
    await db
      .update(users)
      .set({
        reputation: sql`${users.reputation} + ${config.review.reputationPerApproval}`,
      })
      .where(eq(users.id, segment.submittedBy));
  }

  return json({ id: segmentId, status: newStatus });
}
