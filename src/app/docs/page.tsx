import { config } from "@/lib/config";

export const metadata = { title: "API docs" };

function Endpoint({
  method,
  path,
  children,
}: {
  method: string;
  path: string;
  children: React.ReactNode;
}) {
  const color =
    method === "GET"
      ? "bg-skip/15 text-skip-bright"
      : method === "POST"
        ? "bg-signal/15 text-signal-bright"
        : "bg-danger/15 text-rose-300";
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <span className={`chip ${color}`}>{method}</span>
        <code className="mono text-sm text-white">{path}</code>
      </div>
      <div className="mt-3 text-sm text-slate-400">{children}</div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-midnight-850 p-4 text-xs text-slate-300">
      <code className="mono">{children}</code>
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold text-white">API documentation</h1>
      <p className="mt-2 max-w-2xl text-slate-400">
        Reading is open and rate-limited ({config.limits.readPerMinute}{" "}
        req/min). Writing requires a logged-in session or an API key (
        {config.limits.writePerMinute} req/min). All timestamps are returned in
        both <span className="mono">_ms</span> and{" "}
        <span className="mono">_sec</span>. Data is licensed CC BY-NC-SA 4.0
        unless you have explicit permission.
      </p>

      <div className="mt-8 space-y-4">
        <Endpoint method="GET" path="/api/segments">
          <p>
            Fetch the best segments for a movie or episode. Query params:{" "}
            <span className="mono">imdb_id</span> (required),{" "}
            <span className="mono">season</span>,{" "}
            <span className="mono">episode</span>,{" "}
            <span className="mono">type</span> (
            {config.segmentTypes.join(" | ")}), and{" "}
            <span className="mono">duration</span> (stream length in ms).
          </p>
          <p className="mt-2">
            When <span className="mono">duration</span> is supplied, SkipDB
            returns the best-matching version and shifts timestamps for streams
            that differ by up to {config.duration.shiftToleranceMs / 1000}s —
            assuming an extra/missing logo or scene at the start.
          </p>
          <Code>{`curl "/api/segments?imdb_id=tt0903747&season=1&episode=1&duration=2820000"

{
  "segments": [
    {
      "segment_type": "intro",
      "start_ms": 61000, "end_ms": 91000,
      "start_sec": 61,   "end_sec": 91,
      "match": "exact", "adjusted": false, "offset_ms": 0,
      "votes": { "up": 12, "down": 1, "score": 11 }
    }
  ],
  "alternatives": [ ... ],
  "license": "CC BY-NC-SA 4.0 ..."
}`}</Code>
        </Endpoint>

        <Endpoint method="POST" path="/api/segments">
          <p>
            Submit a segment. Auth via{" "}
            <span className="mono">Authorization: Bearer skdb_…</span> or{" "}
            <span className="mono">X-API-Key</span> (or a session cookie). Times
            accept <span className="mono">*_ms</span> (numbers) or{" "}
            <span className="mono">*_sec</span> (seconds or clock strings).{" "}
            <span className="mono">agree_terms: true</span> is required.
          </p>
          <Code>{`curl -X POST /api/segments \\
  -H "Authorization: Bearer skdb_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "imdb_id": "tt0903747",
    "season": 1, "episode": 1,
    "segment_type": "intro",
    "start_ms": 61000, "end_ms": 91000,
    "duration_ms": 2820000,
    "agree_terms": true
  }'

{ "id": 42, "status": "approved", "auto_approved": true,
  "reasons": ["matches an existing approved segment (consensus)"] }`}</Code>
        </Endpoint>

        <Endpoint method="POST" path="/api/segments/{id}/vote">
          <p>
            Vote a segment <span className="mono">{`{ "value": 1 }`}</span> (good)
            or <span className="mono">-1</span> (bad), or{" "}
            <span className="mono">0</span> to clear. Requires auth.
          </p>
        </Endpoint>

        <Endpoint method="GET" path="/api/titles/search?q=">
          <p>
            Search by name or IMDb id. Returns TMDB matches (if configured) plus
            titles already in the database.
          </p>
        </Endpoint>

        <Endpoint method="GET" path="/api/titles/{imdbId}">
          <p>
            Title metadata with the season/episode list and a per-episode
            coverage matrix.
          </p>
        </Endpoint>

        <Endpoint method="GET" path="/api/dump">
          <p>
            The full open data dump of every approved segment — no user data.
            Licensed CC BY-NC-SA 4.0. This is the guarantee that the data stays
            free.
          </p>
        </Endpoint>

        <Endpoint method="POST" path="/api/keys">
          <p>
            Generate or reset your API key (returns the plaintext once).{" "}
            <span className="mono">GET</span> returns the active key prefix;{" "}
            <span className="mono">DELETE</span> revokes it. Session only.
          </p>
        </Endpoint>
      </div>
    </div>
  );
}
