import { db } from "@/db";
import { segments } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const CONSISTENCY_TOLERANCE_MS = 15_000; // start times within 15s of median = "agree"
const CONSISTENCY_THRESHOLD = 0.8; // 80% must agree for the estimate to be valid
const MIN_SAMPLES = 2;

/**
 * Intro lengths (end_ms - start_ms) for approved, non-sentinel segments,
 * scoped to a season when given. Only pulls the two columns the estimate
 * actually needs — the caller used to `select()` every column (incl.
 * submitted_by/rejection_reason/timestamps) for the whole series regardless
 * of season, which made this one of the biggest sources of DB egress in the
 * app (a single title's intro rows, times every request for any of its
 * episodes).
 */
async function fetchIntroLengths(
  imdbId: string,
  season: number | null,
): Promise<number[]> {
  const where = [
    eq(segments.imdbId, imdbId),
    eq(segments.segmentType, "intro"),
    eq(segments.status, "approved"),
  ];
  if (season != null) where.push(eq(segments.season, season));

  const rows = await db
    .select({ startMs: segments.startMs, endMs: segments.endMs })
    .from(segments)
    .where(and(...where));

  // Exclude 0,0 "confirmed no intro" sentinels.
  return rows
    .filter((r) => !(r.startMs === 0 && r.endMs === 0))
    .map((r) => r.endMs - r.startMs);
}

/**
 * Return the median intro length (end_ms - start_ms) for the season, or fall
 * back to the whole series. Returns null if fewer than MIN_SAMPLES exist or
 * fewer than 80% of the lengths cluster within CONSISTENCY_TOLERANCE_MS of the
 * median.
 */
export async function getIntroLengthEstimate(
  imdbId: string,
  season: number | null,
): Promise<number | null> {
  // Season-level query first (small, indexed) — the series-wide query below
  // only runs when the season doesn't have enough samples on its own.
  const seasonLengths = season != null ? await fetchIntroLengths(imdbId, season) : [];
  const candidates =
    seasonLengths.length >= MIN_SAMPLES
      ? seasonLengths
      : await fetchIntroLengths(imdbId, null);

  return consistentMedian(candidates);
}

function consistentMedian(values: number[]): number | null {
  if (values.length < MIN_SAMPLES) return null;
  const med = medianOf(values);
  const agreeing = values.filter(
    (v) => Math.abs(v - med) <= CONSISTENCY_TOLERANCE_MS,
  );
  if (agreeing.length / values.length < CONSISTENCY_THRESHOLD) return null;
  return Math.round(med);
}


function medianOf(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
