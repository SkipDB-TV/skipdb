import { db } from "@/db";
import { segments } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { adjustForDuration, matchRank } from "./duration";
import { publicTimes } from "./time";
import type { Segment } from "@/db/schema";
import type { SegmentTypeName } from "./config";

export interface SegmentQuery {
  imdbId: string;
  season: number | null;
  episode: number | null;
  durationMs: number | null;
  type?: SegmentTypeName;
  status?: "approved" | "pending" | "rejected";
}

/** Raw approved segments for an episode/movie (no duration logic). */
export async function getEpisodeSegments(q: {
  imdbId: string;
  season: number | null;
  episode: number | null;
  status?: "approved" | "pending" | "rejected";
}): Promise<Segment[]> {
  const status = q.status ?? "approved";
  const where = [eq(segments.imdbId, q.imdbId), eq(segments.status, status)];
  where.push(
    q.season == null
      ? isNull(segments.season)
      : eq(segments.season, q.season),
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
 * Public, duration-aware view of segments for the API. Applies offset shifting,
 * drops out-of-range versions when better matches exist, and returns the single
 * best segment per type plus the full list of alternatives.
 */
export async function getMatchedSegments(q: SegmentQuery) {
  const rows = await getEpisodeSegments({
    imdbId: q.imdbId,
    season: q.season,
    episode: q.episode,
    status: q.status ?? "approved",
  });

  const filtered = q.type
    ? rows.filter((r) => r.segmentType === q.type)
    : rows;

  const evaluated = filtered.map((row) => {
    const adj = adjustForDuration(
      {
        startMs: row.startMs,
        endMs: row.endMs,
        durationMs: row.durationMs,
      },
      q.durationMs,
    );
    return { row, adj };
  });

  // Group by type and pick the best (best match kind, then score).
  const byType = new Map<SegmentTypeName, typeof evaluated>();
  for (const e of evaluated) {
    const t = e.row.segmentType as SegmentTypeName;
    if (!byType.get(t)) byType.set(t, []);
    byType.get(t)!.push(e);
  }

  const best: ReturnType<typeof formatSegment>[] = [];
  const all: ReturnType<typeof formatSegment>[] = [];

  for (const [, group] of byType) {
    // If any in-range match exists, drop out-of-range alternatives.
    const inRange = group.filter((g) => g.adj.kind !== "out-of-range");
    const usable = inRange.length > 0 ? inRange : group;
    usable.sort((a, b) => {
      const r = matchRank(a.adj.kind) - matchRank(b.adj.kind);
      if (r !== 0) return r;
      return b.row.score - a.row.score;
    });
    best.push(formatSegment(usable[0].row, usable[0].adj));
    for (const g of usable) all.push(formatSegment(g.row, g.adj));
  }

  return { best, all };
}

export function formatSegment(
  row: Segment,
  adj: ReturnType<typeof adjustForDuration>,
) {
  return {
    id: row.id,
    segment_type: row.segmentType,
    ...publicTimes({
      startMs: adj.startMs,
      endMs: adj.endMs,
      offsetMs: adj.offsetMs,
      adjusted: adj.adjusted,
    }),
    match: adj.kind,
    // original stored values (unshifted) for transparency
    original: {
      start_ms: row.startMs,
      end_ms: row.endMs,
      duration_ms: row.durationMs,
    },
    votes: { up: row.votesUp, down: row.votesDown, score: row.score },
    status: row.status,
    source: row.source,
    submitted_at: row.createdAt,
  };
}
