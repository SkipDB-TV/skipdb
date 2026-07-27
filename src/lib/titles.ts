import { db } from "@/db";
import { titles, episodes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { findByImdb, getSeasonEpisodes, tmdbEnabled } from "./tmdb";
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
  if (existing) {
    // Backfill artwork/metadata for legacy or manually-seeded titles that were
    // created without a poster (e.g. the seeded Breaking Bad entry).
    if (!existing.posterUrl && tmdbEnabled()) {
      const refreshed = await refreshTitleMeta(existing);
      if (refreshed) return refreshed;
    }
    return existing;
  }

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

/** Refresh a title's metadata/artwork from TMDB (best-effort). */
async function refreshTitleMeta(title: Title): Promise<Title | null> {
  const meta = await findByImdb(title.imdbId);
  if (!meta) return null;
  const [row] = await db
    .update(titles)
    .set({
      tmdbId: meta.tmdbId,
      mediaType: meta.mediaType,
      name: meta.name || title.name,
      year: meta.year ?? title.year,
      overview: meta.overview ?? title.overview,
      posterUrl: meta.posterUrl,
      backdropUrl: meta.backdropUrl,
      refreshedAt: new Date(),
    })
    .where(eq(titles.id, title.id))
    .returning();
  return row ?? null;
}

/** Ensure episode metadata is cached for a series season (best-effort). */
export async function ensureSeasonEpisodes(title: Title, season: number) {
  if (title.mediaType !== "series" || !title.tmdbId) return;
  // Targeted existence check (served by episodes_title_season_episode_idx) —
  // deliberately not `select * ... where titleId = title.id` then filtering
  // in JS, which pulls every season's full rows (incl. overview/metadata)
  // just to answer a yes/no question, and gets called once per season by
  // callers that loop over a show's whole season list (see coverage.ts).
  const [cached] = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(and(eq(episodes.titleId, title.id), eq(episodes.season, season)))
    .limit(1);
  if (cached) return;

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
