#!/usr/bin/env tsx
/**
 * Downloads the SkipDB dump and upserts changed episodes into Cloudflare D1.
 *
 * Usage:
 *   pnpm import              # incremental: only changed episodes
 *   pnpm import:full         # replace all episodes regardless
 *
 * Required env vars (set in .env or environment):
 *   IMPORT_CF_ACCOUNT_ID    – Cloudflare account ID
 *   IMPORT_CF_DATABASE_ID   – D1 database ID (from `wrangler d1 list`)
 *   IMPORT_CF_API_TOKEN     – API token with D1:Edit permission
 *
 * Optional:
 *   DUMP_URL         – override the dump URL (default: GitHub Releases latest)
 */

import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getIntroLengthEstimate, type StoredSegment } from "../src/resolve";

const __dir = dirname(fileURLToPath(import.meta.url));

// Load .env from project root if present
const envPath = join(__dir, "..", ".env");
if (existsSync(envPath)) {
  const lines = (await readFile(envPath, "utf8")).split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const DUMP_URL =
  process.env.DUMP_URL ??
  "https://github.com/SkipDB-TV/skipdb/releases/latest/download/skipdb-dump.json";

const CF_ACCOUNT_ID = process.env.IMPORT_CF_ACCOUNT_ID;
const CF_DATABASE_ID = process.env.IMPORT_CF_DATABASE_ID;
const CF_API_TOKEN = process.env.IMPORT_CF_API_TOKEN;
if (!CF_ACCOUNT_ID || !CF_DATABASE_ID || !CF_API_TOKEN) {
  console.error(
    "Missing required env vars: IMPORT_CF_ACCOUNT_ID, IMPORT_CF_DATABASE_ID, IMPORT_CF_API_TOKEN",
  );
  process.exit(1);
}

const FULL = process.argv.includes("--full");
const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DATABASE_ID}/query`;

// D1 is a single SQLite instance — many small writes hitting it in parallel is
// what triggers "storage operation exceeded timeout" (code 7429). We fight that
// on three fronts:
//   1. Fewer, bigger writes: batch ROWS_PER_BATCH episodes into one multi-row
//      INSERT (7 columns × 14 rows = 98 bound params, just under D1's 100 cap).
//   2. Modest write parallelism instead of a 20-wide fan-out.
//   3. Retry transient D1/network errors with exponential backoff — these are
//      expected under load and almost always succeed on a later attempt.
const ROWS_PER_BATCH = 14;
const WRITE_CONCURRENCY = 5;
const MAX_RETRIES = 6;
const RETRY_BASE_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Transient D1 / network failures that a later attempt tends to clear. */
function isRetriable(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("7429") ||
    msg.includes("exceeded timeout") ||
    msg.includes("object to be reset") ||
    msg.includes("storage operation") ||
    msg.includes("network connection lost") ||
    msg.includes("please try again") ||
    msg.includes("http 429") ||
    msg.includes("http 500") ||
    msg.includes("http 503") ||
    msg.includes("fetch failed") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset")
  );
}

// ---------------------------------------------------------------------------

interface D1Row {
  key: string;
  updated_at: string;
}

interface D1Response {
  success: boolean;
  errors: unknown[];
  result: Array<{ results: D1Row[] }>;
}

interface DumpSegment {
  imdb_id: string;
  season: number | null;
  episode: number | null;
  segment_type: StoredSegment["type"];
  start_ms: number;
  end_ms: number;
  duration_ms: number | null;
  score: number;
  votes_up: number;
  votes_down: number;
  updated_at: string;
}

interface Dump {
  segments: DumpSegment[];
}

interface Episode {
  key: string;
  imdbId: string;
  season: number | null;
  episode: number | null;
  segments: StoredSegment[];
  maxUpdatedAt: string;
}

async function d1(sql: string, params: unknown[] = []): Promise<D1Row[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(D1_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
      });
      if (res.status === 429 || res.status >= 500)
        throw new Error(`D1 error: HTTP ${res.status}`);
      const body = (await res.json()) as D1Response;
      if (!body.success)
        throw new Error(`D1 error: ${JSON.stringify(body.errors)}`);
      return body.result?.[0]?.results ?? [];
    } catch (err) {
      if (attempt >= MAX_RETRIES || !isRetriable(err)) throw err;
      const backoff =
        RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 250);
      process.stdout.write(
        `\n  transient D1 error (${
          err instanceof Error ? err.message : String(err)
        }) — retrying in ${backoff}ms [attempt ${attempt + 1}/${MAX_RETRIES}]\n`,
      );
      await sleep(backoff);
    }
  }
}

function episodeKey(
  imdbId: string,
  season: number | null,
  episode: number | null,
): string {
  if (season == null && episode == null) return imdbId;
  return `${imdbId}:${season}:${episode}`;
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Fetching dump from ${DUMP_URL} ...`);
  const res = await fetch(DUMP_URL);
  if (!res.ok) throw new Error(`Failed to fetch dump: HTTP ${res.status}`);
  const dump = (await res.json()) as Dump;
  console.log(`Dump contains ${dump.segments.length} segments`);

  // Group segments by episode key, tracking max updated_at per episode.
  const episodeMap = new Map<string, Episode>();
  for (const seg of dump.segments) {
    const key = episodeKey(seg.imdb_id, seg.season, seg.episode);
    if (!episodeMap.has(key)) {
      episodeMap.set(key, {
        key,
        imdbId: seg.imdb_id,
        season: seg.season,
        episode: seg.episode,
        segments: [],
        maxUpdatedAt: "",
      });
    }
    const ep = episodeMap.get(key)!;
    ep.segments.push({
      type: seg.segment_type,
      start_ms: seg.start_ms,
      end_ms: seg.end_ms,
      duration_ms: seg.duration_ms,
      score: seg.score,
      votes_up: seg.votes_up,
      votes_down: seg.votes_down,
    });
    if (seg.updated_at > ep.maxUpdatedAt) ep.maxUpdatedAt = seg.updated_at;
  }
  console.log(`Found ${episodeMap.size} unique episodes`);

  // Build intro index across all segments for the estimate computation.
  // We always do this from the full dump so estimates stay accurate even on
  // incremental runs where only a subset of episodes are upserted.
  const introsByImdbId: Record<
    string,
    { season: number | null; start_ms: number; end_ms: number }[]
  > = {};
  for (const seg of dump.segments) {
    if (seg.segment_type !== "intro") continue;
    (introsByImdbId[seg.imdb_id] ??= []).push({
      season: seg.season,
      start_ms: seg.start_ms,
      end_ms: seg.end_ms,
    });
  }

  // Determine which episodes actually need to be written.
  let toUpdate: Episode[];
  if (FULL) {
    console.log("--full: replacing all episodes");
    toUpdate = [...episodeMap.values()];
  } else {
    console.log("Fetching existing updated_at timestamps from D1 ...");
    const existing = await d1("SELECT key, updated_at FROM episodes");
    const existingMap = new Map(existing.map((r) => [r.key, r.updated_at]));
    console.log(`D1 currently has ${existingMap.size} episodes`);

    toUpdate = [...episodeMap.values()].filter(
      (ep) =>
        !existingMap.has(ep.key) || existingMap.get(ep.key)! < ep.maxUpdatedAt,
    );
  }

  if (toUpdate.length === 0) {
    console.log("Nothing to update — D1 is already up to date.");
    return;
  }
  console.log(`Upserting ${toUpdate.length} episodes ...`);

  // One row's worth of bound parameters, in column order.
  const rowParams = (ep: Episode): unknown[] => [
    ep.key,
    ep.imdbId,
    ep.season,
    ep.episode,
    JSON.stringify(ep.segments),
    getIntroLengthEstimate(introsByImdbId, ep.imdbId, ep.season),
    ep.maxUpdatedAt,
  ];

  // Chunk episodes into multi-row INSERTs so D1 gets a handful of larger writes
  // rather than thousands of tiny concurrent ones.
  const batches: Episode[][] = [];
  for (let i = 0; i < toUpdate.length; i += ROWS_PER_BATCH) {
    batches.push(toUpdate.slice(i, i + ROWS_PER_BATCH));
  }

  const writeBatch = (batch: Episode[]) => {
    const sql =
      "INSERT OR REPLACE INTO episodes " +
      "(key, imdb_id, season, episode, segments, intro_length_estimate_ms, updated_at) VALUES " +
      batch.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
    return d1(sql, batch.flatMap(rowParams));
  };

  let done = 0;
  for (let i = 0; i < batches.length; i += WRITE_CONCURRENCY) {
    const slice = batches.slice(i, i + WRITE_CONCURRENCY);
    await Promise.all(slice.map(writeBatch));
    done += slice.reduce((n, b) => n + b.length, 0);
    process.stdout.write(`\r  ${done} / ${toUpdate.length}`);
  }

  console.log(`\nDone — upserted ${toUpdate.length} episodes.`);
}

main().catch((err: Error) => {
  console.error("\nImport failed:", err.message);
  process.exit(1);
});
