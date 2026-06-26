/**
 * Shared logic for staff-approved segment insertion used by both the
 * /api/admin/bulk and /api/admin/import routes.
 */
import { db } from "@/db";
import { segments, moderationLog } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
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

export type StaffSegmentOutcome =
  | { kind: "created"; id: number; startMs: number; endMs: number; durationMs: number | null; status: "approved" }
  | { kind: "skipped"; reason: "exact_match"; existingId: number };

/**
 * Validate and insert a single segment as staff-approved.
 * Returns a 'skipped' outcome when an identical approved segment already exists
 * (caller should tell the user to vote instead).
 * Throws a string error message on validation or DB failure.
 */
export async function insertStaffSegment(
  input: StaffSegmentInput,
): Promise<StaffSegmentOutcome> {
  const boundsError = validateSegmentBounds({
    startMs: input.startMs,
    endMs: input.endMs,
    durationMs: input.durationMs,
    segmentType: input.segmentType,
  });
  if (boundsError) throw boundsError;

  // If an identical approved segment already exists, skip — caller should vote.
  const [exactMatch] = await db
    .select({ id: segments.id })
    .from(segments)
    .where(
      and(
        eq(segments.imdbId, input.imdbId),
        input.season != null ? eq(segments.season, input.season) : isNull(segments.season),
        input.episode != null ? eq(segments.episode, input.episode) : isNull(segments.episode),
        eq(segments.segmentType, input.segmentType),
        eq(segments.startMs, input.startMs),
        eq(segments.endMs, input.endMs),
        eq(segments.status, "approved"),
      ),
    )
    .limit(1);

  if (exactMatch) {
    return { kind: "skipped", reason: "exact_match", existingId: exactMatch.id };
  }

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
    kind: "created",
    id: created.id,
    startMs: created.startMs,
    endMs: created.endMs,
    durationMs: created.durationMs,
    status: "approved",
  };
}
