/**
 * Shared logic for staff-approved segment insertion used by both the
 * /api/admin/bulk and /api/admin/import routes.
 */
import { db } from "@/db";
import { segments, moderationLog } from "@/db/schema";
import { validateSegmentBounds } from "./validation";
import type { SegmentTypeName } from "./config";

export interface StaffSegmentInput {
  titleId: number;
  imdbId: string;
  season: number | null;
  episode: number | null;
  segmentType: SegmentTypeName;
  startMs: number;
  endMs: number;
  durationMs: number | null;
  submittedById: string;
}

export interface StaffSegmentResult {
  id: number;
  startMs: number;
  endMs: number;
  durationMs: number | null;
  status: "approved";
}

/**
 * Validate and insert a single segment as staff-approved.
 * Returns the created row on success or throws a string error message.
 */
export async function insertStaffSegment(
  input: StaffSegmentInput,
): Promise<StaffSegmentResult> {
  const boundsError = validateSegmentBounds({
    startMs: input.startMs,
    endMs: input.endMs,
    durationMs: input.durationMs,
    segmentType: input.segmentType,
  });
  if (boundsError) throw boundsError;

  const [created] = await db
    .insert(segments)
    .values({
      titleId: input.titleId,
      imdbId: input.imdbId,
      season: input.season,
      episode: input.episode,
      segmentType: input.segmentType,
      startMs: input.startMs,
      endMs: input.endMs,
      durationMs: input.durationMs,
      submittedBy: input.submittedById,
      status: "approved",
      autoApproved: true,
      source: "web",
    })
    .returning();

  await db.insert(moderationLog).values({
    segmentId: created.id,
    moderatorId: input.submittedById,
    action: "auto-approve",
    reason: "staff import",
  });

  return {
    id: created.id,
    startMs: created.startMs,
    endMs: created.endMs,
    durationMs: created.durationMs,
    status: "approved",
  };
}
