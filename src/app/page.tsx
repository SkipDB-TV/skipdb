import Link from "next/link";
import { db } from "@/db";
import { titles, segments } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { SearchBox } from "@/components/SearchBox";
import { SEGMENT_ORDER, SEGMENT_META } from "@/lib/segment-types";
import { ApiDemo } from "@/components/ApiDemo";

async function getHomeStats() {
  const [row] = await db
    .select({
      titleCount: sql<number>`count(distinct ${titles.id})`,
      segmentCount: sql<number>`count(${segments.id}) filter (
        where ${segments.status} = 'approved'
        and not (${segments.startMs} = 0 and ${segments.endMs} = 0)
      )`,
      episodeCount: sql<number>`count(distinct (${segments.imdbId}, coalesce(${segments.season}, -1), coalesce(${segments.episode}, -1))) filter (
        where ${segments.status} = 'approved'
        and not (${segments.startMs} = 0 and ${segments.endMs} = 0)
      )`,
    })
    .from(titles)
    .leftJoin(segments, eq(segments.titleId, titles.id));

  return {
    titles: Number(row.titleCount),
    segments: Number(row.segmentCount),
    episodes: Number(row.episodeCount),
  };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M+`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k+`;
  return String(n);
}

export default async function HomePage() {
  const stats = await getHomeStats();
  return (
    <div className="container-page py-16">
      {/* Hero */}
      <section className="mx-auto max-w-3xl text-center">
        <span className="chip border border-skip/30 bg-skip/10 text-skip-bright">
          Open code · Open data · Forever
        </span>
        <h1 className="mt-5 text-balance text-5xl font-bold tracking-tight text-white sm:text-6xl">
          Skip the intro.
          <br />
          <span className="text-skip">Keep the data free.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
          SkipDB is crowdsourced intro, recap, outro and preview timestamps for
          movies and TV - contributed by people, reviewed by the community, and{" "}
          <strong className="text-white">published openly</strong> so the data
          can never be quietly locked away or sold.
        </p>
        <div className="mx-auto mt-8 max-w-xl">
          <SearchBox autoFocus />
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Try{" "}
          <Link href="/title/tt0903747" className="text-skip hover:underline">
            Breaking Bad
          </Link>{" "}
          or{" "}
          <Link href="/title/tt1632701" className="text-skip hover:underline">
            Suits
          </Link>
          .
        </p>
      </section>

      {/* Stats */}
      <section className="mt-14 grid grid-cols-2 divide-x divide-white/5 rounded-2xl border border-white/5 bg-white/3">
        {[
          { value: fmt(stats.segments), label: "approved segments" },
          { value: fmt(stats.episodes), label: "episodes covered" },
        ].map((s) => (
          <div key={s.label} className="py-6 text-center">
            <p className="text-3xl font-bold text-skip">{s.value}</p>
            <p className="mt-1 text-sm text-slate-400">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Why different */}
      <section className="mt-16 grid gap-4 md:grid-cols-3">
        {[
          {
            title: "The data stays open",
            body: "Code is AGPL-3.0, data is ODbL 1.0 + reciprocity. A public dump means SkipDB can never be made proprietary or shut down with the data held hostage.",
          },
          {
            title: "Voted, not just submitted",
            body: "Timestamps are scored by community votes and cross-checked against the show's established pattern before going live. Outliers go to manual review — so clients get reliable data, not just whatever was submitted first.",
          },
          {
            title: "Stream-aware matching",
            body: "Optional per-submission stream duration lets SkipDB compare versions and smart-shift timestamps when a stream has an extra logo or scene at the start.",
          },
        ].map((f) => (
          <div key={f.title} className="card p-6">
            <h3 className="text-lg font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm text-slate-400">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Segment types */}
      <section className="mt-16">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-slate-500">
          Four kinds of skippable segment
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SEGMENT_ORDER.map((t) => {
            const m = SEGMENT_META[t];
            return (
              <div key={t} className="card flex items-center gap-3 p-4">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-lg ${m.ring} text-midnight-950`}
                  aria-hidden
                >
                  {m.icon}
                </span>
                <div>
                  <p className="font-semibold text-white">{m.label}</p>
                  <p className="text-xs text-slate-400">{m.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* API quickstart */}
      <section className="mt-20 grid items-center gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold text-white">A free, open API</h2>
          <p className="mt-3 text-slate-300">
            Reading is open with sensible rate limits — no key required. Pass a
            stream <span className="mono text-skip">duration</span> and SkipDB
            returns the best-matching segment, adjusting timestamps across
            differing stream lengths.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/docs" className="btn-primary">
              Read the API docs
            </Link>
            <Link href="/data" className="btn-ghost">
              The data
            </Link>
          </div>
          <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            No auth required to read
          </div>
        </div>
        <ApiDemo />
      </section>

      {/* App Integrations */}
      <section className="mt-20">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-slate-500">
          App Integrations
        </h2>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <a
            href="https://vortx.tv"
            target="_blank"
            rel="noreferrer"
            className="card flex items-center gap-4 p-5 hover:border-white/20 transition-colors"
          >
            <img
              src="/vortx.svg"
              alt="VortX"
              width={52}
              height={52}
              className="rounded-xl"
            />
            <div>
              <p className="font-semibold text-white">VortX</p>
              <p className="mt-0.5 max-w-xs text-sm text-slate-400">
                Native streaming client for iOS, tvOS &amp; macOS.
              </p>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}
