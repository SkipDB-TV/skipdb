"use client";
import Link from "next/link";
import { useState } from "react";
import { SEGMENT_ORDER, SEGMENT_META } from "@/lib/segment-types";
import type { SegmentTypeName } from "@/lib/config";
import { ApiLink } from "./ApiLink";
import type { EpisodeCoverage } from "@/lib/coverage";

export function SeasonTabs({
  imdbId,
  seasons,
  episodes,
}: {
  imdbId: string;
  seasons: number[];
  episodes: EpisodeCoverage[];
}) {
  const [activeSeason, setActiveSeason] = useState(seasons[0] ?? 1);

  // Group episodes by season once.
  const bySeasonMap = new Map<number, EpisodeCoverage[]>();
  for (const ep of episodes) {
    if (ep.season == null) continue;
    const arr = bySeasonMap.get(ep.season) ?? [];
    arr.push(ep);
    bySeasonMap.set(ep.season, arr);
  }

  const activeEps = bySeasonMap.get(activeSeason) ?? [];

  return (
    <div className="space-y-4">
      {/* Season pills — horizontally scrollable */}
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {seasons.map((season) => {
          const eps = bySeasonMap.get(season) ?? [];
          const covered = eps.filter((ep) =>
            SEGMENT_ORDER.some(
              (t) =>
                (ep.coverage[t]?.approved ?? 0) > 0 ||
                (t === "intro" && ep.hasIntroAbsence),
            ),
          ).length;
          const isActive = season === activeSeason;
          const hasCoverage = covered > 0;
          return (
            <button
              key={season}
              onClick={() => setActiveSeason(season)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-skip text-midnight-950"
                  : "bg-black/5 text-slate-800 hover:bg-black/10 hover:text-slate-900 dark:bg-midnight-900/70 dark:text-slate-300 dark:ring-1 dark:ring-white/5 dark:hover:bg-midnight-900/90 dark:hover:text-slate-200"
              }`}
            >
              <span>S{season}</span>
              <span
                className={`text-xs tabular-nums ${
                  isActive
                    ? "text-midnight-800"
                    : hasCoverage
                      ? "text-slate-400 dark:text-slate-500"
                      : "text-slate-300 dark:text-white/20"
                }`}
              >
                {covered}/{eps.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Episode rows for the active season */}
      <div className="grid gap-2">
        {activeEps.map((ep) => (
          <div
            key={`${ep.season}-${ep.episode}`}
            className="card min-w-0 flex items-center justify-between gap-4 p-4 transition hover:shadow-glow"
          >
            <Link
              href={`/title/${imdbId}/${ep.season}/${ep.episode}`}
              className="flex min-w-0 flex-1 items-center gap-3"
              prefetch={false}
            >
              <span className="mono shrink-0 text-sm text-slate-500">
                E{String(ep.episode).padStart(2, "0")}
              </span>
              <span className="truncate text-sm text-white">
                {ep.name ?? `Episode ${ep.episode}`}
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex gap-1.5">
                {SEGMENT_ORDER.map((t) => (
                  <CoverageDot
                    key={t}
                    type={t}
                    cov={ep.coverage[t]}
                    hasAbsence={t === "intro" && ep.hasIntroAbsence}
                  />
                ))}
              </div>
              <ApiLink
                imdbId={imdbId}
                season={ep.season}
                episode={ep.episode}
                variant="inline"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoverageDot({
  type,
  cov,
  hasAbsence = false,
}: {
  type: SegmentTypeName;
  cov?: { approved: number; pending: number };
  hasAbsence?: boolean;
}) {
  const meta = SEGMENT_META[type];
  if (hasAbsence) {
    return (
      <span
        title={`${meta.label}: confirmed no segment`}
        className="flex h-2.5 w-2.5 items-center justify-center text-[9px] leading-none text-slate-500"
      >
        –
      </span>
    );
  }
  const has = cov && cov.approved > 0;
  const pending = cov && cov.pending > 0 && !has;
  return (
    <span
      title={`${meta.label}: ${cov?.approved ?? 0} approved, ${cov?.pending ?? 0} pending`}
      className={`h-2.5 w-2.5 rounded-full ${
        has ? meta.ring : pending ? "bg-warn/60" : "bg-white/10"
      }`}
    />
  );
}
