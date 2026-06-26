import { config } from "./config";

export type MatchKind = "exact" | "shifted" | "agnostic" | "out-of-range";

/**
 * How to apply a duration offset when the stream length doesn't exactly match:
 *
 * - conservative (default): only shift start and end earlier (offset < 0). Never
 *   shifts timestamps later — the skip button appears at the earliest possible
 *   point, so the user may have a few extra seconds to wait rather than missing
 *   the window entirely.
 * - greedy: shift both start and end by the full offset in either direction.
 * - none: return the original timestamps unchanged (still marks out-of-range).
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

    // greedy: shift both in either direction.
    // conservative: only shift earlier (offset < 0) — never push the button later.
    const apply = mode === "greedy" || offset < 0;
    return {
      startMs: apply ? segment.startMs + offset : segment.startMs,
      endMs:   apply ? segment.endMs   + offset : segment.endMs,
      offsetMs: offset,
      adjusted: apply,
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
