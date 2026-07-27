/**
 * Generates skipdb-dump.json in the repo root — every segment EXCEPT
 * disabled ones, with vote counts. Submitter user IDs are included for
 * moderation continuity (bulk delete by user) but no PII (names, emails) is
 * exported.
 *
 * This is the file published to GitHub Releases and is what `DUMP_URL` points
 * `/api/dump` at when configured. Pending/rejected segments are included
 * deliberately — self-hosters doing a full-fork restore benefit from that
 * continuity — but `disabled` segments (an admin disabled the submitting
 * user, e.g. a spammer) are always excluded by default: those aren't a
 * moderation state, they're removed content, and shouldn't resurface in a
 * public artifact just because someone re-imports this dump.
 *
 * Pass --all to include disabled segments too — only for your own private
 * disaster-recovery mirror of this exact instance, never to publish.
 *
 * Run: pnpm db:export
 *      pnpm db:export -- --all
 * Requires DATABASE_URL in env (or .env file).
 */

import "../src/lib/load-env";
import { writeFileSync } from "fs";
import { db } from "../src/db";
import { segments, titles } from "../src/db/schema";
import { eq, ne } from "drizzle-orm";

const includeDisabled = process.argv.includes("--all");

console.log(includeDisabled ? "Querying all segments (including disabled)…" : "Querying segments (excluding disabled)…");
const data = await db
  .select({
    id: segments.id,
    imdb_id: segments.imdbId,
    media_type: titles.mediaType,
    season: segments.season,
    episode: segments.episode,
    segment_type: segments.segmentType,
    status: segments.status,
    start_ms: segments.startMs,
    end_ms: segments.endMs,
    duration_ms: segments.durationMs,
    votes_up: segments.votesUp,
    votes_down: segments.votesDown,
    score: segments.score,
    created_at: segments.createdAt,
    updated_at: segments.updatedAt,
  })
  .from(segments)
  .leftJoin(titles, eq(segments.titleId, titles.id))
  .where(includeDisabled ? undefined : ne(segments.status, "disabled"));

writeFileSync(
  "skipdb-dump.json",
  JSON.stringify({
    license: "ODbL 1.0 + Service Provider Reciprocity",
    license_url: "https://skipdb.tv/license",
    generated_at: new Date().toISOString(),
    count: data.length,
    note: "By using this data you agree to ODbL 1.0 + Service Provider Reciprocity unless you have explicit permission.",
    segments: data,
  }),
);

console.log(`→ skipdb-dump.json (${data.length} segments)`);
process.exit(0);
