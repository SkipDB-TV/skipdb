/**
 * SkipDB edge read-cache — a generic, self-hostable Cloudflare Worker.
 *
 * A thin, account-free caching reverse proxy that sits in front of a SkipDB READ API
 * (by default https://api.skipdb.tv) and edge-caches its responses on Cloudflare, so the
 * single origin is shielded from read load. It serves the origin's data verbatim and keeps
 * no data of its own. This is OPTIONAL: deploy it only if you want an edge cache in front
 * of your SkipDB instance.
 *
 * Behavior:
 *   - GET / HEAD only. The Cloudflare Cache API (caches.default) is checked first. On a miss,
 *     the same path+query is fetched ONCE from SKIPDB_ORIGIN, cached honoring the origin
 *     Cache-Control (a sane default when absent), and returned verbatim (content-type + body).
 *   - Redirects are preserved (redirect: "manual"), so the /api/dump 302 -> GitHub release is
 *     cached and passed through unfollowed; the client follows it.
 *   - POST / PUT / PATCH / DELETE (writes / contribute) are NEVER proxied -> 405. Send those
 *     directly to the upstream SkipDB API.
 *   - Bounded: an upstream fetch timeout + a response size cap (oversized bodies pass through
 *     uncached, so the cache can never be bloated).
 *   - Fail-soft: on upstream/network/timeout error the origin status passes through (502/504 on
 *     a hard failure), so a client can fall back to talking to the origin directly.
 */

export interface Env {
  SKIPDB_ORIGIN: string;
  DEFAULT_TTL: string;
  DUMP_DEFAULT_TTL: string;
  MAX_TTL: string;
  ORIGIN_TIMEOUT_MS: string;
  MAX_BODY_BYTES: string;
}

const CACHE_NOTE = "skipdb edge read-cache";

const SAFE_METHODS = new Set(["GET", "HEAD"]);

function intVar(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Parse the max-age / s-maxage (s-maxage wins) out of a Cache-Control header. null when none usable. */
function parseTtlFromCacheControl(cc: string | null): number | null {
  if (!cc) return null;
  const lower = cc.toLowerCase();
  if (/\bno-store\b/.test(lower) || /\bprivate\b/.test(lower)) return 0;
  const sMaxAge = lower.match(/s-maxage\s*=\s*(\d+)/);
  if (sMaxAge) return Number.parseInt(sMaxAge[1], 10);
  const maxAge = lower.match(/(?:^|[,\s])max-age\s*=\s*(\d+)/);
  if (maxAge) return Number.parseInt(maxAge[1], 10);
  return null;
}

function isDumpPath(pathname: string): boolean {
  // /api/dump, /dump, and any dump-prefixed read path.
  return /(^|\/)dump(\/|$|\.)/i.test(pathname) || /\/api\/dump\b/i.test(pathname);
}

function methodNotAllowed(): Response {
  return new Response(
    JSON.stringify({
      error: "method_not_allowed",
      message:
        "This is a READ-ONLY SkipDB edge cache. Writes / contribute go to the upstream SkipDB API directly.",
    }),
    {
      status: 405,
      headers: {
        "content-type": "application/json; charset=utf-8",
        allow: "GET, HEAD, OPTIONS",
        "x-edge-cache": CACHE_NOTE,
        "x-cache": "BYPASS",
      },
    },
  );
}

function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
      "access-control-max-age": "86400",
      "x-edge-cache": CACHE_NOTE,
    },
  });
}

