import { db } from "@/db";
import { titles, episodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findByImdb, getSeasonEpisodes } from "./tmdb";
import type { Title } from "@/db/schema";

/**
 * Get a title row by IMDb id, creating/refreshing it from TMDB when possible.
 * Falls back to a minimal manual record so submissions work without TMDB.
 */
export async function ensureTitle(
  imdbId: string,
  fallbackMediaType: "movie" | "series" = "series",
): Promise<Title> {
  const existing = (
    await db.select().from(titles).where(eq(titles.imdbId, imdbId))
  )[0];
  if (existing) return existing;

  const meta = await findByImdb(imdbId);
  if (meta) {
    const [row] = await db
      .insert(titles)
      .values({
        imdbId,
        tmdbId: meta.tmdbId,
        mediaType: meta.mediaType,
        name: meta.name,
        year: meta.year,
        overview: meta.overview,
        posterUrl: meta.posterUrl,
        backdropUrl: meta.backdropUrl,
        refreshedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: titles.imdbId,
        set: { refreshedAt: new Date() },
      })
      .returning();
    return row;
  }

  // No metadata provider — create a minimal manual record.
  const [row] = await db
    .insert(titles)
    .values({
      imdbId,
      mediaType: fallbackMediaType,
      name: imdbId,
    })
    .onConflictDoUpdate({ target: titles.imdbId, set: { imdbId } })
    .returning();
  return row;
}

/** Ensure episode metadata is cached for a series season (best-effort). */
export async function ensureSeasonEpisodes(title: Title, season: number) {
  if (title.mediaType !== "series" || !title.tmdbId) return;
  const have = await db
    .select()
    .from(episodes)
    .where(eq(episodes.titleId, title.id));
  if (have.some((e) => e.season === season)) return;

  const eps = await getSeasonEpisodes(title.tmdbId, season);
  for (const e of eps) {
    await db
      .insert(episodes)
      .values({
        titleId: title.id,
        season: e.season,
        episode: e.episode,
        name: e.name,
        overview: e.overview,
        airDate: e.airDate,
        stillUrl: e.stillUrl,
        runtimeMs: e.runtimeMs,
      })
      .onConflictDoNothing();
  }
}
