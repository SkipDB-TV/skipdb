import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why SkipDB exists — open, crowdsourced skip timestamps that can never be locked away, shut down, or held hostage.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/5 pt-10">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-slate-400 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Comparison({
  rows,
}: {
  rows: { feature: string; skipdb: string; others: string }[];
}) {
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-white/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 text-left">
            <th className="px-4 py-3 font-medium text-slate-500">Feature</th>
            <th className="px-4 py-3 font-medium text-skip">SkipDB</th>
            <th className="px-4 py-3 font-medium text-slate-500">
              Typical alternatives
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-white/5">
              <td className="px-4 py-3 text-slate-300">{r.feature}</td>
              <td className="px-4 py-3 text-slate-300">{r.skipdb}</td>
              <td className="px-4 py-3 text-slate-500">{r.others}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="container-page py-12">
      {/* Header */}
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          About SkipDB
        </h1>
        <p className="mt-4 text-lg text-slate-400 leading-relaxed">
          SkipDB is an open, crowdsourced database of skip timestamps — intros,
          recaps, outros and previews — for movies and TV shows. The data is
          contributed by the community, reviewed by the community, and published
          openly under a license that keeps it free forever.
        </p>
      </div>

      <div className="mt-10 space-y-10 max-w-3xl">
        <Section title="The problem with the alternatives">
          <p>
            Skip-timestamp services have existed for years. Some are built into
            streaming platforms. Others are community projects. Most of them
            share the same flaw: the data collected from community submissions
            is kept proprietary by whoever runs the service.
          </p>
          <p>
            That means if the service shuts down — or decides to start charging
            for API access, or gets acquired, or simply stops caring — all of
            the work contributed by thousands of users disappears with it. You
            had no say. You contributed the data. You don't own it.
          </p>
          <p>
            SkipDB exists to fix that. The data you submit is published openly
            under the{" "}
            <Link href="/license" className="text-skip hover:underline">
              Open Database License
            </Link>
            . Anyone can read it, download it, mirror it, or build on it.
          </p>
        </Section>

        <Section title="Why open data matters">
          <p>
            When community-submitted data stays locked in a private database,
            the community that built it has no leverage. The operator can change
            the terms, restrict the API, shut it down, or sell it — and
            contributors have no recourse.
          </p>
          <p>
            Open data flips that relationship. Every segment in SkipDB is
            published in a daily{" "}
            <Link href="/data" className="text-skip hover:underline">
              public data dump
            </Link>
            . Mirrors can stay in sync. Forks can spin up independently. Even if
            this instance disappears, the data survives.
          </p>
          <p>
            The license also includes a reciprocity clause: any service that
            builds on SkipDB data must publish its own corresponding data openly
            too. No free-riding on community contributions while keeping your
            own database private.
          </p>
        </Section>

        <Section title="How it compares">
          <Comparison
            rows={[
              {
                feature: "Source code",
                skipdb: "Open — AGPL-3.0",
                others: "Usually closed",
              },
              {
                feature: "Submitted data",
                skipdb: "Open — ODbL 1.0 + reciprocity",
                others: "Proprietary, no export",
              },
              {
                feature: "Movies",
                skipdb: "Supported",
                others: "Most only support TV",
              },
              {
                feature: "Public data dump",
                skipdb: "Daily export, no account needed",
                others: "Bulk access strictly against their terms",
              },
              {
                feature: "Self-hostable",
                skipdb: "Full mirror or fork in minutes",
                others: "No",
              },
              {
                feature: "Survives shutdown",
                skipdb: "Yes — data is always downloadable",
                others: "Data lost when service closes",
              },
              {
                feature: "Multi-stream duration",
                skipdb: "Timestamps shift for different encodes",
                others: "Rarely handled",
              },
              {
                feature: "Segment types",
                skipdb: "Intro, recap, outro, preview",
                others: "Usually intro only",
              },
            ]}
          />
        </Section>

        <Section title="What happens if SkipDB shuts down?">
          <p>
            Nothing is lost. The daily data dump is published to GitHub Releases
            and anyone can download it at any time. The code is open-source so
            anyone can run their own instance. A fork can be seeded from the
            public dump in a few minutes and pick up where this one left off.
          </p>
          <p>
            That's the whole point. SkipDB is designed to be replaceable. The
            data doesn't belong to whoever runs the server — it belongs to the
            community that contributed it.
          </p>
        </Section>

        <Section title="How to host a mirror or take over">
          <p>
            Full instructions are on the{" "}
            <Link href="/data" className="text-skip hover:underline">
              open data page
            </Link>
            . Short version: clone the repo, spin up a Postgres database, seed
            it from the public dump with{" "}
            <code className="mono text-slate-300">pnpm db:import</code>, and
            deploy with{" "}
            <code className="mono text-slate-300">NEXT_PUBLIC_READ_ONLY=true</code>{" "}
            to disable submissions and keep the instance read-only.
          </p>
          <p>
            The{" "}
            <a
              href="https://github.com/SkipDB-TV/skipdb"
              target="_blank"
              rel="noreferrer"
              className="text-skip hover:underline"
            >
              GitHub repository
            </a>{" "}
            has everything you need.
          </p>
        </Section>

        {/* CTA */}
        <div className="border-t border-white/5 pt-10 flex flex-wrap gap-3">
          <Link href="/auth/signin" className="btn-primary">
            Contribute timestamps
          </Link>
          <Link href="/docs" className="btn-ghost">
            API docs
          </Link>
          <Link href="/data" className="btn-ghost">
            Download the data
          </Link>
        </div>
      </div>
    </div>
  );
}
