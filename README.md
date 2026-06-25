# ⏭ SkipDB

**Open, crowdsourced skip timestamps for movies & TV.** Intros, recaps, outros and "next-time"
previews — contributed by people, reviewed by the community, and **published openly** so the data
can never be quietly locked away or sold off.

- **Code license:** [AGPL-3.0](./LICENSE)
- **Data license:** [CC BY-NC-SA 4.0](./DATA-LICENSE) (unless you have explicit written permission)

> SkipDB's whole point is that the data stays open. Other services collect community submissions
> but keep the resulting database proprietary so they can monetize it or shut it down. SkipDB keeps
> both the code **and** the data open, with a public data dump (planned, SponsorBlock-style).

## Why SkipDB is different

| | SkipDB | Typical alternatives |
|---|---|---|
| Source code | ✅ AGPL-3.0 | Often closed |
| Submitted data | ✅ CC BY-NC-SA 4.0, openly published | Frequently proprietary |
| Millisecond precision | ✅ stored in ms, returned in ms **and** seconds | seconds-only is common |
| Multi-stream durations | ✅ duration-aware matching + smart offset shift | rarely handled |
| Public data dump | ✅ planned (no user PII) | rarely available |

## Features

- Contribute **intro / recap / outro / preview** timestamps keyed by **IMDb ID** (movies + TV).
- Time stored in **milliseconds** at **0.1s precision** (finer is pointless for skipping),
  returned in **both seconds and milliseconds**.
- The read API returns the **single best result per type** as a top-level object
  (`segments: { intro, recap, outro, preview }`, each the best match or `null`).
- A denormalized **resolved_segments** table holds the pre-decided best per episode/type, so the
  common no-duration read is one indexed lookup; duration-aware matching falls back to the small
  per-episode set. (Kept in Postgres, not Redis — it's bounded and benefits from persistence +
  multi-instance consistency.)
- Optional **stream duration** per submission so different streams (Netflix vs Blu-ray rip, etc.)
  can be compared — with a **smart offset shift**: if the requested stream is ~Ns longer than the
  stored one, SkipDB assumes an extra logo/scene at the start and shifts timestamps by N seconds.
- **Logged-in accounts** — email + password, GitHub / Google OAuth, or email magic link — plus
  **personal API keys** (generate / reset / reveal with show-hide + copy). Email/password works out
  of the box with no external setup. Non-social users can edit their name and email.
- **Smart auto-approval**: submissions that match the established pattern for a show, reach
  consensus, or come from trusted users go live immediately; the rest enter a **review queue**.
- **Admin interface** for approve / reject with an audit log, and a **context-rich review queue**
  (submitter track record, existing data for the episode and how it compares, the show's usual
  segment length, and whether a stream duration was provided and how it lines up).
- **Community voting** (good / bad skip) that scores and ranks segments.
- **Edit & delete your own submissions** — edits are re-reviewed, so a segment that no longer fits
  the show's pattern returns to the queue even if it was previously approved.
- **Browse** the most-covered titles, jump to any episode's JSON via a one-click API link, and get
  live seconds⇄`mm:ss` hints while entering times.
- **Open reading** with reasonable rate limits.

## Quick start

```bash
# 1. Install deps
pnpm install

# 2. Start Postgres (Docker)
docker compose up -d

# 3. Configure env
cp .env.example .env
# generate an AUTH_SECRET:  openssl rand -base64 32

# 4. Create schema + seed sample data
pnpm db:push
pnpm db:seed

# 5. Run
pnpm dev   # http://localhost:3000
```

Without OAuth/SMTP/TMDB keys the app still runs: **email + password sign-in works out of the box**
(only `AUTH_SECRET` is required), and you can always enter IMDb IDs manually (TMDB just adds search
+ artwork). OAuth and magic-link sign-in light up automatically when their env vars are set.

To make yourself an admin, set `ADMIN_EMAILS=you@example.com` in `.env` before signing in.

### Testing the write API locally (no OAuth needed)

To exercise submit/vote endpoints without configuring OAuth or SMTP, mint API
keys for the seeded users:

```bash
pnpm dev:keys   # prints a moderator key and a regular-user key
```

Then call the API with `X-API-Key: skdb_…`. (The admin web UI still requires a
real signed-in session.)

## API

Reading is open (rate-limited). All timestamps are returned in **both** `start_ms`/`end_ms` and
`start_sec`/`end_sec`.

```bash
# Fetch approved segments for an episode
curl "http://localhost:3000/api/segments?imdb_id=tt0903747&season=1&episode=1"

# Same, but for a specific stream length (ms) — enables offset-aware matching
curl "http://localhost:3000/api/segments?imdb_id=tt0903747&season=1&episode=1&duration=1412000"

# Submit (needs a logged-in session cookie or an API key)
curl -X POST http://localhost:3000/api/segments \
  -H "Authorization: Bearer skdb_xxx" \
  -H "Content-Type: application/json" \
  -d '{"imdb_id":"tt0903747","season":1,"episode":1,"segment_type":"intro",
       "start_ms":61000,"end_ms":91000,"duration_ms":1412000}'
```

`start`/`end` also accept seconds or clock strings (`mm:ss`, `hh:mm:ss`) via `start_sec`/`end_sec`.

Full docs live at `/docs` when running.

## Project layout

```
src/
  app/            Next.js App Router (pages + /api route handlers)
  db/             Drizzle schema, migrations, seed
  lib/            auth, tmdb, validation, duration matching, review logic, rate limit, api keys
  components/     UI components + design system
```

## Data dump (planned)

The schema is built so a public dump is a clean query over `segments` joined to title/episode
metadata with **no user PII**. A SponsorBlock-style downloadable dump + mirror is on the roadmap;
the `/api/dump` endpoint is a placeholder for now.

## Contributing & terms

By submitting, you agree your contribution is published under **CC BY-NC-SA 4.0** and may be freely
used under that license. See [TERMS.md](./TERMS.md).
