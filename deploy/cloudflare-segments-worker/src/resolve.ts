// Core business logic imported directly from the main app — no duplication needed.
// config, duration, and confidence are pure functions with no Node.js/DB/Next.js imports.
// If those files ever gain such imports, `wrangler deploy` will fail at bundle time (safe).
import { config } from "../../../src/lib/config";
import { adjustForDuration, matchRank } from "../../../src/lib/duration";
import { computeConfidence } from "../../../src/lib/confidence";

export type { AdjustMode } from "../../../src/lib/duration";
import type { MatchKind } from "../../../src/lib/duration";

// Not in app config — used only in the Worker's pre-computed intro estimate.
const ESTIMATE_CONSISTENCY_TOL = 15_000;
const ESTIMATE_CONSISTENCY_MIN = 0.8;
const ESTIMATE_MIN_SAMPLES = 2;

export const SEGMENT_TYPES = ["intro", "recap", "outro", "preview"] as const;
export type SegmentType = (typeof SEGMENT_TYPES)[number];

export interface StoredSegment {
  type: SegmentType;
  start_ms: number;
  end_ms: number;
  duration_ms: number | null;
  score: number;
  votes_up: number;
  votes_down: number;
}

export interface ResolvedSegment {
  start_ms: number;
  end_ms: number;
  adjusted: boolean;
  offset_ms: number;
  match: MatchKind;
  confidence: number;
}

export type SegmentsResult = Record<SegmentType, ResolvedSegment | null>;

interface IntroEntry {
  season: number | null;
  start_ms: number;
  end_ms: number;
}

// Kept local — app's countAgreement uses `id` for identity; StoredSegment uses
// reference equality with snake_case fields from the D1/dump format.
function countAgreement(winner: StoredSegment, others: StoredSegment[]): number {
  const tol = config.review.consensusToleranceMs;
  return others.filter(
    (s) =>
      s !== winner &&
      Math.abs(s.start_ms - winner.start_ms) <= tol &&
      Math.abs(s.end_ms - winner.end_ms) <= tol,
  ).length;
}

export function getBestByType(
  segments: StoredSegment[],
  requestedMs: number | null,
  mode: import("../../../src/lib/duration").AdjustMode = "conservative",
  types: readonly SegmentType[] = SEGMENT_TYPES,
): SegmentsResult {
  const result = Object.fromEntries(
    SEGMENT_TYPES.map((t) => [t, null]),
  ) as SegmentsResult;

  for (const type of types) {
    const group = segments.filter((s) => s.type === type);
    if (group.length === 0) continue;

    // 0,0 = "confirmed no segment" sentinel — leave null.
    const real = group.filter((s) => !(s.start_ms === 0 && s.end_ms === 0));
    if (real.length === 0) continue;

    const candidates = real.map((s) => ({
      seg: s,
      adj: adjustForDuration(
        { startMs: s.start_ms, endMs: s.end_ms, durationMs: s.duration_ms },
        requestedMs,
        mode,
      ),
    }));
    const inRange = candidates.filter((c) => c.adj.kind !== "out-of-range");
    const pool = inRange.length > 0 ? inRange : candidates;

    pool.sort((a, b) => {
      const r = matchRank(a.adj.kind) - matchRank(b.adj.kind);
      if (r !== 0) return r;
      if (a.seg.score !== b.seg.score) return b.seg.score - a.seg.score;
      return b.seg.votes_up - a.seg.votes_up;
    });

    const { seg, adj } = pool[0];
    const confidence = computeConfidence({
      agreeCount: countAgreement(seg, real),
      votesUp: seg.votes_up,
      votesDown: seg.votes_down,
      match: adj.kind,
    });

    result[type] = {
      start_ms: adj.startMs,
      end_ms: adj.endMs,
      adjusted: adj.adjusted,
      offset_ms: adj.offsetMs,
      match: adj.kind,
      confidence,
    };
  }

  return result;
}

export function getIntroLengthEstimate(
  introsByImdbId: Record<string, IntroEntry[]>,
  imdbId: string,
  season: number | null,
): number | null {
  const all = (introsByImdbId[imdbId] ?? []).filter(
    (s) => !(s.start_ms === 0 && s.end_ms === 0),
  );
  const seasonRows =
    season != null ? all.filter((s) => s.season === season) : [];
  const candidates =
    seasonRows.length >= ESTIMATE_MIN_SAMPLES ? seasonRows : all;
  return consistentMedian(candidates.map((s) => s.end_ms - s.start_ms));
}

function consistentMedian(values: number[]): number | null {
  if (values.length < ESTIMATE_MIN_SAMPLES) return null;
  const med = medianOf(values);
  const agreeing = values.filter(
    (v) => Math.abs(v - med) <= ESTIMATE_CONSISTENCY_TOL,
  ).length;
  if (agreeing / values.length < ESTIMATE_CONSISTENCY_MIN) return null;
  return Math.round(med);
}

function medianOf(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
