# SkipDB edge read-cache (Cloudflare Worker)

An **optional**, self-hostable [Cloudflare Worker](https://workers.cloudflare.com/) that puts an
edge cache in front of a SkipDB READ API. It is a thin caching reverse proxy: it sits in front of
the SkipDB read endpoints (`https://api.skipdb.tv` by default, or your own instance) and
**edge-caches their responses on Cloudflare**, so the single origin is shielded from read load. It
serves the origin's data **verbatim** and keeps no data of its own.

This is a standalone Worker. It does **not** touch the SkipDB Next.js app — point it at any SkipDB
origin and deploy it independently. Adopt it, adapt it, or ignore it.

> **Read-only by design.** This caches *reads*. It is not a SkipDB instance and has no database.
> SkipDB's read API already sets sensible `Cache-Control` headers (`s-maxage` on `/api/segments`,
> `max-age` on `/api/dump`); this Worker simply honors them at the edge so popular reads never
> reach the origin. Writes and contributions are never proxied — they go straight to the origin.

## Why you might want this

SkipDB reads are open and rate-limited, and the read API is already CDN-friendly. If your instance
is on a single origin (e.g. Next.js on Vercel) and you see heavy read traffic, an edge cache in
front of it absorbs the repeat reads (the same episode looked up over and over) so the origin only
serves cache misses. It is entirely optional and complementary to the read-only-mirror and full-fork
options already described in the main README's *Hosting a mirror or fork* section.

## Behavior

- **Reads only.** `GET` / `HEAD` pass through. `POST` / `PUT` / `PATCH` / `DELETE`
  (writes / contribute) return **405** and are never forwarded; send those to the SkipDB API directly.
- **Cache-first.** Checks the Cloudflare Cache API; on a miss it fetches the same path+query from the
  origin **once**, caches it, and returns it. A second identical `GET` is served from cache.
- **Honors origin caching.** The TTL comes from the origin `Cache-Control` (`s-maxage` / `max-age`).
  When the origin sets none (or `max-age=0`), a sane `DEFAULT_TTL` is applied so even header-less
  reads are still cached. The dump route is floored to `DUMP_DEFAULT_TTL`. All TTLs are clamped to
  `MAX_TTL`.
- **Redirects preserved.** The proxy does not follow redirects (`redirect: "manual"`), so the
  `/api/dump` 302 (to the GitHub Releases dump) is cached and passed through unfollowed; the client
  follows it.
- **Verbatim.** Content-type and body are preserved exactly.
- **Bounded.** The upstream fetch has a timeout (`ORIGIN_TIMEOUT_MS`); response bodies over
  `MAX_BODY_BYTES` are passed through **uncached**, so the cache can never be bloated.
- **Fail-soft.** Any origin/network/timeout failure passes the origin status through, or returns
  `502` / `504` on a hard failure, so a client can fall back to talking to the origin directly.

## Endpoints it caches

It mirrors every **GET read** path 1:1 against `SKIPDB_ORIGIN`. Examples (matching the SkipDB API):

- `GET /api/segments?imdb_id=tt0903747&season=1&episode=1` -> the skip-segment JSON.
- `GET /api/dump` -> the upstream 302 to the latest SkipDB dump on GitHub Releases (ODbL 1.0).

## Response headers

| Header | Meaning |
| --- | --- |
| `x-edge-cache` | `skipdb edge read-cache` (identifies responses served through this Worker) |
| `x-cache` | `HIT` (served from cache) / `MISS` (fetched from origin) / `BYPASS` (uncached) |
| `cf-cache-status` | populated by the Cloudflare edge cache (`HIT` / `MISS` / `DYNAMIC`) |

## Configuration (`wrangler.toml` `[vars]`)

| Var | Default | Purpose |
| --- | --- | --- |
| `SKIPDB_ORIGIN` | `https://api.skipdb.tv` | upstream read origin — **set this to your own instance** |
| `DEFAULT_TTL` | `300` | TTL when the origin sets none (or `max-age=0`) |
| `DUMP_DEFAULT_TTL` | `3600` | floor TTL for the dump route |
| `MAX_TTL` | `86400` | ceiling on any cached TTL |
| `ORIGIN_TIMEOUT_MS` | `10000` | upstream fetch timeout |
| `MAX_BODY_BYTES` | `5242880` | size cap; larger bodies pass through uncached |

Pointing it at your own SkipDB instance is a one-line change — set `SKIPDB_ORIGIN`; no code edits.

## Deploy

```bash
cd deploy/cloudflare-edge-cache
npm install

# Point it at your origin (skip if you want the api.skipdb.tv default):
#   edit SKIPDB_ORIGIN in wrangler.toml

# Deploy to your Cloudflare account (set account_id in wrangler.toml or pass --account-id):
npx wrangler deploy
```

With no `routes` configured, the Worker is reachable at its `*.workers.dev` subdomain. To serve it
from your own hostname, uncomment the `routes` block in `wrangler.toml` and set it to a host on a
zone in your Cloudflare account.

## Verify

```bash
BASE="https://<your-worker-domain>"   # e.g. the workers.dev URL or your custom domain

# 1) read the dump redirect through the cache
curl -sS -D - -o /dev/null "$BASE/api/dump"

# 2) a segment read, twice -> second is x-cache: HIT
curl -sS -D - -o /dev/null "$BASE/api/segments?imdb_id=tt0903747&season=1&episode=1"
curl -sS -D - -o /dev/null "$BASE/api/segments?imdb_id=tt0903747&season=1&episode=1"

# 3) a write is rejected (reads only)
curl -sS -X POST -o /dev/null -w "%{http_code}\n" "$BASE/api/segments"   # -> 405
```

## License

This Worker is part of the SkipDB repository and is distributed under the repository's
[AGPL-3.0](../../LICENSE) license. SkipDB data served through it remains under
[ODbL 1.0 + reciprocity](../../DATA-LICENSE).
