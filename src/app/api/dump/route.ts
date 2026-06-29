import { db } from "@/db";
import { segments, titles } from "@/db/schema";
import { json, apiError, preflight } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

/**
 * Public data dump of all APPROVED segments — SponsorBlock-style open data.
 * Contains no PII: submitted_by is an opaque user ID for moderation continuity.
 * Licensed ODbL 1.0 + Service Provider Reciprocity.
 *
 * Current implementation streams the full dataset as JSON. A scheduled,
 * downloadable mirror (and CSV variant) is on the roadmap; the schema is built
 * so this stays a clean PII-free query.
 */
export async function GET(req: Request) {
  // If a pre-generated dump URL is configured, redirect there — no DB query needed.
  const dumpUrl = process.env.DUMP_URL;
  if (dumpUrl) {
    return Response.redirect(dumpUrl, 302);
  }

  // The dump is a heavy full-table read; cap how often a client can pull it.
  const rl = rateLimit(`dump:${clientIp(req)}`, 6);
  if (!rl.ok)
    return apiError(
      "Rate limit exceeded. The dump is cached for an hour.",
      429,
    );

  const data = await db
    .select({
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
    })
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
