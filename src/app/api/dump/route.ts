import { db } from "@/db";
import { segments, titles } from "@/db/schema";
import { json, apiError, preflight } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import { msToSec } from "@/lib/time";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

/**
 * Public data dump of all APPROVED segments — SponsorBlock-style open data.
 * Contains NO user data: only the crowdsourced timestamps and the media they
 * belong to. Licensed CC BY-NC-SA 4.0.
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
    return apiError("Rate limit exceeded. The dump is cached for an hour.", 429);

  const rows = await db
    .select({
      imdb_id: segments.imdbId,
      title: titles.name,
      media_type: titles.mediaType,
      season: segments.season,
      episode: segments.episode,
      segment_type: segments.segmentType,
      start_ms: segments.startMs,
      end_ms: segments.endMs,
      duration_ms: segments.durationMs,
      votes_up: segments.votesUp,
      votes_down: segments.votesDown,
      score: segments.score,
      created_at: segments.createdAt,
    })
    .from(segments)
    .leftJoin(titles, eq(segments.titleId, titles.id))
    .where(eq(segments.status, "approved"));

  const data = rows.map((r) => ({
    ...r,
    start_sec: msToSec(r.start_ms),
    end_sec: msToSec(r.end_ms),
  }));

  return json(
    {
      license: "CC BY-NC-SA 4.0",
      license_url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
      attribution: "SkipDB — https://github.com (open data)",
      generated_at: new Date().toISOString(),
      count: data.length,
      note: "Contains no user data. By using this data you agree to CC BY-NC-SA 4.0 unless you have explicit permission.",
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
