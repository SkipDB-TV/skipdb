import { db } from "@/db";
import { segments } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const CONSISTENCY_TOLERANCE_MS = 15_000; // start times within 15s of median = "agree"
const CONSISTENCY_THRESHOLD = 0.8; // 80% must agree for the estimate to be valid
const MIN_SAMPLES = 2;

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
  const rows = await db
    .select()
    .from(segments)
    .where(
      and(
        eq(segments.imdbId, imdbId),
        eq(segments.segmentType, "intro"),
        eq(segments.status, "approved"),
      ),
    );

  // Exclude 0,0 "confirmed no intro" sentinels.
  const real = rows.filter((r) => !(r.startMs === 0 && r.endMs === 0));

  // Season-level first; series-wide fallback.
  const seasonRows =
    season != null ? real.filter((r) => r.season === season) : [];
  const candidates = seasonRows.length >= MIN_SAMPLES ? seasonRows : real;

  return consistentMedian(candidates.map((r) => r.endMs - r.startMs));
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
