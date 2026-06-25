import { db } from "@/db";
import { titles } from "@/db/schema";
import { json, apiError, preflight } from "@/lib/api";
import { searchTitles, findByImdb, tmdbEnabled } from "@/lib/tmdb";
import { ilike, or } from "drizzle-orm";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

/**
 * Search for a title by name or IMDb id. Uses TMDB when configured; always also
 * returns local matches (titles we already have data for).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return apiError("q (query) is required", 400);

  // Direct IMDb id lookup.
  if (/^tt\d{6,10}$/i.test(q)) {
    const imdbId = q.toLowerCase();
    const meta = await findByImdb(imdbId);
    if (meta) {
      return json({
        query: q,
        provider: "tmdb",
        results: [{ ...meta, imdb_id: imdbId }],
      });
    }
    return json({
      query: q,
      provider: tmdbEnabled() ? "tmdb" : "none",
      results: [
        {
          imdb_id: imdbId,
          name: imdbId,
          mediaType: "series",
          note: "No metadata provider match; you can still contribute manually.",
        },
      ],
    });
  }

  const remote = await searchTitles(q);

  // Local DB matches by name (works even without TMDB).
  const local = await db
    .select()
    .from(titles)
    .where(or(ilike(titles.name, `%${q}%`), ilike(titles.imdbId, `%${q}%`)))
    .limit(10);

  return json({
    query: q,
    provider: tmdbEnabled() ? "tmdb" : "local",
    results: remote,
    local: local.map((t) => ({
      imdb_id: t.imdbId,
      name: t.name,
      year: t.year,
      mediaType: t.mediaType,
      posterUrl: t.posterUrl,
    })),
  });
}
