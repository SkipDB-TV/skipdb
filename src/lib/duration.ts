import { config } from "./config";

export type MatchKind = "exact" | "shifted" | "agnostic" | "out-of-range";

/**
 * How to apply a duration offset when the stream length doesn't exactly match:
 *
 * - conservative (default): shift start by the offset, but only shift end if it
 *   makes the segment shorter (i.e. end_ms decreases). Watching a bit more intro
 *   is fine; accidentally skipping real content is not.
 * - greedy: shift both start and end by the full offset (original behaviour).
 * - none: return the original timestamps unchanged (still excludes out-of-range).
 */
export type AdjustMode = "conservative" | "greedy" | "none";

export interface DurationAdjustment {
  /** start/end after applying any offset shift */
  startMs: number;
  endMs: number;
  /** offset applied (requested - stored), 0 when not shifted */
  offsetMs: number;
  adjusted: boolean;
  kind: MatchKind;
}

/**
 * Adjust a stored segment's timestamps for a requested stream duration.
 *
 * offset = requestedDuration - storedDuration.
 * i.e. if the requested stream is N ms longer than the stored one, we assume an
 * extra logo/scene at the start and push timestamps later by N ms.
 *
 * - |offset| <= exactTolerance  -> exact match, no shift
 * - within shiftTolerance       -> shift according to mode
 * - beyond shiftTolerance       -> out-of-range (likely a different version)
 *
 * When either duration is missing we can't compare, so it's "agnostic".
 */
export function adjustForDuration(
  segment: { startMs: number; endMs: number; durationMs: number | null },
  requestedDurationMs: number | null,
  mode: AdjustMode = "conservative",
): DurationAdjustment {
  const { exactToleranceMs, shiftToleranceMs } = config.duration;

  if (requestedDurationMs == null || segment.durationMs == null) {
    return {
      startMs: segment.startMs,
      endMs: segment.endMs,
      offsetMs: 0,
      adjusted: false,
      kind: "agnostic",
    };
  }

  const offset = requestedDurationMs - segment.durationMs;
  const abs = Math.abs(offset);

  if (abs <= exactToleranceMs) {
    return {
      startMs: segment.startMs,
      endMs: segment.endMs,
      offsetMs: 0,
      adjusted: false,
      kind: "exact",
    };
  }

  if (abs <= shiftToleranceMs) {
    if (mode === "none") {
      return {
        startMs: segment.startMs,
        endMs: segment.endMs,
        offsetMs: offset,
        adjusted: false,
        kind: "exact",
      };
    }

    const shiftedStart = segment.startMs + offset;
    // conservative: only shift end when doing so makes it smaller (segment gets shorter).
    // greedy: shift end by the full offset unconditionally.
    const shiftedEnd =
      mode === "greedy" || offset < 0
        ? segment.endMs + offset
        : segment.endMs;

    return {
      startMs: shiftedStart,
      endMs: shiftedEnd,
      offsetMs: offset,
      adjusted: true,
      kind: "shifted",
    };
  }

  return {
    startMs: segment.startMs,
    endMs: segment.endMs,
    offsetMs: offset,
    adjusted: false,
    kind: "out-of-range",
  };
}

/** Rank a match kind for "best segment" selection (lower = better). */
export function matchRank(kind: MatchKind): number {
  switch (kind) {
    case "exact":
      return 0;
    case "shifted":
      return 1;
    case "agnostic":
      return 2;
    case "out-of-range":
      return 3;
  }
}
