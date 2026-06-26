"use client";

import { useState, useEffect } from "react";
import { API_URL } from "@/lib/urls";

const EXAMPLES = [
  { label: "Breaking Bad S1E1", imdbId: "tt0903747", season: 1, episode: 1, duration: 2820 },
  { label: "Suits S1E1", imdbId: "tt1632701", season: 1, episode: 1, duration: 2520 },
  { label: "The Office S2E1", imdbId: "tt0386676", season: 2, episode: 1, duration: 1320 },
];

export function ApiDemo() {
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const example = EXAMPLES[selected];

  useEffect(() => {
    const params = new URLSearchParams({
      imdb_id: example.imdbId,
      season: String(example.season),
      episode: String(example.episode),
      duration: String(example.duration),
    });
    const url = `${API_URL}/api/segments?${params}`;
    setLoading(true);
    setResult(null);
    setError(false);
    fetch(url)
      .then((r) => r.json())
      .then((data) => setResult(JSON.stringify(data, null, 2)))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = new URLSearchParams({
    imdb_id: example.imdbId,
    season: String(example.season),
    episode: String(example.episode),
    duration: String(example.duration),
  });
  const url = `${API_URL}/api/segments?${params}`;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-white/5 px-4 py-3">
        {EXAMPLES.map((e, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`chip text-xs transition ${
              selected === i
                ? "border border-skip/30 bg-skip/10 text-skip-bright"
                : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        <p className="mono truncate text-[10px] text-slate-500">{url}</p>
        <pre className="mono mt-3 h-72 overflow-y-auto text-[11px] leading-relaxed">
          {loading && (
            <span className="text-slate-500">fetching…</span>
          )}
          {error && (
            <span className="text-rose-400">{`// Could not reach ${API_URL}`}</span>
          )}
          {result && (
            <JsonHighlight json={result} />
          )}
        </pre>
      </div>
    </div>
  );
}

function JsonHighlight({ json }: { json: string }) {
  const parts = json.split(
    /("(?:[^"\\]|\\.)*"(?:\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/g,
  );
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i} className="text-slate-500">{part}</span>;
        if (/^".*":$/.test(part))
          return <span key={i} className="text-slate-300">{part}</span>;
        if (/^"/.test(part))
          return <span key={i} className="text-skip-bright">{part}</span>;
        if (part === "null")
          return <span key={i} className="text-slate-500">{part}</span>;
        if (part === "true" || part === "false")
          return <span key={i} className="text-signal">{part}</span>;
        return <span key={i} className="text-warn">{part}</span>;
      })}
    </>
  );
}
