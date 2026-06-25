import { config } from "./config";

export type MatchKind = "exact" | "shifted" | "agnostic" | "out-of-range";

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
 * offset = requestedDuration - storedDuration, adjusted = stored + offset.
 * i.e. if the requested stream is N ms longer than the stored one, we assume an
 * extra logo/scene at the start and push all timestamps later by N ms.
 *
 * - |offset| <= exactTolerance  -> exact match, no shift
 * - within shiftTolerance       -> shift by offset
 * - beyond shiftTolerance       -> out-of-range (likely a different version)
 *
 * When either duration is missing we can't compare, so it's "agnostic".
 */
export function adjustForDuration(
  segment: { startMs: number; endMs: number; durationMs: number | null },
  requestedDurationMs: number | null,
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
    return {
      startMs: segment.startMs + offset,
      endMs: segment.endMs + offset,
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
