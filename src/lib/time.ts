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

/**
 * SkipDB stores time to one decimal place of seconds (100 ms granularity) —
 * finer precision than that is pointless for skipping. Round any ms value to
 * the nearest decisecond.
 */
export const TIME_GRANULARITY_MS = 100;
export function roundTime(ms: number): number {
  return Math.round(ms / TIME_GRANULARITY_MS) * TIME_GRANULARITY_MS;
}

/** ms -> seconds at one decimal place (e.g. 61500 -> 61.5). */
export function msToSec(ms: number): number {
  return Math.round(ms / TIME_GRANULARITY_MS) / 10;
}

/** ms -> clock string hh:mm:ss(.d) at one decimal of seconds. */
export function msToClock(ms: number): string {
  const rounded = roundTime(ms);
  const totalSec = Math.floor(rounded / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  const tenths = Math.round((rounded % 1000) / 100);
  return tenths ? `${base}.${tenths}` : base;
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
    adjusted: opts.adjusted,
    offset_sec: msToSec(opts.offsetMs),
  };
}
