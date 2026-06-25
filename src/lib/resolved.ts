import { db } from "@/db";
import { segments, resolvedSegments } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import type { SegmentTypeName } from "./config";
import { config } from "./config";
import { computeConfidence, countAgreement } from "./confidence";

const seasonCond = (season: number | null) =>
  season == null ? isNull(segments.season) : eq(segments.season, season);
const episodeCond = (episode: number | null) =>
  episode == null ? isNull(segments.episode) : eq(segments.episode, episode);
const rSeasonCond = (season: number | null) =>
  season == null
    ? isNull(resolvedSegments.season)
    : eq(resolvedSegments.season, season);
const rEpisodeCond = (episode: number | null) =>
  episode == null
    ? isNull(resolvedSegments.episode)
    : eq(resolvedSegments.episode, episode);

export interface ResolveKey {
  imdbId: string;
  titleId: number;
  season: number | null;
  episode: number | null;
  segmentType: SegmentTypeName;
}

/**
 * Recompute the "decided" best segment for one (episode, type) and upsert it
 * into resolved_segments. Called whenever that group's approved set changes.
 * The canonical winner is the highest score, then most up-votes, then newest.
 */
export async function recomputeResolved(key: ResolveKey): Promise<void> {
  const approved = await db
    .select()
    .from(segments)
    .where(
      and(
        eq(segments.imdbId, key.imdbId),
        eq(segments.segmentType, key.segmentType),
        eq(segments.status, "approved"),
        seasonCond(key.season),
        episodeCond(key.episode),
      ),
    )
    .orderBy(
      desc(segments.score),
      desc(segments.votesUp),
      desc(segments.createdAt),
    );

  // Clear any existing resolved row for this group first.
  await db
    .delete(resolvedSegments)
    .where(
      and(
        eq(resolvedSegments.imdbId, key.imdbId),
        eq(resolvedSegments.segmentType, key.segmentType),
        rSeasonCond(key.season),
        rEpisodeCond(key.episode),
      ),
    );

  const best = approved[0];
  if (!best) return; // nothing approved -> stays absent

  const confidence = computeConfidence({
    agreeCount: countAgreement(best, approved),
    votesUp: best.votesUp,
    votesDown: best.votesDown,
  });

  await db.insert(resolvedSegments).values({
    imdbId: key.imdbId,
    titleId: key.titleId,
    season: key.season,
    episode: key.episode,
    segmentType: key.segmentType,
    segmentId: best.id,
    startMs: best.startMs,
    endMs: best.endMs,
    durationMs: best.durationMs,
    votesUp: best.votesUp,
    votesDown: best.votesDown,
    score: best.score,
    confidence,
    updatedAt: new Date(),
  });
}

/** Recompute every segment type for an episode (used after broad changes). */
export async function recomputeAllTypes(
  key: Omit<ResolveKey, "segmentType">,
): Promise<void> {
  for (const segmentType of config.segmentTypes) {
    await recomputeResolved({ ...key, segmentType });
  }
}

/** Fetch the resolved rows for an episode/movie (<= 4 rows). */
export async function getResolved(q: {
  imdbId: string;
  season: number | null;
  episode: number | null;
}) {
  return db
    .select()
    .from(resolvedSegments)
    .where(
      and(
        eq(resolvedSegments.imdbId, q.imdbId),
        rSeasonCond(q.season),
        rEpisodeCond(q.episode),
      ),
    );
}
