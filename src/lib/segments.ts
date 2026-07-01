import { db } from "@/db";
import { segments } from "@/db/schema";
import { and, eq, isNull, ne, lt, gt, desc } from "drizzle-orm";
import { adjustForDuration, matchRank } from "./duration";
import type { DurationAdjustment, AdjustMode } from "./duration";
import { publicTimes } from "./time";
import { computeConfidence, countAgreement } from "./confidence";
import { config } from "./config";
import type { Segment } from "@/db/schema";
import type { SegmentTypeName } from "./config";

export interface SegmentQuery {
  imdbId: string;
  season: number | null;
  episode: number | null;
  durationMs: number | null;
  adjust?: AdjustMode;
  types?: SegmentTypeName[];
}

/** Raw segments for an episode/movie (no duration logic). */
export async function getEpisodeSegments(q: {
  imdbId: string;
  season: number | null;
  episode: number | null;
  status?: "approved" | "pending" | "rejected";
}): Promise<Segment[]> {
  const status = q.status ?? "approved";
  const where = [eq(segments.imdbId, q.imdbId), eq(segments.status, status)];
  where.push(
    q.season == null ? isNull(segments.season) : eq(segments.season, q.season),
  );
  where.push(
    q.episode == null
      ? isNull(segments.episode)
      : eq(segments.episode, q.episode),
  );
  return db
    .select()
    .from(segments)
    .where(and(...where))
    .orderBy(desc(segments.score), desc(segments.votesUp));
}

/**
 * Find another non-rejected segment (any type) that this same user already
 * submitted for the same episode + stream length ("duration") whose time
 * range overlaps the candidate range. Different `durationMs` values mean
 * different cuts/releases of the episode, so those are never compared —
 * only submissions against the same length of show can genuinely overlap.
 * The `0,0` "confirmed absent" sentinel never overlaps anything.
 */
export async function findOverlappingOwnSegment(q: {
  imdbId: string;
  season: number | null;
  episode: number | null;
  durationMs: number | null;
  submittedBy: string;
  startMs: number;
  endMs: number;
  excludeSegmentId?: number;
}): Promise<Segment | null> {
  if (q.startMs === 0 && q.endMs === 0) return null;

  const where = [
    eq(segments.imdbId, q.imdbId),
    eq(segments.submittedBy, q.submittedBy),
    q.season == null ? isNull(segments.season) : eq(segments.season, q.season),
    q.episode == null ? isNull(segments.episode) : eq(segments.episode, q.episode),
    q.durationMs == null
      ? isNull(segments.durationMs)
      : eq(segments.durationMs, q.durationMs),
    ne(segments.status, "rejected"),
    lt(segments.startMs, q.endMs),
    gt(segments.endMs, q.startMs),
  ];
  if (q.excludeSegmentId != null) where.push(ne(segments.id, q.excludeSegmentId));

  const [row] = await db
    .select()
    .from(segments)
    .where(and(...where))
    .limit(1);
  return row ?? null;
}

export function formatPublic(
  seg: { startMs: number; endMs: number },
  adj: DurationAdjustment,
  confidence: number,
) {
  return {
    ...publicTimes({
      startMs: adj.startMs,
      endMs: adj.endMs,
      offsetMs: adj.offsetMs,
      adjusted: adj.adjusted,
    }),
    match: adj.kind,
    confidence,
  };
}

export type PublicSegment = ReturnType<typeof formatPublic>;
export type SegmentResult = PublicSegment | null;
export type BestByType = Record<SegmentTypeName, SegmentResult>;

const emptyByType = (): BestByType => ({
  intro: null,
  recap: null,
  outro: null,
  preview: null,
});

/**
 * Compute the single best segment per type for an episode/movie, returned as a
 * keyed object: { intro: {...}, recap: null, outro: {...}, preview: ... }.
 *
 * When `durationMs` is null the result uses `agnostic` match kind (no offset
 * shifting). Callers should pass duration whenever possible for best results.
 */
export async function getBestByType(q: SegmentQuery): Promise<BestByType> {
  const want = q.types ?? config.segmentTypes;
  const result = emptyByType();

  const rows = await getEpisodeSegments({
    imdbId: q.imdbId,
    season: q.season,
    episode: q.episode,
    status: "approved",
  });

  for (const type of want) {
    const group = rows
      .filter((r) => r.segmentType === type)
      .map((row) => ({ row, adj: adjustForDuration(row, q.durationMs, q.adjust) }));
    if (group.length === 0) continue; // no data at all -> stays null

    const inRange = group.filter((g) => g.adj.kind !== "out-of-range");
    // Prefer in-range candidates; fall back to best out-of-range rather than
    // returning nothing. The client can check match: "out-of-range" as the flag.
    const candidates = inRange.length > 0 ? inRange : group;

    candidates.sort((a, b) => {
      // Prefer better match kind (exact < shifted < agnostic < out-of-range),
      // then community score.
      const r = matchRank(a.adj.kind) - matchRank(b.adj.kind);
      if (r !== 0) return r;
      return b.row.score - a.row.score;
    });
    const winner = candidates[0];
    // 0,0 is the "no segment" sentinel — confirmed absence, so return null.
    if (winner.row.startMs === 0 && winner.row.endMs === 0) continue;
    const confidence = computeConfidence({
      agreeCount: countAgreement(
        winner.row,
        candidates.map((g) => g.row),
      ),
      votesUp: winner.row.votesUp,
      votesDown: winner.row.votesDown,
      match: winner.adj.kind,
    });
    result[type] = formatPublic(winner.row, winner.adj, confidence);
  }

  return result;
}
