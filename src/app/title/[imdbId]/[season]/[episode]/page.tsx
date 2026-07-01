import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { titles, episodes as episodesTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ensureTitle, ensureSeasonEpisodes } from "@/lib/titles";
import { loadPanelSegments } from "@/lib/panel";
import { auth } from "@/lib/auth";
import { SegmentPanel } from "@/components/SegmentPanel";
import { Timeline } from "@/components/Timeline";
import { ApiLink } from "@/components/ApiLink";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ imdbId: string; season: string; episode: string }>;
}): Promise<Metadata> {
  const { imdbId, season: seasonRaw, episode: episodeRaw } = await params;
  const id = imdbId.toLowerCase();
  const season = Number(seasonRaw);
  const episode = Number(episodeRaw);
  if (
    !/^tt\d{6,10}$/.test(id) ||
    !Number.isInteger(season) ||
    !Number.isInteger(episode)
  )
    return {};

  const [title] = await db
    .select()
    .from(titles)
    .where(eq(titles.imdbId, id))
    .limit(1);
  if (!title) return {};

  const ep = await db
    .select()
    .from(episodesTable)
    .where(
      and(
        eq(episodesTable.titleId, title.id),
        eq(episodesTable.season, season),
        eq(episodesTable.episode, episode),
      ),
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  const epCode = `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
  const epName = ep?.name ?? `Episode ${episode}`;
  const label = `${title.name} ${epCode} - ${epName}`;
  const description = ep?.overview
    ? `${ep.overview.slice(0, 150).trimEnd()}… - skip timestamps on SkipDB.`
    : `Community skip timestamps for ${title.name} ${epCode} on SkipDB.`;

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

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ imdbId: string; season: string; episode: string }>;
}) {
  const { imdbId, season: seasonRaw, episode: episodeRaw } = await params;
  const id = imdbId.toLowerCase();
  const season = Number(seasonRaw);
  const episode = Number(episodeRaw);
  if (
    !/^tt\d{6,10}$/.test(id) ||
    !Number.isInteger(season) ||
    !Number.isInteger(episode)
  )
    notFound();

  const title = await ensureTitle(id, "series");
  await ensureSeasonEpisodes(title, season);

  const ep = (
    await db
      .select()
      .from(episodesTable)
      .where(
        and(
          eq(episodesTable.titleId, title.id),
          eq(episodesTable.season, season),
          eq(episodesTable.episode, episode),
        ),
      )
  )[0];

  const session = await auth();
  const initial = await loadPanelSegments({
    imdbId: id,
    season,
    episode,
    userId: session?.user?.id,
  });

  const defaultDuration =
    ep?.runtimeMs ?? initial.find((s) => s.durationMs)?.durationMs ?? null;

  return (
    <div className="container-page py-10">
      <div className="text-sm text-slate-500">
        <Link href={`/title/${id}?season=${season}`} className="hover:text-white">
          {title.name}
        </Link>{" "}
        <span className="mx-1">/</span>
        <span className="mono">
          S{String(season).padStart(2, "0")}E{String(episode).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-white">
          {ep?.name ?? `Episode ${episode}`}
        </h1>
        <ApiLink imdbId={id} season={season} episode={episode} />
      </div>
      {ep?.overview && (
        <p className="mt-2 max-w-2xl text-sm text-slate-400">{ep.overview}</p>
      )}

      <div className="mt-8 space-y-6">
        <Timeline
          segments={initial.filter((s) => s.status === "approved")}
          durationMs={defaultDuration}
        />
        <SegmentPanel
          imdbId={id}
          season={season}
          episode={episode}
          defaultDurationMs={defaultDuration}
          initial={initial}
          isAuthed={Boolean(session?.user?.id)}
        />
      </div>
    </div>
  );
}
