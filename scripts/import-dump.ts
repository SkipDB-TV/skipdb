/**
 * Seeds a fresh database from a SkipDB dump file (local or remote URL).
 * Safe to re-run: uses upsert (ON CONFLICT DO NOTHING for segments).
 * After importing, run 'pnpm db:resolve' to rebuild the resolved_segments cache.
 *
 * Usage:
 *   pnpm db:import                                   # uses DUMP_URL env var or skipdb-dump.json
 *   pnpm db:import ./skipdb-dump.json                # local file
 *   pnpm db:import https://…/skipdb-dump.json        # remote URL
 *
 * Requires DATABASE_URL in env (or .env file).
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../src/db";
import { titles, segments } from "../src/db/schema";

interface DumpSegment {
  imdb_id: string;
  title: string | null;
  media_type: "movie" | "series" | null;
  season: number | null;
  episode: number | null;
  segment_type: "intro" | "recap" | "outro" | "preview";
  status: "pending" | "approved" | "rejected";
  start_ms: number;
  end_ms: number;
  duration_ms: number | null;
  votes_up: number;
  votes_down: number;
  score: number;
  created_at: string;
}

interface Dump {
  segments: DumpSegment[];
}

async function loadDump(source: string): Promise<Dump> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    console.log(`Fetching ${source}…`);
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching dump`);
    return res.json() as Promise<Dump>;
  }
  console.log(`Reading ${source}…`);
  return JSON.parse(readFileSync(source, "utf8")) as Dump;
}

const source = process.argv[2] ?? process.env.DUMP_URL ?? "skipdb-dump.json";
const dump = await loadDump(source);
console.log(`  ${dump.segments.length} segments to import`);

// Upsert titles first
const byImdb = new Map<string, { name: string; mediaType: "movie" | "series" }>();
for (const s of dump.segments) {
  if (!byImdb.has(s.imdb_id) && s.title && s.media_type) {
    byImdb.set(s.imdb_id, { name: s.title, mediaType: s.media_type });
  }
}

console.log(`Upserting ${byImdb.size} titles…`);
const titleIdByImdb = new Map<string, number>();
for (const [imdbId, meta] of byImdb) {
  const [row] = await db
    .insert(titles)
    .values({ imdbId, name: meta.name, mediaType: meta.mediaType })
    .onConflictDoUpdate({ target: titles.imdbId, set: { name: meta.name } })
    .returning({ id: titles.id });
  titleIdByImdb.set(imdbId, row.id);
}

console.log("Inserting segments (skipping duplicates)…");
const BATCH = 500;
let inserted = 0;
for (let i = 0; i < dump.segments.length; i += BATCH) {
  const batch = dump.segments.slice(i, i + BATCH);
  const values = batch
    .map((s) => {
      const titleId = titleIdByImdb.get(s.imdb_id);
      if (!titleId) return null;
      return {
        titleId,
        imdbId: s.imdb_id,
        season: s.season,
        episode: s.episode,
        segmentType: s.segment_type,
        status: s.status,
        startMs: s.start_ms,
        endMs: s.end_ms,
        durationMs: s.duration_ms,
        autoApproved: true,
        source: "api" as const,
        votesUp: s.votes_up,
        votesDown: s.votes_down,
        score: s.score,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (values.length > 0) {
    await db.insert(segments).values(values).onConflictDoNothing();
    inserted += values.length;
  }

  process.stdout.write(`\r  ${Math.min(i + BATCH, dump.segments.length)}/${dump.segments.length}`);
}

console.log(`\nDone — ${inserted} segments inserted.`);
console.log("Run 'pnpm db:resolve' to rebuild the resolved_segments cache.");
process.exit(0);
