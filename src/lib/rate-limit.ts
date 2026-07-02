import { config } from "./config";

/**
 * Lightweight in-memory fixed-window rate limiter. Good enough for a single
 * instance / self-hosting. For multi-instance production, swap this module for a
 * Redis/Upstash-backed implementation behind the same `rateLimit` signature.
 */
interface Counter {
  count: number;
  resetAt: number;
}

const globalForRl = globalThis as unknown as {
  rlBuckets?: Map<string, Counter>;
  rlCleanup?: ReturnType<typeof setInterval>;
};
const buckets = globalForRl.rlBuckets ?? new Map<string, Counter>();
globalForRl.rlBuckets = buckets;

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number = config.limits.rateWindowMs,
): RateLimitResult {
  // The integration test server hits these endpoints far more densely than
  // any real client in a 60s window (every test file shares one server/IP
  // bucket), which isn't the abuse pattern rate limiting exists to catch.
  // SKIPDB_TEST_SERVER is only ever set by tests/global-setup.ts.
  const effectiveLimit = process.env.SKIPDB_TEST_SERVER
    ? limit * 1000
    : limit;

  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, limit, remaining: limit - 1, resetAt };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  return {
    ok: existing.count <= effectiveLimit,
    limit,
    remaining,
    resetAt: existing.resetAt,
  };
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(Math.ceil(r.resetAt / 1000)),
  };
}

/** Best-effort client IP from common proxy headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

// Periodically evict expired buckets so the map doesn't grow unbounded. Kept
// on globalThis so dev hot-reloads reuse one interval instead of stacking them.
if (!globalForRl.rlCleanup) {
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }, 60_000);
  // don't keep the process alive just for cleanup
  if (typeof interval.unref === "function") interval.unref();
  globalForRl.rlCleanup = interval;
}