/** Stamp the cache identity + status onto a response (returns a fresh, mutable copy). */
function tag(resp: Response, cacheStatus: "HIT" | "MISS" | "BYPASS"): Response {
  const out = new Response(resp.body, resp);
  out.headers.set("x-edge-cache", CACHE_NOTE);
  out.headers.set("x-cache", cacheStatus);
  if (!out.headers.has("access-control-allow-origin")) {
    out.headers.set("access-control-allow-origin", "*");
  }
  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") return corsPreflight();
    if (!SAFE_METHODS.has(method)) return methodNotAllowed();

    const inUrl = new URL(request.url);

    // Cache key: same origin host as the request, normalized path + query. HEAD shares the GET key.
    const cacheKeyUrl = new URL(inUrl.toString());
    const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });
    const cache = caches.default;

    // 1) Cache lookup.
    const cached = await cache.match(cacheKey);
    if (cached) {
      if (method === "HEAD") {
        return tag(new Response(null, cached), "HIT");
      }
      return tag(cached, "HIT");
    }

    // 2) Miss -> fetch the same path+query from the upstream SkipDB origin.
    const originBase = (env.SKIPDB_ORIGIN || "https://api.skipdb.tv").replace(/\/+$/, "");
    const originUrl = `${originBase}${inUrl.pathname}${inUrl.search}`;

    const timeoutMs = intVar(env.ORIGIN_TIMEOUT_MS, 10000);
    const maxBodyBytes = intVar(env.MAX_BODY_BYTES, 5 * 1024 * 1024);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let originResp: Response;
    try {
      originResp = await fetch(originUrl, {
        method: "GET",
        // Preserve redirects (e.g. the /api/dump 302 -> GitHub release) verbatim; the client follows.
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: request.headers.get("accept") ?? "*/*",
          "accept-encoding": "gzip, br",
          "user-agent": "skipdb-edge-cache",
        },
      });
    } catch (err) {
      clearTimeout(timer);
      const aborted = err instanceof Error && err.name === "AbortError";
      // Fail-soft: a hard upstream failure becomes a gateway error the caller can fall back from.
      return new Response(
        JSON.stringify({
          error: aborted ? "origin_timeout" : "origin_unreachable",
          origin: originBase,
        }),
        {
          status: aborted ? 504 : 502,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "x-edge-cache": CACHE_NOTE,
            "x-cache": "BYPASS",
            "access-control-allow-origin": "*",
          },
        },
      );
    }
    clearTimeout(timer);

    // Buffer the body so we can both cap its size and store an independent copy in the cache.
    const bodyBuf = await originResp.arrayBuffer();

    // Oversized body: pass it through verbatim, but do NOT cache it (protects the cache from bloat).
    if (bodyBuf.byteLength > maxBodyBytes) {
      const passthrough = new Response(bodyBuf, originResp);
      return tag(passthrough, "BYPASS");
    }

    // Decide the edge TTL: honor the origin Cache-Control, default when absent, floor dump, clamp to max.
    const defaultTtl = intVar(env.DEFAULT_TTL, 300);
    const dumpTtl = intVar(env.DUMP_DEFAULT_TTL, 3600);
    const maxTtl = intVar(env.MAX_TTL, 86400);

    const originTtl = parseTtlFromCacheControl(originResp.headers.get("cache-control"));
    let ttl = originTtl ?? defaultTtl;
    if (originTtl === 0) ttl = defaultTtl; // origin said max-age=0 -> still shield with our default
    if (isDumpPath(inUrl.pathname)) ttl = Math.max(ttl, dumpTtl);
    ttl = Math.min(Math.max(ttl, 0), maxTtl);

    // Only cache success + cacheable redirects. Pass error statuses through fail-soft, uncached.
    const status = originResp.status;
    const cacheable = status === 200 || status === 203 || status === 301 || status === 302 || status === 308;

    // Build the response we hand back + (optionally) store. Preserve content-type + body verbatim.
    const respHeaders = new Headers(originResp.headers);
    // Set the TTL the edge cache will respect. We rewrite Cache-Control to our computed TTL so the cache
    // honors it consistently (origins like Vercel mark the dump 302 max-age=0, which we floor above).
    if (cacheable && ttl > 0) {
      respHeaders.set("cache-control", `public, max-age=${ttl}`);
    }
    respHeaders.set("x-edge-cache", CACHE_NOTE);
    if (!respHeaders.has("access-control-allow-origin")) {
      respHeaders.set("access-control-allow-origin", "*");
    }

    const toStore = new Response(bodyBuf, {
      status,
      statusText: originResp.statusText,
      headers: respHeaders,
    });

    if (cacheable && ttl > 0) {
      // Store a clone in the edge cache (do not block the response on the write).
      ctx.waitUntil(cache.put(cacheKey, toStore.clone()));
    }

    if (method === "HEAD") {
      return tag(new Response(null, toStore), "MISS");
    }
    return tag(toStore, "MISS");
  },
} satisfies ExportedHandler<Env>;
