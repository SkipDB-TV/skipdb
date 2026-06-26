"use client";

import { useEffect, useRef, useState } from "react";
import { SegmentChip } from "./SegmentChip";
import { msToClock, parseTimeToMs } from "@/lib/time";
import { SEGMENT_ORDER, SEGMENT_META } from "@/lib/segment-types";
import type { SegmentTypeName } from "@/lib/config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Hit {
  imdb_id: string;
  name: string;
  year: number | null;
  mediaType?: string;
}

interface EpisodeRow {
  season: number | null;
  episode: number | null;
  name: string | null;
}

interface TitleData {
  imdbId: string;
  name: string;
  seasons: number[];
  episodes: EpisodeRow[];
}

interface SubmitResult {
  season: number;
  episode: number;
  id?: number;
  status?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function epKey(season: number, episode: number) {
  return `${season}:${episode}`;
}

function parseTime(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return parseTimeToMs(trimmed);
}

function previewTime(input: string): string | null {
  const ms = parseTime(input);
  if (ms == null) return null;
  return msToClock(ms);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TimeInput({
  label,
  value,
  onChange,
  placeholder = "e.g. 1:02",
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  optional?: boolean;
}) {
  const preview = previewTime(value);
  const invalid = value.trim() !== "" && preview == null;
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-300">
        {label}
        {optional && (
          <span className="ml-1 text-xs font-normal text-slate-500">
            (optional)
          </span>
        )}
      </label>
      <input
        className={`input ${invalid ? "border-danger/60 focus:border-danger/80 focus:ring-danger/20" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      {preview && (
        <p className="mt-1 text-xs text-slate-500">
          → <span className="mono text-skip">{preview}</span>
        </p>
      )}
      {invalid && (
        <p className="mt-1 text-xs text-danger">
          Enter seconds (e.g. 62) or clock (e.g. 1:02)
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BulkSubmit() {
  // --- Title search ---
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Selected title + episodes ---
  const [title, setTitle] = useState<TitleData | null>(null);
  const [loadingEps, setLoadingEps] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // --- Segment config ---
  const [segmentType, setSegmentType] = useState<SegmentTypeName>("intro");
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [durationInput, setDurationInput] = useState("");

  // --- Submission ---
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<SubmitResult[] | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced title search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q || title) {
      setHits([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/titles/search?q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const remote: Hit[] = (data.results ?? []).filter(
          (r: Hit) => r.mediaType === "series" || !r.mediaType,
        );
        const local: Hit[] = (data.local ?? []).filter(
          (r: Hit) => r.mediaType === "series",
        );
        const seen = new Set<string>();
        const merged: Hit[] = [];
        for (const h of [...remote, ...local]) {
          if (!seen.has(h.imdb_id)) {
            seen.add(h.imdb_id);
            merged.push(h);
          }
        }
        setHits(merged.slice(0, 8));
        setShowDropdown(true);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query, title]);

  async function selectTitle(hit: Hit) {
    setQuery(hit.name);
    setHits([]);
    setShowDropdown(false);
    setTitle(null);
    setSelected(new Set());
    setResults(null);
    setLoadingEps(true);
    try {
      const res = await fetch(`/api/titles/${hit.imdb_id}`);
      if (!res.ok) return;
      const data = await res.json();
      const episodes: EpisodeRow[] = (data.episodes ?? []).filter(
        (e: EpisodeRow) => e.season != null && e.season > 0,
      );
      setTitle({
        imdbId: hit.imdb_id,
        name: hit.name,
        seasons: (data.seasons ?? []).filter((s: number) => s > 0),
        episodes,
      });
    } finally {
      setLoadingEps(false);
    }
  }

  function clearTitle() {
    setTitle(null);
    setQuery("");
    setHits([]);
    setSelected(new Set());
    setResults(null);
  }

  // Selection helpers
  function toggleEp(season: number, episode: number) {
    const k = epKey(season, episode);
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }

  function toggleSeason(season: number, eps: EpisodeRow[]) {
    const keys = eps.map((e) => epKey(e.season!, e.episode!));
    const allOn = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  function selectAll() {
    if (!title) return;
    const keys = title.episodes
      .filter((e) => e.season != null && e.episode != null)
      .map((e) => epKey(e.season!, e.episode!));
    const allOn = keys.every((k) => selected.has(k));
    setSelected(allOn ? new Set() : new Set(keys));
  }

  // Submission
  async function submit() {
    if (!title || selected.size === 0) return;
    const startMs = parseTime(startInput);
    if (startMs == null) return;

    const isOutro = segmentType === "outro";
    const durationMs = parseTime(durationInput) ?? undefined;
    let endMs: number | undefined;

    if (endInput.trim()) {
      const parsed = parseTime(endInput);
      if (parsed == null) return;
      endMs = parsed;
    } else if (isOutro && durationMs != null) {
      endMs = durationMs;
    } else if (!isOutro) {
      return;
    }

    const episodes = [...selected].map((k) => {
      const [s, e] = k.split(":").map(Number);
      return {
        season: s,
        episode: e,
        start_ms: startMs,
        end_ms: endMs!,
        ...(durationMs != null ? { duration_ms: durationMs } : {}),
      };
    });

    setSubmitting(true);
    setResults(null);
    try {
      const res = await fetch("/api/admin/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imdb_id: title.imdbId,
          segment_type: segmentType,
          episodes,
        }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } finally {
      setSubmitting(false);
    }
  }

  // Derived state
  const startMs = parseTime(startInput);
  const endMs = parseTime(endInput) || (segmentType === "outro" ? parseTime(durationInput) : null);
  const durationMs = parseTime(durationInput);
  const timingValid =
    startMs != null &&
    (endMs != null || segmentType === "outro") &&
    (endMs == null || endMs > startMs);
  const canSubmit = title != null && selected.size > 0 && timingValid && !submitting;

  // Episode list grouped by season
  const seasonGroups = title
    ? title.seasons.map((s) => ({
        season: s,
        episodes: title.episodes.filter((e) => e.season === s),
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Title search */}
      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
          1 · Series
        </h2>
        {title ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-white">{title.name}</p>
              <p className="mono mt-0.5 text-xs text-slate-500">
                {title.imdbId} · {title.seasons.length} season
                {title.seasons.length === 1 ? "" : "s"} ·{" "}
                {title.episodes.length} episodes
              </p>
            </div>
            <button className="btn-ghost text-xs" onClick={clearTitle}>
              Change
            </button>
          </div>
        ) : (
          <div ref={searchRef} className="relative">
            <input
              className="input"
              placeholder="Search by title name or IMDb id…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => hits.length > 0 && setShowDropdown(true)}
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                …
              </div>
            )}
            {showDropdown && hits.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-midnight-850 shadow-card">
                {hits.map((h) => (
                  <button
                    key={h.imdb_id}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5 first:rounded-t-xl last:rounded-b-xl"
                    onClick={() => selectTitle(h)}
                  >
                    <span className="truncate text-white">{h.name}</span>
                    <span className="mono shrink-0 text-xs text-slate-500">
                      {h.year ?? ""} · {h.imdb_id}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {loadingEps && (
              <p className="mt-2 text-sm text-slate-500">Loading episodes…</p>
            )}
          </div>
        )}
      </div>

      {/* Episode selection */}
      {title && (
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              2 · Episodes
            </h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-400">
                {selected.size} selected
              </span>
              <button
                className="btn-ghost py-1 text-xs"
                onClick={selectAll}
              >
                {selected.size === title.episodes.length
                  ? "Deselect all"
                  : "Select all"}
              </button>
            </div>
          </div>

          <div className="space-y-5">
            {seasonGroups.map(({ season, episodes: eps }) => {
              if (eps.length === 0) return null;
              const seasonKeys = eps.map((e) =>
                epKey(e.season!, e.episode!),
              );
              const allSelected = seasonKeys.every((k) => selected.has(k));
              const someSelected = seasonKeys.some((k) => selected.has(k));
              return (
                <div key={season}>
                  <div className="mb-2 flex items-center gap-3">
                    <button
                      className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white"
                      onClick={() => toggleSeason(season, eps)}
                    >
                      <span
                        className={`inline-grid h-4 w-4 shrink-0 place-items-center rounded border text-xs transition ${
                          allSelected
                            ? "border-skip bg-skip text-midnight-950"
                            : someSelected
                              ? "border-skip bg-skip/20 text-skip"
                              : "border-white/20 bg-white/5 text-transparent"
                        }`}
                      >
                        {allSelected ? "✓" : someSelected ? "−" : ""}
                      </span>
                      Season {season}
                    </button>
                    <span className="text-xs text-slate-600">
                      {eps.length} ep{eps.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {eps.map((ep) => {
                      const k = epKey(ep.season!, ep.episode!);
                      const on = selected.has(k);
                      return (
                        <button
                          key={k}
                          onClick={() => toggleEp(ep.season!, ep.episode!)}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                            on
                              ? "border-skip/40 bg-skip/10 text-white"
                              : "border-white/5 bg-midnight-850 text-slate-400 hover:border-white/15 hover:text-slate-300"
                          }`}
                        >
                          <span
                            className={`inline-grid h-4 w-4 shrink-0 place-items-center rounded border text-xs transition ${
                              on
                                ? "border-skip bg-skip text-midnight-950"
                                : "border-white/20 bg-white/5 text-transparent"
                            }`}
                          >
                            {on ? "✓" : ""}
                          </span>
                          <span className="mono text-xs text-slate-500">
                            E{String(ep.episode!).padStart(2, "0")}
                          </span>
                          <span className="truncate">
                            {ep.name ?? `Episode ${ep.episode}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Segment config */}
      {title && (
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
            3 · Segment type &amp; timing
          </h2>

          {/* Type picker */}
          <div className="mb-5 flex flex-wrap gap-2">
            {SEGMENT_ORDER.map((t) => {
              const meta = SEGMENT_META[t];
              return (
                <button
                  key={t}
                  onClick={() => setSegmentType(t)}
                  className={`chip border px-3 py-1.5 text-sm transition ${
                    segmentType === t
                      ? meta.color + " shadow-sm"
                      : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-300"
                  }`}
                >
                  {meta.icon} {meta.label}
                </button>
              );
            })}
          </div>

          <p className="mb-4 text-xs text-slate-500">
            {SEGMENT_META[segmentType].desc}
            {segmentType === "outro" &&
              " — end time is optional; if omitted the segment runs to the end of the stream (requires duration)."}
          </p>

          {/* Timing inputs */}
          <div className="grid gap-4 sm:grid-cols-3">
            <TimeInput
              label="Start"
              value={startInput}
              onChange={setStartInput}
            />
            <TimeInput
              label="End"
              value={endInput}
              onChange={setEndInput}
              optional={segmentType === "outro"}
              placeholder={
                segmentType === "outro" ? "leave blank = to end" : "e.g. 1:32"
              }
            />
            <TimeInput
              label="Duration"
              value={durationInput}
              onChange={setDurationInput}
              optional
              placeholder="stream length"
            />
          </div>

          {/* Timing preview */}
          {startMs != null && endMs != null && endMs > startMs && (
            <div className="mt-4 rounded-xl border border-white/5 bg-midnight-850 px-4 py-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <SegmentChip type={segmentType} />
                <span className="mono text-slate-300">
                  {msToClock(startMs)} → {msToClock(endMs)}
                </span>
                <span className="text-slate-500">
                  {((endMs - startMs) / 1000).toFixed(1)}s
                </span>
                {durationMs != null && (
                  <span className="text-slate-600">
                    duration {msToClock(durationMs)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      {title && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            {selected.size > 0
              ? `${selected.size} episode${selected.size === 1 ? "" : "s"} · ${SEGMENT_META[segmentType].label} · auto-approved`
              : "Select at least one episode"}
          </p>
          <button
            className="btn-primary min-w-40"
            disabled={!canSubmit}
            onClick={submit}
          >
            {submitting
              ? "Submitting…"
              : `Submit ${selected.size > 0 ? selected.size : ""} segment${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Results
            </h2>
            <span className="chip bg-ok/15 text-ok">
              {results.filter((r) => !r.error).length} approved
            </span>
            {results.some((r) => r.error) && (
              <span className="chip bg-danger/15 text-rose-300">
                {results.filter((r) => r.error).length} failed
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {results
              .sort((a, b) =>
                a.season !== b.season
                  ? a.season - b.season
                  : a.episode - b.episode,
              )
              .map((r) => (
                <div
                  key={epKey(r.season, r.episode)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                    r.error ? "bg-danger/10 text-rose-300" : "bg-ok/8 text-slate-300"
                  }`}
                >
                  <span className="mono text-xs">
                    S{String(r.season).padStart(2, "0")}E
                    {String(r.episode).padStart(2, "0")}
                  </span>
                  {r.error ? (
                    <span className="text-xs text-rose-400">{r.error}</span>
                  ) : (
                    <span className="text-xs text-ok">✓ approved #{r.id}</span>
                  )}
                </div>
              ))}
          </div>
          <button
            className="btn-ghost mt-4 w-full text-sm"
            onClick={() => {
              setResults(null);
              setSelected(new Set());
              setStartInput("");
              setEndInput("");
              setDurationInput("");
            }}
          >
            Submit another batch
          </button>
        </div>
      )}
    </div>
  );
}
