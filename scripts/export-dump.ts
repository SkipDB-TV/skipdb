/**
 * Generates skipdb-dump.json in the repo root — all segments (all statuses)
 * with vote counts. No user data is included.
 *
 * Run: pnpm db:export
 * Requires DATABASE_URL in env (or .env file).
 */

import "dotenv/config";
import { writeFileSync } from "fs";
import { db } from "../src/db";
import { segments, titles } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { msToSec } from "../src/lib/time";

console.log("Querying all segments…");
const rows = await db
  .select({
    imdb_id: segments.imdbId,
    title: titles.name,
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
  })
  .from(segments)
  .leftJoin(titles, eq(segments.titleId, titles.id));

const data = rows.map((r) => ({
  ...r,
  start_sec: msToSec(r.start_ms),
  end_sec: msToSec(r.end_ms),
}));

writeFileSync(
  "skipdb-dump.json",
  JSON.stringify({
    license: "ODbL 1.0",
    license_url: "https://opendatacommons.org/licenses/odbl/1-0/",
    generated_at: new Date().toISOString(),
    count: data.length,
    note: "Contains no user data. By using this data you agree to ODbL 1.0 unless you have explicit permission.",
    segments: data,
  }),
);

console.log(`→ skipdb-dump.json (${data.length} segments)`);
process.exit(0);
