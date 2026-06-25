import { db } from "@/db";
import { segments, votes } from "@/db/schema";
import { and, eq, inArray, isNull, or, desc } from "drizzle-orm";
import type { PanelSegment } from "@/components/SegmentPanel";
import type { SegmentTypeName } from "./config";

/**
 * Load segments for an episode/movie for the interactive panel: all approved
 * segments plus any pending ones, annotated with the current user's vote.
 */
export async function loadPanelSegments(opts: {
  imdbId: string;
  season: number | null;
  episode: number | null;
  userId?: string;
}): Promise<PanelSegment[]> {
  const where = [
    eq(segments.imdbId, opts.imdbId),
    or(eq(segments.status, "approved"), eq(segments.status, "pending")),
    opts.season == null
      ? isNull(segments.season)
      : eq(segments.season, opts.season),
    opts.episode == null
      ? isNull(segments.episode)
      : eq(segments.episode, opts.episode),
  ];

  const rows = await db
    .select()
    .from(segments)
    .where(and(...where))
    .orderBy(desc(segments.score), desc(segments.votesUp));

  let voteMap = new Map<number, number>();
  if (opts.userId && rows.length > 0) {
    const userVotes = await db
      .select()
      .from(votes)
      .where(
        and(
          eq(votes.userId, opts.userId),
          inArray(
            votes.segmentId,
            rows.map((r) => r.id),
          ),
        ),
      );
    voteMap = new Map(userVotes.map((v) => [v.segmentId, v.value]));
  }

  return rows.map((r) => ({
    id: r.id,
    segmentType: r.segmentType as SegmentTypeName,
    startMs: r.startMs,
    endMs: r.endMs,
    durationMs: r.durationMs,
    votesUp: r.votesUp,
    votesDown: r.votesDown,
    score: r.score,
    status: r.status,
    yourVote: voteMap.get(r.id) ?? 0,
    mine: opts.userId != null && r.submittedBy === opts.userId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
