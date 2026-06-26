/**
 * A quick link to the JSON API response for a movie/episode, so contributors and
 * developers can eyeball exactly what the API returns.
 */
export function ApiLink({
  imdbId,
  season,
  episode,
  variant = "button",
}: {
  imdbId: string;
  season?: number | null;
  episode?: number | null;
  variant?: "button" | "inline";
}) {
  const params = new URLSearchParams({ imdb_id: imdbId });
  if (season != null) params.set("season", String(season));
  if (episode != null) params.set("episode", String(episode));
  const href = `https://api.skipdb.tv/api/segments?${params.toString()}`;

  if (variant === "inline") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title="View the API response"
        className="mono shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400 transition hover:border-skip/40 hover:text-skip"
      >
        {"{ }"} API
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="btn-ghost"
      title="View the API response for this page"
    >
      <span className="mono">{"{ }"}</span> View API response
    </a>
  );
}
