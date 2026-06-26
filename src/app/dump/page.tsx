import type { Metadata } from "next";
import { API_URL, BASE_URL } from "@/lib/urls";

export const metadata: Metadata = {
  title: "Open data",
  description:
    "Download all SkipDB skip timestamps as open data (ODbL 1.0), or self-host a read-only mirror or a full fork.",
};

const DUMP_URL = process.env.NEXT_PUBLIC_DUMP_URL;

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-midnight-850 p-4 text-xs text-slate-300">
      <code className="mono">{children}</code>
    </pre>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-sm text-slate-400">{children}</div>
    </div>
  );
}

export default function DumpPage() {
  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold text-white">Open data</h1>
      <p className="mt-2 max-w-2xl text-slate-400">
        Every segment in SkipDB is published as open data under{" "}
        <a
          href="https://opendatacommons.org/licenses/odbl/1-0/"
          className="text-skip hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          ODbL 1.0
        </a>
        . The data contains no user information — only timestamps, titles, and
        community vote counts.
      </p>

      {DUMP_URL ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={DUMP_URL} className="btn-primary">
            Download skipdb-dump.json
          </a>
          <a
            href={`${BASE_URL}/api/dump`}
            className="btn-ghost"
            target="_blank"
            rel="noreferrer"
          >
            Via API
          </a>
        </div>
      ) : (
        <div className="mt-8">
          <a href="/api/dump" className="btn-primary">
            Download skipdb-dump.json
          </a>
        </div>
      )}

      <div className="mt-10 space-y-4">
        <Section title="What's in the dump">
          <p>
            A single JSON file with every segment at every status (approved,
            pending, rejected), plus vote counts and the title name and media
            type. No accounts, no emails, no IP addresses — timestamps plus an
            opaque submitter ID for moderation continuity.
          </p>
          <p>
            The dump is regenerated daily and published to GitHub Releases, so
            it&apos;s available even if this site goes down.
          </p>
          <CodeBlock>{`{
  "license": "ODbL 1.0",
  "generated_at": "2026-01-01T03:00:00.000Z",
  "count": 12345,
  "segments": [
    {
      "imdb_id": "tt0903747",
      "title": "Breaking Bad",
      "media_type": "series",
      "season": 1, "episode": 1,
      "segment_type": "intro",
      "status": "approved",
      "submitted_by": "usr_abc123",
      "start_ms": 61000, "end_ms": 91000,
      "start_sec": 61,   "end_sec": 91,
      "votes_up": 12, "votes_down": 0, "score": 12
    },
    ...
  ]
}`}</CodeBlock>
        </Section>

        <Section title="The data is never locked away">
          <p>
            The code is{" "}
            <a
              href="https://www.gnu.org/licenses/agpl-3.0.html"
              className="text-skip hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              AGPL-3.0
            </a>{" "}
            and the data is{" "}
            <a
              href="https://opendatacommons.org/licenses/odbl/1-0/"
              className="text-skip hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              ODbL 1.0
            </a>
            . Both licenses guarantee that neither can be quietly made
            proprietary. The daily dump to GitHub Releases means a permanent,
            independently-hosted copy of the data exists outside of any single
            server.
          </p>
          <p>
            If this instance ever disappears, anyone can download the last dump
            and stand up a new one with the full history intact.
          </p>
        </Section>

        <Section title="Host a read-only mirror">
          <p>
            A read-only mirror serves the full API and browse UI but disables
            login and submissions. Zero DB writes, low resource usage. Good for
            redundancy or regional proximity.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Fork the repo and deploy to Vercel, Railway, or Fly.io</li>
            <li>
              Point <span className="mono text-slate-300">DATABASE_URL</span> at
              a Postgres instance seeded from the dump (see below)
            </li>
            <li>
              Set{" "}
              <span className="mono text-slate-300">
                NEXT_PUBLIC_READ_ONLY=true
              </span>{" "}
              — this disables login, submissions, and votes in both the UI and
              the API
            </li>
            <li>
              Optionally set{" "}
              <span className="mono text-slate-300">DUMP_URL</span> to the
              GitHub Releases URL so{" "}
              <span className="mono text-slate-300">/api/dump</span> redirects
              there instead of hitting your DB
            </li>
          </ol>
          <CodeBlock>{`# .env on your mirror
DATABASE_URL=postgresql://...
NEXT_PUBLIC_READ_ONLY=true
DUMP_URL=${DUMP_URL ?? "https://github.com/SkipDB-TV/skipdb/releases/download/data-latest/skipdb-dump.json"}
NEXT_PUBLIC_DUMP_URL=${DUMP_URL ?? "https://github.com/SkipDB-TV/skipdb/releases/download/data-latest/skipdb-dump.json"}`}</CodeBlock>
        </Section>

        <Section title="Host a full fork">
          <p>
            A full fork accepts submissions and votes independently. Use this if
            you want to take over as the primary instance or run a community for
            a specific region or content type.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Fork the repo</li>
            <li>
              Set up a Postgres database (Supabase free tier, Neon, or
              self-hosted)
            </li>
            <li>
              Run migrations:{" "}
              <span className="mono text-slate-300">pnpm db:migrate</span>
            </li>
            <li>
              Import the dump:{" "}
              <span className="mono text-slate-300">pnpm db:import</span>
            </li>
            <li>
              Rebuild resolved segments:{" "}
              <span className="mono text-slate-300">pnpm db:resolve</span>
            </li>
            <li>Deploy and set your env vars (see .env.example)</li>
          </ol>
          <CodeBlock>{`# Seed a fresh database from the public dump
pnpm db:migrate
pnpm db:import ${DUMP_URL ?? "https://github.com/SkipDB-TV/skipdb/releases/download/data-latest/skipdb-dump.json"}
pnpm db:resolve

# Then run the app
pnpm build && pnpm start`}</CodeBlock>
          <p>
            The API is compatible with SkipDB clients. Set{" "}
            <span className="mono text-slate-300">NEXT_PUBLIC_API_URL</span> and{" "}
            <span className="mono text-slate-300">NEXT_PUBLIC_BASE_URL</span> to
            your domain so all links and SEO point to the right place.
          </p>
        </Section>
      </div>
    </div>
  );
}
