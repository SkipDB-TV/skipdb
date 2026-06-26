import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { searchTitles, tmdbEnabled } from "@/lib/tmdb";
import { getPopularTitles } from "@/lib/popular";
import { db } from "@/db";
import { titles } from "@/db/schema";
import { ilike, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface ResultCard {
  href: string;
  name: string;
  year: number | null;
  mediaType: "movie" | "series";
  posterUrl: string | null;
  badge?: string;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  let results: ResultCard[] = [];
  if (query) {
    const remote = await searchTitles(query);
    const local = await db
      .select()
      .from(titles)
      .where(
        or(ilike(titles.name, `%${query}%`), ilike(titles.imdbId, `%${query}%`)),
      )
      .limit(20);

    const seen = new Set<string>();
    const localCards: ResultCard[] = local.map((t) => {
      seen.add(`${t.name}-${t.year}`);
      return {
        href: `/title/${t.imdbId}`,
        name: t.name,
        year: t.year,
        mediaType: t.mediaType,
        posterUrl: t.posterUrl,
        badge: "Has data",
      };
    });
    const remoteCards: ResultCard[] = remote
      .filter((r) => !seen.has(`${r.name}-${r.year}`))
      .map((r) => ({
        href: `/title/tmdb/${r.mediaType === "series" ? "series" : "movie"}/${r.tmdbId}`,
        name: r.name,
        year: r.year,
        mediaType: r.mediaType,
        posterUrl: r.posterUrl,
      }));
    results = [...localCards, ...remoteCards];
  }

  const popular = query ? [] : await getPopularTitles();

  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-bold text-white">Browse titles</h1>
      <p className="mt-2 text-slate-400">
        Search a movie or show by name, or paste an IMDb id.
      </p>
      <div className="mt-6 max-w-2xl">
        <SearchBox initial={query} autoFocus />
      </div>

      {!tmdbEnabled() && (
        <p className="mt-4 rounded-xl border border-warn/20 bg-warn/10 px-4 py-3 text-sm text-amber-200">
          No TMDB key configured — name search is limited to titles already in
          the database. You can always open a title directly by IMDb id, e.g.{" "}
          <Link href="/title/tt0903747" className="underline">
            /title/tt0903747
          </Link>
          .
        </p>
      )}

      {query && results.length === 0 && (
        <p className="mt-10 text-slate-400">
          No matches for “{query}”. If you know the IMDb id you can open it
          directly.
        </p>
      )}

      {/* Search results */}
      {results.length > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {results.map((r) => (
            <TitleCard key={r.href} {...r} />
          ))}
        </div>
      )}

      {/* Popular / most-covered titles when not searching */}
      {!query && popular.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-white">
              Most-covered titles
            </h2>
            <span className="text-xs text-slate-500">
              ranked by approved segments &amp; votes
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {popular.map((p) => (
              <TitleCard
                key={p.imdbId}
                href={`/title/${p.imdbId}`}
                name={p.name}
                year={p.year}
                mediaType={p.mediaType}
                posterUrl={p.posterUrl}
                badge={`${p.approvedCount} segment${p.approvedCount === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        </section>
      )}

      {!query && popular.length === 0 && (
        <p className="mt-10 text-slate-400">
          No titles have data yet — search for a show and be the first to
          contribute.
        </p>
      )}
    </div>
  );
}

function TitleCard({
  href,
  name,
  year,
  mediaType,
  posterUrl,
  badge,
}: ResultCard) {
  return (
    <Link
      href={href}
      className="card group overflow-hidden transition hover:shadow-glow"
      prefetch={false}
    >
      <div className="aspect-[2/3] w-full bg-midnight-800">
        {posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt={name}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-4xl text-slate-700">
            ⏭
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-medium text-white">{name}</p>
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span>{year ?? "—"}</span>
          <span className="capitalize">{mediaType}</span>
        </div>
        {badge && (
          <span className="mt-2 inline-block chip bg-skip/15 text-skip-bright">
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}
