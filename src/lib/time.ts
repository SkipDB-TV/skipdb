/**
 * Time helpers. SkipDB stores everything in milliseconds but accepts and
 * returns seconds + clock strings for convenience.
 */

/** Parse seconds (number/string) or a clock string (mm:ss, hh:mm:ss) into ms. */
export function parseTimeToMs(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.round(input * 1000);
  }
  if (typeof input === "string") {
    const s = input.trim();
    if (s === "") return null;
    if (s.includes(":")) {
      const parts = s.split(":").map((p) => Number(p));
      if (parts.some((n) => !Number.isFinite(n))) return null;
      let secs = 0;
      for (const p of parts) secs = secs * 60 + p;
      return Math.round(secs * 1000);
    }
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 1000);
  }
  return null;
}

/** ms -> seconds with millisecond precision (e.g. 61500 -> 61.5). */
export function msToSec(ms: number): number {
  return Math.round(ms) / 1000;
}

/** ms -> clock string hh:mm:ss(.mmm). */
export function msToClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  const remMs = Math.round(ms % 1000);
  return remMs ? `${base}.${String(remMs).padStart(3, "0")}` : base;
}

/**
 * Shape a stored segment's times into the public dual ms+seconds representation,
 * carrying any duration adjustment metadata.
 */
export function publicTimes(opts: {
  startMs: number;
  endMs: number;
  offsetMs: number;
  adjusted: boolean;
}) {
  return {
    start_ms: opts.startMs,
    end_ms: opts.endMs,
    start_sec: msToSec(opts.startMs),
    end_sec: msToSec(opts.endMs),
    duration_skipped_ms: opts.endMs - opts.startMs,
    duration_skipped_sec: msToSec(opts.endMs - opts.startMs),
    adjusted: opts.adjusted,
    offset_ms: opts.offsetMs,
  };
}
