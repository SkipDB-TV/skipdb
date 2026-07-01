"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { JsonHighlight } from "./JsonHighlight";

/**
 * Shows the live API response for `liveUrlBase` while displaying `publicUrl`
 * as the URL to copy/use — these are deliberately different. `publicUrl` is
 * the documented, cacheable public API (api.skipdb.tv), which can lag the
 * live DB by up to a day (it's served from a separate Cloudflare D1/KV
 * store, see deploy/cloudflare-segments-worker). `liveUrlBase` hits this
 * same origin's own /api route instead, cache-busted, so what you see here
 * always matches what the page just did (e.g. right after submitting/editing
 * a segment).
 */
export function ApiResponseModal({
  publicUrl,
  liveUrlBase,
  onClose,
}: {
  publicUrl: string;
  liveUrlBase: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    // Cache-busting param computed here (not at render time) so it skips
    // this app's own 30s CDN cache without making the component impure.
    const separator = liveUrlBase.includes("?") ? "&" : "?";
    const liveUrl = `${liveUrlBase}${separator}_=${Date.now()}`;
    fetch(liveUrl, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setResult(JSON.stringify(data, null, 2)))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [liveUrlBase]);

  async function copy() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Portal straight to <body> — several ancestors on some pages (e.g. .card's
  // backdrop-filter, used for the poster/panel boxes on the title page)
  // create a new CSS stacking context, which traps a plain nested `fixed
  // z-50` element inside it instead of stacking above the whole page.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">API response</h2>
          <button
            className="text-slate-400 hover:text-white"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex items-stretch gap-2 border-b border-white/5 px-4 py-3">
          <code className="mono flex-1 truncate rounded-lg border border-white/10 bg-midnight-850 px-2.5 py-1.5 text-xs text-slate-300">
            {publicUrl}
          </code>
          <button className="btn-ghost shrink-0 text-xs" onClick={copy}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <pre className="mono min-h-40 flex-1 overflow-y-auto p-4 text-[11px] leading-relaxed">
          {loading && <span className="text-slate-500">fetching live response…</span>}
          {error && (
            <span className="text-rose-400">
              {"// Could not reach the live API"}
            </span>
          )}
          {result && <JsonHighlight json={result} />}
        </pre>

        <p className="border-t border-white/5 px-4 py-2 text-[11px] text-slate-500">
          Showing the live response from this site. The public API URL above
          (api.skipdb.tv) is served from an edge cache and can lag by up to a
          day.
        </p>
      </div>
    </div>,
    document.body,
  );
}
