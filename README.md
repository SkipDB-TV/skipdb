<div align="center">
  <img src=".github/skipdb_full.jpg" width="680" alt="SkipDB" />

### Intros. Recaps. Credits. Previews. Open data, forever.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)
[![Data: ODbL 1.0](https://img.shields.io/badge/Data-ODbL_1.0-green.svg)](./DATA-LICENSE)
[![Status](https://uptime.betterstack.com/status-badges/v1/monitor/2qlce.svg)](https://status.skipdb.tv)

</div>

---

# SkipDB

**Open, crowdsourced skip timestamps for movies & TV.** Intros, recaps, outros and "next-time"
previews — contributed by people, reviewed by the community, and **published openly** so the data
can never be quietly locked away or sold off.

- **Code license:** [AGPL-3.0](./LICENSE)
- **Data license:** [ODbL 1.0 + reciprocity](./DATA-LICENSE) (unless you have explicit written permission)
- **Status:** [status.skipdb.tv](https://status.skipdb.tv)

> SkipDB's whole point is that the data stays open. Other services collect community submissions
> but keep the resulting database proprietary so they can monetize it or shut it down. SkipDB keeps
> both the code **and** the data open, with a daily public data dump — so the data survives even if
> this instance disappears.

## Why SkipDB is different

|                        | SkipDB                                          | Typical alternatives              |
| ---------------------- | ----------------------------------------------- | --------------------------------- |
| Source code            | ✅ AGPL-3.0                                     | Often closed                      |
| Submitted data         | ✅ ODbL 1.0 + reciprocity, openly published     | Frequently proprietary            |
| Multi-stream durations | ✅ duration-aware matching + smart offset shift | rarely handled                    |
| Public data dump       | ✅ daily export to GitHub Releases, no user PII | strict terms blocking data access |

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

- artwork). OAuth and magic-link sign-in light up automatically when their env vars are set.

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

# Same, but for a specific stream length in seconds — enables offset-aware matching
curl "http://localhost:3000/api/segments?imdb_id=tt0903747&season=1&episode=1&duration=2820"

# Submit (needs a logged-in session cookie or an API key)
curl -X POST http://localhost:3000/api/segments \
  -H "Authorization: Bearer skdb_xxx" \
  -H "Content-Type: application/json" \
  -d '{"imdb_id":"tt0903747","season":1,"episode":1,"segment_type":"intro",
       "start_ms":61000,"end_ms":91000,"duration_ms":2820000}'
```

`start`/`end` also accept seconds or clock strings (`mm:ss`, `hh:mm:ss`) via `start_sec`/`end_sec`.
`duration` in the GET API is in **seconds**; `duration_ms` in the POST body is in milliseconds.

Full docs live at `/docs` when running.

## Project layout

```
src/
  app/            Next.js App Router (pages + /api route handlers)
  db/             Drizzle schema, migrations, seed
  lib/            auth, tmdb, validation, duration matching, review logic, rate limit, api keys
  components/     UI components + design system
```

## Data dump

A daily GitHub Actions workflow exports all segments to `skipdb-dump.json` and publishes it to
GitHub Releases (`data-latest` tag). The dump includes all statuses and vote counts — no user PII.
The `/api/dump` endpoint redirects to this file when `DUMP_URL` is set.

```bash
# Export locally
pnpm db:export

# Seed a fresh database from the public dump
pnpm db:import https://github.com/SkipDB-TV/skipdb/releases/download/data-latest/skipdb-dump.json
pnpm db:resolve   # rebuild the resolved_segments cache
```

## Hosting a mirror or fork

See [/data](/data) on the live site for full instructions. Short version:

**Read-only mirror** — serves the browse UI and API, disables all writes:

```bash
# Set in your deployment environment
NEXT_PUBLIC_READ_ONLY=true
DUMP_URL=https://github.com/SkipDB-TV/skipdb/releases/download/data-latest/skipdb-dump.json
NEXT_PUBLIC_DUMP_URL=$DUMP_URL
```

**Full fork** — accepts submissions independently:

```bash
pnpm db:migrate
pnpm db:import <dump-url>   # seed from the public dump
pnpm db:resolve
# deploy with your own DATABASE_URL + AUTH_SECRET etc.
```

## Contributing & terms

By submitting, you agree your contribution is published under **ODbL 1.0 + reciprocity** and grant SkipDB the
right to adopt any successor open data license for future exports. See [TERMS.md](./TERMS.md).
