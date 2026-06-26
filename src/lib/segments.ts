import { db } from "@/db";
import { segments } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { adjustForDuration, matchRank } from "./duration";
import type { DurationAdjustment, AdjustMode } from "./duration";
import { publicTimes } from "./time";
import { getResolved } from "./resolved";
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
 * Each value is the best segment, `null` (no data), or
 * `{ excluded: "duration_mismatch" }` (we have data but only for streams too
 * different in length to safely match the requested one).
 *
 * - No requested duration: served from the denormalized resolved_segments table
 *   (one indexed lookup, with confidence already computed).
 * - With a requested duration: evaluated live against the (small) approved set
 *   for the episode so we can apply offset shifting and prefer a duration match.
 */
export async function getBestByType(q: SegmentQuery): Promise<BestByType> {
  const want = q.types ?? config.segmentTypes;
  const result = emptyByType();

  if (q.durationMs == null) {
    const resolved = await getResolved({
      imdbId: q.imdbId,
      season: q.season,
      episode: q.episode,
    });
    for (const r of resolved) {
      const type = r.segmentType as SegmentTypeName;
      if (!want.includes(type)) continue;
      // 0,0 is the "no segment" sentinel — confirmed absence, so return null.
      if (r.startMs === 0 && r.endMs === 0) continue;
      const adj = adjustForDuration(
        { startMs: r.startMs, endMs: r.endMs, durationMs: r.durationMs },
        null,
      );
      result[type] = formatPublic(r, adj, r.confidence);
    }
    return result;
  }

  // Duration provided: evaluate the approved submissions for this episode.
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
    });
    result[type] = formatPublic(winner.row, winner.adj, confidence);
  }

  return result;
}
