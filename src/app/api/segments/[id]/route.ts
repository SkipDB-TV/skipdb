import { db } from "@/db";
import { segments, moderationLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { json, apiError, preflight } from "@/lib/api";
import { getActor } from "@/lib/actor";
import { editSchema, snapOutroEnd, validateSegmentBounds } from "@/lib/validation";
import { parseTimeToMs, roundTime } from "@/lib/time";
import { reviewSubmission } from "@/lib/review";
import { findOverlappingOwnSegment } from "@/lib/segments";
import type { SegmentTypeName } from "@/lib/config";
import { READ_ONLY, readOnlyError } from "@/lib/read-only";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

function isStaff(role: string) {
  return role === "moderator" || role === "admin";
}

async function loadAuthorized(req: Request, id: string) {
  const actor = await getActor(req, { allowAnonymousKeys: true });
  if (!actor) return { error: apiError("Authentication required.", 401) };
  const segmentId = Number(id);
  if (!Number.isInteger(segmentId))
    return { error: apiError("Invalid segment id", 400) };
  const segment = (
    await db.select().from(segments).where(eq(segments.id, segmentId))
  )[0];
  if (!segment) return { error: apiError("Segment not found", 404) };
  const owns = segment.submittedBy === actor.user.id;
  if (!owns && !isStaff(actor.user.role))
    return { error: apiError("You can only modify your own submissions.", 403) };
  return { actor, segment };
}

// --- Edit a submission. Re-runs review, so an approved segment can return to
//     the queue if its new values no longer qualify for auto-approval. ---
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (READ_ONLY) return readOnlyError();
  const { id } = await params;
  const loaded = await loadAuthorized(req, id);
  if (loaded.error) return loaded.error;
  const { actor, segment } = loaded;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 422, {
      issues: parsed.error.issues.map((i) => i.message),
    });
  }
  const e = parsed.data;

  // The segment type is fixed once submitted — changing it would really be a
  // different segment. Reject the change and tell the user to resubmit.
  if (e.segment_type != null && e.segment_type !== segment.segmentType) {
    return apiError(
      "Segment type can't be changed. Delete this submission and create a new one instead.",
      422,
    );
  }
  const type = segment.segmentType as SegmentTypeName;
  const startMs = roundTime(
    e.start_ms ?? segment.startMs,
  );
  const durationMs = e.clear_duration
    ? null
    : e.duration_ms != null || e.duration_sec != null
      ? roundTime(
          (e.duration_ms ?? parseTimeToMs(e.duration_sec)) as number,
        )
      : segment.durationMs;
  let endMs = roundTime(
    e.end_ms ?? segment.endMs,
  );
  // Snap outro end to duration when within the threshold.
  if (type === "outro") {
    endMs = snapOutroEnd(endMs, durationMs);
  }

  const boundsError = validateSegmentBounds({ startMs, endMs, durationMs, segmentType: type });
  if (boundsError) return apiError(boundsError, 422);

  // The edited range can't overlap another of this user's own submissions
  // (any type) for the same episode + stream length. Skipped for orphaned
  // segments (submittedBy null after account deletion) — nothing to compare.
  if (segment.submittedBy) {
    const overlap = await findOverlappingOwnSegment({
      imdbId: segment.imdbId,
      season: segment.season,
      episode: segment.episode,
      durationMs,
      submittedBy: segment.submittedBy,
      startMs,
      endMs,
      excludeSegmentId: segment.id,
    });
    if (overlap) {
      return apiError(
        `This overlaps your existing ${overlap.segmentType} submission (${overlap.startMs}-${overlap.endMs}ms) for this episode.`,
        409,
        {
          conflicting_segment_id: overlap.id,
          conflicting_segment_type: overlap.segmentType,
        },
      );
    }
  }

  const decision = await reviewSubmission(
    {
      titleId: segment.titleId,
      season: segment.season,
      episode: segment.episode,
      segmentType: type,
      startMs,
      endMs,
      durationMs,
      excludeSegmentId: segment.id,
    },
    { role: actor.user.role, reputation: actor.user.reputation },
  );

  await db
    .update(segments)
    .set({
      startMs,
      endMs,
      durationMs,
      status: decision.status,
      autoApproved: decision.autoApproved,
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(segments.id, segment.id));

  await db.insert(moderationLog).values({
    segmentId: segment.id,
    moderatorId: isStaff(actor.user.role) ? actor.user.id : null,
    action: "edit",
    reason: decision.reasons.join("; "),
  });

  return json({
    id: segment.id,
    status: decision.status,
    auto_approved: decision.autoApproved,
    reasons: decision.reasons,
    message:
      decision.status === "approved"
        ? "Submission updated."
        : "Submission updated and sent back to review.",
  });
}

// --- Delete a submission (owner or staff). ---
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (READ_ONLY) return readOnlyError();
  const { id } = await params;
  const loaded = await loadAuthorized(req, id);
  if (loaded.error) return loaded.error;
  const { segment } = loaded;

  await db.delete(segments).where(eq(segments.id, segment.id));

  return json({ id: segment.id, deleted: true });
}
