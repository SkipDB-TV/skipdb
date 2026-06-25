import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { episodes as episodesTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ensureTitle, ensureSeasonEpisodes } from "@/lib/titles";
import { loadPanelSegments } from "@/lib/panel";
import { auth } from "@/lib/auth";
import { SegmentPanel } from "@/components/SegmentPanel";
import { Timeline } from "@/components/Timeline";

export const dynamic = "force-dynamic";

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ imdbId: string; season: string; episode: string }>;
}) {
  const { imdbId, season: seasonRaw, episode: episodeRaw } = await params;
  const id = imdbId.toLowerCase();
  const season = Number(seasonRaw);
  const episode = Number(episodeRaw);
  if (!/^tt\d{6,10}$/.test(id) || !Number.isInteger(season) || !Number.isInteger(episode))
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
        <Link href={`/title/${id}`} className="hover:text-white">
          {title.name}
        </Link>{" "}
        <span className="mx-1">/</span>
        <span className="mono">
          S{String(season).padStart(2, "0")}E{String(episode).padStart(2, "0")}
        </span>
      </div>
      <h1 className="mt-1 text-3xl font-bold text-white">
        {ep?.name ?? `Episode ${episode}`}
      </h1>
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
