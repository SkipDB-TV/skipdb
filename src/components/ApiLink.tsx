"use client";

import { useState } from "react";
import { API_URL } from "@/lib/urls";
import { ApiResponseModal } from "./ApiResponseModal";

/**
 * Opens a modal with the JSON API response for a movie/episode, so contributors
 * and developers can eyeball exactly what the API returns.
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
  const [open, setOpen] = useState(false);

  const params = new URLSearchParams({ imdb_id: imdbId });
  if (season != null) params.set("season", String(season));
  if (episode != null) params.set("episode", String(episode));
  // The URL people should actually copy/use — the documented public API.
  const publicUrl = `${API_URL}/api/segments?${params.toString()}`;
  // What we actually fetch for the modal: a relative path, so the browser
  // resolves it against whatever origin is actually being viewed (localhost,
  // a Preview deployment, or production) rather than trusting BASE_URL to be
  // configured correctly for that environment. This reads the live DB behind
  // the current site instead of api.skipdb.tv's up-to-a-day-stale edge cache
  // (see deploy/cloudflare-segments-worker). The modal itself appends a
  // cache-busting param before fetching, so it also skips this app's own
  // 30s CDN cache.
  const liveUrlBase = `/api/segments?${params.toString()}`;

  return (
    <>
      {variant === "inline" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="View the API response"
          className="mono shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400 transition hover:border-skip/40 hover:text-skip"
        >
          {"{ }"} API
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost"
          title="View the API response for this page"
        >
          <span className="mono">{"{ }"}</span> View API response
        </button>
      )}
      {open && (
        <ApiResponseModal
          publicUrl={publicUrl}
          liveUrlBase={liveUrlBase}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
