import {
  getBestByType,
  SEGMENT_TYPES,
  type AdjustMode,
  type SegmentType,
  type SegmentsResult,
  type StoredSegment,
} from "./resolve";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

interface Env {
  DB: D1Database;
}

// Per-colo edge cache TTL for raw episode data. The Cache API is free (unlike KV writes),
// so a short TTL keeps data fresh after the daily import at negligible D1 cost.
const CACHE_TTL_S = 3600;

interface RequestParams {
  imdbId: string;
  season: number | null;
  episode: number | null;
  durationMs: number | null;
  adjustRaw: AdjustMode;
  types: readonly SegmentType[];
}

interface CacheEntry {
  segments: StoredSegment[];
  intro_length_estimate_ms: number | null;
}

function json(
  data: unknown,
  {
    status = 200,
    headers = {},
  }: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...headers },
  });
}

function apiError(message: string, status = 400) {
  return json({ error: message }, { status });
}

function episodeKey(
  imdbId: string,
  season: number | null,
  episode: number | null,
): string {
  if (season == null && episode == null) return imdbId;
  return `${imdbId}:${season}:${episode}`;
}

function segmentsResponse(
  { imdbId, season, episode, durationMs, adjustRaw, types }: RequestParams,
  rawSegments: StoredSegment[] | null,
  introEstimateMs: number | null,
  timing: string,
) {
  const empty = Object.fromEntries(
    SEGMENT_TYPES.map((t) => [t, null]),
  ) as SegmentsResult;
  const segments = rawSegments
    ? getBestByType(rawSegments, durationMs, adjustRaw, types)
    : empty;
  return json(
    {
      imdb_id: imdbId,
      season,
      episode,
      segments,
      intro_length_estimate_ms: introEstimateMs,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
        "Server-Timing": timing,
      },
    },
  );
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // GET/HEAD /api/segments → edge cache, falling back to D1
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      url.pathname === "/api/segments"
    ) {
      return handleSegments(url, env, ctx);
    }

    // Everything else under /api → Vercel (writes, auth, submit, etc.)
    if (url.pathname.startsWith("/api/")) {
      const target = new URL(request.url);
      target.hostname = "skipdb.vercel.app";
      return fetch(target.toString(), request);
    }

    return apiError("Not found", 404);
  },
};

async function handleSegments(
  url: URL,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const p = url.searchParams;

  const imdbId = p.get("imdb_id")?.toLowerCase();
  if (!imdbId || !/^tt\d{6,10}$/.test(imdbId)) {
    return apiError("imdb_id is required (e.g. tt0903747)");
  }

  const typeRaw = p.get("type") as SegmentType | null;
  const adjustRaw = (p.get("adjust") ?? "conservative") as AdjustMode;

  if (typeRaw && !SEGMENT_TYPES.includes(typeRaw)) {
    return apiError(`type must be one of: ${SEGMENT_TYPES.join(", ")}`);
  }
  if (!["conservative", "greedy", "none"].includes(adjustRaw)) {
    return apiError("adjust must be one of: conservative, greedy, none");
  }

  const params: RequestParams = {
    imdbId,
    season: p.has("season") ? parseInt(p.get("season")!, 10) : null,
    episode: p.has("episode") ? parseInt(p.get("episode")!, 10) : null,
    durationMs: p.has("duration")
      ? Math.round(parseFloat(p.get("duration")!) * 1000)
      : null,
    adjustRaw,
    types: typeRaw ? [typeRaw] : SEGMENT_TYPES,
  };

  const key = episodeKey(params.imdbId, params.season, params.episode);
  const t0 = performance.now();

  // Cache the raw episode data (not the response) since duration/adjust/type vary per request.
  // The Cache API is per-colo and free; D1 remains the source of truth.
  const cache = caches.default;
  const cacheKey = new Request(
    `${url.origin}/__cache/segments/${encodeURIComponent(key)}`,
  );

  const cached = await cache.match(cacheKey).catch(() => undefined);
  if (cached) {
    const { segments, intro_length_estimate_ms } =
      (await cached.json()) as CacheEntry;
    return segmentsResponse(
      params,
      segments,
      intro_length_estimate_ms,
      `cache;dur=${performance.now() - t0}`,
    );
  }

  const row = await env.DB.withSession("first-unconstrained")
    .prepare(
      "SELECT segments, intro_length_estimate_ms FROM episodes WHERE key = ?",
    )
    .bind(key)
    .first<{ segments: string; intro_length_estimate_ms: number | null }>();
  const durMs = performance.now() - t0;

  const rawSegments: StoredSegment[] | null = row
    ? JSON.parse(row.segments)
    : null;

  if (rawSegments) {
    ctx.waitUntil(
      cache
        .put(
          cacheKey,
          new Response(
            JSON.stringify({
              segments: rawSegments,
              intro_length_estimate_ms: row!.intro_length_estimate_ms,
            } satisfies CacheEntry),
            {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": `public, max-age=${CACHE_TTL_S}`,
              },
            },
          ),
        )
        .catch(() => {}),
    );
  }

  return segmentsResponse(
    params,
    rawSegments,
    row?.intro_length_estimate_ms ?? null,
    `d1;dur=${durMs}`,
  );
}
