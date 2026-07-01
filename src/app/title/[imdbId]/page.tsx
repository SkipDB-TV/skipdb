import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTitleOverview } from "@/lib/coverage";
import { loadPanelSegments } from "@/lib/panel";
import { auth } from "@/lib/auth";
import { SegmentPanel } from "@/components/SegmentPanel";
import { Timeline } from "@/components/Timeline";
import { ApiLink } from "@/components/ApiLink";
import { SEGMENT_ORDER, SEGMENT_META } from "@/lib/segment-types";
import { SeasonTabs } from "@/components/SeasonTabs";
import type { Metadata } from "next";
import { db } from "@/db";
import { titles } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ imdbId: string }>;
}): Promise<Metadata> {
  const { imdbId } = await params;
  const id = imdbId.toLowerCase();
  if (!/^tt\d{6,10}$/.test(id)) return {};
  const [title] = await db.select().from(titles).where(eq(titles.imdbId, id));
  if (!title) return {};
  const label = title.year ? `${title.name} (${title.year})` : title.name;
  const description = title.overview
    ? `${title.overview.slice(0, 150).trimEnd()}… - community skip timestamps on SkipDB.`
    : `Community-sourced intro, recap, outro and preview timestamps for ${label} on SkipDB.`;
  return {
    title: label,
    description,
    openGraph: {
      title: label,
      description,
      images: title.posterUrl ? [{ url: title.posterUrl }] : [],
    },
    twitter: {
      card: title.posterUrl ? "summary_large_image" : "summary",
      images: title.posterUrl ? [title.posterUrl] : [],
    },
  };
}

export default async function TitlePage({
  params,
}: {
  params: Promise<{ imdbId: string }>;
}) {
  const { imdbId } = await params;
  const id = imdbId.toLowerCase();
  if (!/^tt\d{6,10}$/.test(id)) notFound();

  const overview = await getTitleOverview(id);
  const session = await auth();
  const { title } = overview;

  return (
    <div className="container-page py-10">
      {/* Header */}
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="aspect-[2/3] w-36 shrink-0 overflow-hidden rounded-xl bg-midnight-800 shadow-card">
          {title.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={title.posterUrl}
              alt={title.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center text-5xl text-slate-700">
              ⏭
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">{title.name}</h1>
            <span className="chip border border-white/10 bg-white/5 capitalize text-slate-300">
              {title.mediaType}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {title.year ?? ""} · <span className="mono">{title.imdbId}</span>
          </p>
          {title.overview && (
            <p className="mt-3 max-w-2xl text-sm text-slate-300">
              {title.overview}
            </p>
          )}
          <div className="mt-4 flex gap-4 text-sm">
            <span className="text-slate-300">
              <strong className="text-skip">{overview.totals.approved}</strong>{" "}
              approved
            </span>
            <span className="text-slate-300">
              <strong className="text-warn">{overview.totals.pending}</strong>{" "}
              pending
            </span>
          </div>
        </div>
      </div>

      <div className="mt-10">
        {overview.isMovie ? (
          <MovieBody imdbId={id} userId={session?.user?.id} />
        ) : (
          <SeriesBody overview={overview} imdbId={id} />
        )}
      </div>
    </div>
  );
}

async function MovieBody({
  imdbId,
  userId,
}: {
  imdbId: string;
  userId?: string;
}) {
  const initial = await loadPanelSegments({
    imdbId,
    season: null,
    episode: null,
    userId,
  });
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ApiLink imdbId={imdbId} />
      </div>
      <Timeline
        segments={initial.filter((s) => s.status === "approved")}
        durationMs={initial.find((s) => s.durationMs)?.durationMs ?? null}
      />
      <SegmentPanel
        imdbId={imdbId}
        season={null}
        episode={null}
        defaultDurationMs={null}
        initial={initial}
        isAuthed={Boolean(userId)}
      />
    </div>
  );
}

function CoverageSummary({
  episodes,
}: {
  episodes: Awaited<ReturnType<typeof getTitleOverview>>["episodes"];
}) {
  const total = episodes.filter((e) => e.season != null).length;
  if (total === 0) return null;

  return (
    <div className="card p-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Coverage across {total} episodes
      </h3>
      <div className="space-y-3">
        {SEGMENT_ORDER.map((type) => {
          const covered = episodes.filter(
            (e) =>
              e.season != null &&
              ((e.coverage[type]?.approved ?? 0) > 0 ||
                (type === "intro" && e.hasIntroAbsence)),
          ).length;
          const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
          const meta = SEGMENT_META[type];
          return (
            <div key={type}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="text-slate-300">{meta.label}</span>
                <span className="mono text-xs text-slate-400">
                  {covered}/{total} ({pct}%)
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${meta.ring}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeriesBody({
  overview,
  imdbId,
}: {
  overview: Awaited<ReturnType<typeof getTitleOverview>>;
  imdbId: string;
}) {
  const seasons =
    overview.seasons.length > 0
      ? overview.seasons
      : [
          ...new Set(
            overview.episodes
              .map((e) => e.season)
              .filter((s): s is number => s != null),
          ),
        ].sort((a, b) => a - b);

  return (
    <div className="space-y-8">
      <CoverageSummary episodes={overview.episodes} />
      <Suspense>
        <SeasonTabs
          imdbId={imdbId}
          seasons={seasons}
          episodes={overview.episodes}
        />
      </Suspense>
    </div>
  );
}
