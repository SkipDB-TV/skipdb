/**
 * Generates skipdb-dump.json in the repo root — all segments (all statuses)
 * with vote counts. Submitter user IDs are included for moderation continuity
 * (bulk delete by user) but no PII (names, emails) is exported.
 *
 * Run: pnpm db:export
 * Requires DATABASE_URL in env (or .env file).
 */

import "../src/lib/load-env";
import { writeFileSync } from "fs";
import { db } from "../src/db";
import { segments, titles } from "../src/db/schema";
import { eq } from "drizzle-orm";

console.log("Querying all segments…");
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
  .leftJoin(titles, eq(segments.titleId, titles.id));

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
