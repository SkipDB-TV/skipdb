import { db } from "@/db";
import { segments } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { config } from "./config";
import type { Segment } from "@/db/schema";
import type { SegmentTypeName } from "./config";

export interface ReviewContext {
  thisLengthMs: number;
  durationProvidedMs: number | null;
  submitter: { submissions: number; approved: number };
  episode: {
    approvedCount: number;
    existing?: {
      startMs: number;
      endMs: number;
      lengthMs: number;
      durationMs: number | null;
      score: number;
    };
    lengthDeltaMs?: number; // this − existing
    startDeltaMs?: number;
  };
  typicalSeasonLengthMs: number | null;
  typicalSeriesLengthMs: number | null;
  seriesSamples: number;
  lengthVsTypicalMs: number | null; // this − typical (season preferred)
  // how the provided duration compares to other submissions for this episode+type
  durationCompare: "none-provided" | "matches" | "close" | "differs" | "first";
}

interface PendingLike {
  id: number;
  submittedBy: string | null;
  titleId: number;
  season: number | null;
  episode: number | null;
  segmentType: SegmentTypeName;
  startMs: number;
  endMs: number;
  durationMs: number | null;
}

const median = (nums: number[]): number | null => {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * Build moderation context for a batch of pending submissions in a few batched
 * queries: submitter track record, what we already have for the episode, the
 * usual length for the series/season, and how the provided duration compares.
 */
export async function buildReviewContext(
  pending: PendingLike[],
): Promise<Map<number, ReviewContext>> {
  const out = new Map<number, ReviewContext>();
  if (pending.length === 0) return out;

  const submitterIds = [
    ...new Set(pending.map((p) => p.submittedBy).filter((x): x is string => !!x)),
  ];
  const titleIds = [...new Set(pending.map((p) => p.titleId))];

  // Submitter track records (total + approved), batched.
  const totals = submitterIds.length
    ? await db
        .select({
          uid: segments.submittedBy,
          total: sql<number>`count(*)`,
          approved: sql<number>`count(*) filter (where ${segments.status} = 'approved')`,
        })
        .from(segments)
        .where(inArray(segments.submittedBy, submitterIds))
        .groupBy(segments.submittedBy)
    : [];
  const submitterMap = new Map(
    totals.map((t) => [
      t.uid as string,
      { submissions: Number(t.total), approved: Number(t.approved) },
    ]),
  );

  // All approved segments across the involved titles, fetched once.
  const approved: Segment[] = await db
    .select()
    .from(segments)
    .where(
      and(inArray(segments.titleId, titleIds), eq(segments.status, "approved")),
    );

  const seriesLen = new Map<string, number[]>();
  const seasonLen = new Map<string, number[]>();
  const episodeApproved = new Map<string, Segment[]>();
  const lenOf = (s: Segment) => s.endMs - s.startMs;

  for (const s of approved) {
    const type = s.segmentType;
    push(seriesLen, `${s.titleId}|${type}`, lenOf(s));
    push(seasonLen, `${s.titleId}|${s.season}|${type}`, lenOf(s));
    const ek = `${s.titleId}|${s.season}|${s.episode}|${type}`;
    if (!episodeApproved.has(ek)) episodeApproved.set(ek, []);
    episodeApproved.get(ek)!.push(s);
  }

  for (const p of pending) {
    const thisLength = p.endMs - p.startMs;
    const ek = `${p.titleId}|${p.season}|${p.episode}|${p.segmentType}`;
    const epList = (episodeApproved.get(ek) ?? []).sort(
      (a, b) => b.score - a.score,
    );
    const existing = epList[0];

    const seasonLengths = seasonLen.get(`${p.titleId}|${p.season}|${p.segmentType}`) ?? [];
    const seriesLengths = seriesLen.get(`${p.titleId}|${p.segmentType}`) ?? [];
    const typicalSeason = median(seasonLengths);
    const typicalSeries = median(seriesLengths);
    const typical = typicalSeason ?? typicalSeries;

    out.set(p.id, {
      thisLengthMs: thisLength,
      durationProvidedMs: p.durationMs,
      submitter: p.submittedBy
        ? (submitterMap.get(p.submittedBy) ?? { submissions: 0, approved: 0 })
        : { submissions: 0, approved: 0 },
      episode: {
        approvedCount: epList.length,
        existing: existing
          ? {
              startMs: existing.startMs,
              endMs: existing.endMs,
              lengthMs: lenOf(existing),
              durationMs: existing.durationMs,
              score: existing.score,
            }
          : undefined,
        lengthDeltaMs: existing ? thisLength - lenOf(existing) : undefined,
        startDeltaMs: existing ? p.startMs - existing.startMs : undefined,
      },
      typicalSeasonLengthMs: typicalSeason,
      typicalSeriesLengthMs: typicalSeries,
      seriesSamples: seriesLengths.length,
      lengthVsTypicalMs: typical != null ? thisLength - typical : null,
      durationCompare: compareDuration(p.durationMs, epList),
    });
  }

  return out;
}

function compareDuration(
  provided: number | null,
  epApproved: Segment[],
): ReviewContext["durationCompare"] {
  if (provided == null) return "none-provided";
  const others = epApproved
    .map((s) => s.durationMs)
    .filter((d): d is number => d != null);
  if (others.length === 0) return "first";
  const best = Math.min(...others.map((d) => Math.abs(d - provided)));
  if (best <= config.duration.exactToleranceMs) return "matches";
  if (best <= config.duration.shiftToleranceMs) return "close";
  return "differs";
}

function push(map: Map<string, number[]>, key: string, val: number) {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(val);
}
