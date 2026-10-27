import { db } from "@/db";
import { segments, moderationLog, users } from "@/db/schema";
import { config } from "./config";
import { eq, inArray, sql } from "drizzle-orm";
import type { Segment } from "@/db/schema";

/**
 * Apply an approve/reject decision to one or more already-fetched segments:
 * flip their status, stamp the reviewer, write the audit-log entries, and — on
 * approval — grant each distinct contributor reputation for however many of
 * their segments were approved.
 *
 * Callers own the filtering: only pass segments that should actually be
 * actioned (e.g. drop `disabled` ones first).
 *
 * `reviewerId` is null for system decisions (e.g. peer consensus); pass
 * `auto: true` so they're flagged and logged as auto-approvals.
 */
export async function moderateSegments(
  segs: Pick<Segment, "id" | "submittedBy">[],
  action: "approve" | "reject",
  reviewerId: string | null,
  reason?: string | null,
  { auto = false }: { auto?: boolean } = {},
): Promise<void> {
  if (segs.length === 0) return;

  const ids = segs.map((s) => s.id);
  const newStatus = action === "approve" ? "approved" : "rejected";

  await db
    .update(segments)
    .set({
      status: newStatus,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      rejectionReason: action === "reject" ? (reason ?? null) : null,
      ...(auto && { autoApproved: true }),
      updatedAt: new Date(),
    })
    .where(inArray(segments.id, ids));

  await db.insert(moderationLog).values(
    ids.map((segmentId) => ({
      segmentId,
      moderatorId: reviewerId,
      action: auto && action === "approve" ? "auto-approve" : action,
      reason: reason ?? null,
    })),
  );

  if (action !== "approve") return;

  // Reputation per approval, batched to one UPDATE per distinct contributor.
  const perContributor = new Map<string, number>();
  for (const s of segs) {
    if (!s.submittedBy) continue;
    perContributor.set(
      s.submittedBy,
      (perContributor.get(s.submittedBy) ?? 0) + 1,
    );
  }
  for (const [userId, approvedCount] of perContributor) {
    await db
      .update(users)
      .set({
        reputation: sql`${users.reputation} + ${
          config.review.reputationPerApproval * approvedCount
        }`,
      })
      .where(eq(users.id, userId));
  }
}
