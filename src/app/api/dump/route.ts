import { db } from "@/db";
import { segments, titles } from "@/db/schema";
import { json, apiError, preflight } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { and, asc, eq, gt, or } from "drizzle-orm";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

// Hard cap on rows per delta page so a `since` pull stays a bounded, cacheable
// query instead of a full-table scan. Clients page through with the returned
// `next_cursor` until it is null.
const DELTA_PAGE_LIMIT = 5_000;
const DELTA_PAGE_DEFAULT = 1_000;

/**
 * Encode/decode an opaque keyset cursor over (updated_at, id). Ordering by
 * updated_at alone is not stable (many rows can share a timestamp), so the row
 * id is the tiebreaker and travels in the cursor too.
 */
function encodeCursor(updatedAt: Date, id: number): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`, "utf8").toString(
    "base64url",
  );
}

function decodeCursor(
  raw: string,
): { updatedAt: Date; id: number } | null {
  try {
    const [iso, idRaw] = Buffer.from(raw, "base64url")
      .toString("utf8")
      .split("|");
    const updatedAt = new Date(iso);
    const id = Number(idRaw);
    if (Number.isNaN(updatedAt.getTime()) || !Number.isInteger(id)) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

/**
 * Public data dump of all APPROVED segments — SponsorBlock-style open data.
 * Contains no PII: submitted_by is an opaque user ID for moderation continuity.
 * Licensed ODbL 1.0 + Service Provider Reciprocity.
 *
 * Full dump (no params): streams every approved segment as JSON. A scheduled,
 * downloadable mirror (and CSV variant) is on the roadmap; the schema is built
 * so this stays a clean PII-free query.
 *
 * Incremental delta (`?since=<ISO8601>`, alias `updated_after`): returns only
 * approved segments whose `updated_at` is strictly greater than `since`,
 * ordered by (updated_at, id) and paginated via an opaque `cursor`. This lets a
 * mirror sync just what changed and de-dupe on (id, updated_at) instead of
 * re-pulling the whole table. The per-segment field set is identical to the
 * full dump (id and updated_at are already included), so the same import path
 * handles both.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sinceRaw =
    url.searchParams.get("since") ?? url.searchParams.get("updated_after");
  const isDelta = sinceRaw != null;

  // If a pre-generated dump URL is configured, redirect there — no DB query
  // needed. The delta query is dynamic per `since`, so never redirect for it.
  const dumpUrl = process.env.DUMP_URL;
  if (dumpUrl && !isDelta) {
    return Response.redirect(dumpUrl, 302);
  }

  // The dump is a heavy read; cap how often a client can pull it. The delta
  // pull is far lighter, so it gets a more generous bucket.
  const rl = isDelta
    ? rateLimit(`dump-delta:${clientIp(req)}`, 60)
    : rateLimit(`dump:${clientIp(req)}`, 6);
  if (!rl.ok)
    return apiError(
      isDelta
        ? "Rate limit exceeded."
        : "Rate limit exceeded. The dump is cached for an hour.",
      429,
    );

  // Shared select shape for the full dump and the delta, so a single import
  // path handles both. title and the *_sec fields are intentionally omitted
  // (derivable from imdb_id and *_ms), keeping the export lean.
  const fields = {
    id: segments.id,
    imdb_id: segments.imdbId,
    media_type: titles.mediaType,
    season: segments.season,
    episode: segments.episode,
    segment_type: segments.segmentType,
    start_ms: segments.startMs,
    end_ms: segments.endMs,
    duration_ms: segments.durationMs,
    submitted_by: segments.submittedBy,
    votes_up: segments.votesUp,
    votes_down: segments.votesDown,
    score: segments.score,
    created_at: segments.createdAt,
    updated_at: segments.updatedAt,
  };

  // --- Full dump (existing behaviour) ---
  if (!isDelta) {
    const data = await db
      .select(fields)
      .from(segments)
      .leftJoin(titles, eq(segments.titleId, titles.id))
      .where(eq(segments.status, "approved"));

    return json(
      {
        license: "ODbL 1.0 + Service Provider Reciprocity",
        license_url: "https://skipdb.tv/license",
        attribution: "SkipDB — https://github.com/SkipDB-TV/skipdb (open data)",
        generated_at: new Date().toISOString(),
        count: data.length,
        note: "By using this data you agree to ODbL 1.0 + Service Provider Reciprocity unless you have explicit permission.",
        segments: data,
      },
      {
        headers: {
          "Content-Disposition": 'inline; filename="skipdb-dump.json"',
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  }

  // --- Incremental delta ---
  const since = new Date(sinceRaw as string);
  if (Number.isNaN(since.getTime()))
    return apiError(
      "since (or updated_after) must be an ISO 8601 timestamp, e.g. 2026-01-01T00:00:00Z",
      400,
    );

  const limitRaw = url.searchParams.get("limit");
  let limit = DELTA_PAGE_DEFAULT;
  if (limitRaw != null) {
    const v = Math.round(Number(limitRaw));
    if (Number.isNaN(v) || v < 1)
      return apiError("limit must be a positive integer", 400);
    limit = Math.min(v, DELTA_PAGE_LIMIT);
  }

  const cursorRaw = url.searchParams.get("cursor");
  let cursor: { updatedAt: Date; id: number } | null = null;
  if (cursorRaw != null) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) return apiError("cursor is invalid", 400);
  }

  // Keyset pagination over (updated_at, id). The lower bound is the cursor when
  // paging, otherwise `since` itself. Both are exclusive so a row is never
  // returned twice across pages or across an initial + follow-up pull.
  const lowerUpdatedAt = cursor ? cursor.updatedAt : since;
  const after = cursor
    ? or(
        gt(segments.updatedAt, cursor.updatedAt),
        and(
          eq(segments.updatedAt, cursor.updatedAt),
          gt(segments.id, cursor.id),
        ),
      )
    : gt(segments.updatedAt, since);

  // Fetch limit + 1 to detect whether another page exists without a count.
  const rows = await db
    .select(fields)
    .from(segments)
    .leftJoin(titles, eq(segments.titleId, titles.id))
    .where(and(eq(segments.status, "approved"), after))
    .orderBy(asc(segments.updatedAt), asc(segments.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  const last = data[data.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.updated_at, last.id) : null;

  return json(
    {
      license: "ODbL 1.0 + Service Provider Reciprocity",
      license_url: "https://skipdb.tv/license",
      attribution: "SkipDB — https://github.com/SkipDB-TV/skipdb (open data)",
      generated_at: new Date().toISOString(),
      since: lowerUpdatedAt.toISOString(),
      count: data.length,
      has_more: hasMore,
      next_cursor: nextCursor,
      note: "By using this data you agree to ODbL 1.0 + Service Provider Reciprocity unless you have explicit permission.",
      segments: data,
    },
    {
      headers: {
        // The delta query is dynamic per (since, cursor, limit); a short shared
        // cache absorbs bursts of identical sync pulls without holding stale
        // data for long.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    },
  );
}
