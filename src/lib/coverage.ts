import { db } from "@/db";
import { segments, episodes as episodesTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureTitle, ensureSeasonEpisodes } from "./titles";
import { getSeasons } from "./tmdb";
import type { Title } from "@/db/schema";
import type { SegmentTypeName } from "./config";

export interface EpisodeCoverage {
  season: number | null;
  episode: number | null;
  name: string | null;
  stillUrl: string | null;
  runtimeMs: number | null;
  // segment type -> { approved, pending }
  coverage: Record<string, { approved: number; pending: number }>;
}

export interface TitleOverview {
  title: Title;
  isMovie: boolean;
  seasons: number[];
  episodes: EpisodeCoverage[];
  totals: { approved: number; pending: number };
}

/**
 * Build a full overview for a title: metadata, the seasons/episodes we know
 * about, and a coverage matrix of how much segment data exists per episode.
 */
export async function getTitleOverview(
  imdbId: string,
): Promise<TitleOverview> {
  const title = await ensureTitle(imdbId);
  const isMovie = title.mediaType === "movie";

  // All segments for this title.
  const segs = await db
    .select()
    .from(segments)
    .where(eq(segments.titleId, title.id));

  // Coverage map keyed by "season:episode".
  const covMap = new Map<string, EpisodeCoverage>();
  const keyFor = (s: number | null, e: number | null) => `${s}:${e}`;

  const ensureRow = (
    season: number | null,
    episode: number | null,
  ): EpisodeCoverage => {
    const k = keyFor(season, episode);
    let row = covMap.get(k);
    if (!row) {
      row = {
        season,
        episode,
        name: null,
        stillUrl: null,
        runtimeMs: null,
        coverage: {},
      };
      covMap.set(k, row);
    }
    return row;
  };

  let approvedTotal = 0;
  let pendingTotal = 0;
  for (const s of segs) {
    const row = ensureRow(s.season, s.episode);
    const type = s.segmentType as SegmentTypeName;
    row.coverage[type] ??= { approved: 0, pending: 0 };
    if (s.status === "approved") {
      row.coverage[type].approved += 1;
      approvedTotal += 1;
    } else if (s.status === "pending") {
      row.coverage[type].pending += 1;
      pendingTotal += 1;
    }
  }

  let seasons: number[] = [];

  if (isMovie) {
    ensureRow(null, null);
  } else {
    // Pull season list (TMDB if available) and cache episode metadata.
    const seasonSummaries = title.tmdbId ? await getSeasons(title.tmdbId) : [];
    for (const s of seasonSummaries) {
      await ensureSeasonEpisodes(title, s.season);
    }
    const epRows = await db
      .select()
      .from(episodesTable)
      .where(eq(episodesTable.titleId, title.id));

    // Merge episode metadata into coverage rows (and add rows for episodes that
    // have metadata but no data yet).
    for (const ep of epRows) {
      const row = ensureRow(ep.season, ep.episode);
      row.name = ep.name;
      row.stillUrl = ep.stillUrl;
      row.runtimeMs = ep.runtimeMs;
    }

    const seasonSet = new Set<number>();
    for (const r of covMap.values())
      if (r.season != null) seasonSet.add(r.season);
    for (const s of seasonSummaries) seasonSet.add(s.season);
    seasons = [...seasonSet].sort((a, b) => a - b);
  }

  const episodeList = [...covMap.values()].sort((a, b) => {
    if ((a.season ?? 0) !== (b.season ?? 0))
      return (a.season ?? 0) - (b.season ?? 0);
    return (a.episode ?? 0) - (b.episode ?? 0);
  });

  return {
    title,
    isMovie,
    seasons,
    episodes: episodeList,
    totals: { approved: approvedTotal, pending: pendingTotal },
  };
}
