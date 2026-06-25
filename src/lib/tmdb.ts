/**
 * TMDB metadata provider. Used for title search, IMDb-id resolution, artwork and
 * episode details. Entirely optional: if TMDB_API_KEY is unset, these functions
 * return null/empty and the app falls back to manual IMDb entry.
 *
 * Supports both a v4 read access token (Bearer JWT) and a v3 api key (query).
 */
const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

export function tmdbEnabled(): boolean {
  return Boolean(process.env.TMDB_API_KEY);
}

function authFetch(path: string, params: Record<string, string> = {}) {
  const key = process.env.TMDB_API_KEY!;
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { accept: "application/json" };
  // v4 read tokens are JWTs (contain dots); v3 keys go in the query string.
  if (key.includes(".")) headers.authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);
  return fetch(url, { headers, next: { revalidate: 60 * 60 } });
}

export interface TmdbResult {
  tmdbId: number;
  imdbId: string | null;
  mediaType: "movie" | "series";
  name: string;
  year: number | null;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

const poster = (p: string | null) => (p ? `${IMG}/w342${p}` : null);
const backdrop = (p: string | null) => (p ? `${IMG}/w780${p}` : null);
const still = (p: string | null) => (p ? `${IMG}/w300${p}` : null);
const yearOf = (d?: string | null) =>
  d && d.length >= 4 ? Number(d.slice(0, 4)) : null;

/** Search movies + TV by name. */
export async function searchTitles(query: string): Promise<TmdbResult[]> {
  if (!tmdbEnabled()) return [];
  const res = await authFetch("/search/multi", {
    query,
    include_adult: "false",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: any[] };
  return (data.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 20)
    .map((r) => ({
      tmdbId: r.id,
      imdbId: null,
      mediaType: r.media_type === "tv" ? "series" : "movie",
      name: r.title ?? r.name ?? "Untitled",
      year: yearOf(r.release_date ?? r.first_air_date),
      overview: r.overview ?? null,
      posterUrl: poster(r.poster_path),
      backdropUrl: backdrop(r.backdrop_path),
    }));
}

/** Resolve an IMDb id to a TMDB movie/series record. */
export async function findByImdb(imdbId: string): Promise<TmdbResult | null> {
  if (!tmdbEnabled()) return null;
  const res = await authFetch(`/find/${imdbId}`, {
    external_source: "imdb_id",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    movie_results?: any[];
    tv_results?: any[];
  };
  const movie = data.movie_results?.[0];
  const tv = data.tv_results?.[0];
  const hit = tv ?? movie;
  if (!hit) return null;
  return {
    tmdbId: hit.id,
    imdbId,
    mediaType: tv ? "series" : "movie",
    name: hit.title ?? hit.name ?? "Untitled",
    year: yearOf(hit.release_date ?? hit.first_air_date),
    overview: hit.overview ?? null,
    posterUrl: poster(hit.poster_path),
    backdropUrl: backdrop(hit.backdrop_path),
  };
}

/** Resolve a TMDB id (movie or tv) to its IMDb id via external_ids. */
export async function getExternalImdbId(
  tmdbId: number,
  mediaType: "movie" | "series",
): Promise<string | null> {
  if (!tmdbEnabled()) return null;
  const path =
    mediaType === "series"
      ? `/tv/${tmdbId}/external_ids`
      : `/movie/${tmdbId}/external_ids`;
  const res = await authFetch(path);
  if (!res.ok) return null;
  const data = (await res.json()) as { imdb_id?: string | null };
  return data.imdb_id ?? null;
}

export interface TmdbSeasonSummary {
  season: number;
  episodeCount: number;
  name: string | null;
}

/** Season summaries for a series. */
export async function getSeasons(
  tmdbId: number,
): Promise<TmdbSeasonSummary[]> {
  if (!tmdbEnabled()) return [];
  const res = await authFetch(`/tv/${tmdbId}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { seasons?: any[] };
  return (data.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .map((s) => ({
      season: s.season_number,
      episodeCount: s.episode_count,
      name: s.name ?? null,
    }));
}

export interface TmdbEpisode {
  season: number;
  episode: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  stillUrl: string | null;
  runtimeMs: number | null;
}

/** Episodes for one season of a series. */
export async function getSeasonEpisodes(
  tmdbId: number,
  season: number,
): Promise<TmdbEpisode[]> {
  if (!tmdbEnabled()) return [];
  const res = await authFetch(`/tv/${tmdbId}/season/${season}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { episodes?: any[] };
  return (data.episodes ?? []).map((e) => ({
    season: e.season_number,
    episode: e.episode_number,
    name: e.name ?? null,
    overview: e.overview ?? null,
    airDate: e.air_date ?? null,
    stillUrl: still(e.still_path),
    runtimeMs: e.runtime ? e.runtime * 60_000 : null,
  }));
}
