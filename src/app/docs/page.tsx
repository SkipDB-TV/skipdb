import { config } from "@/lib/config";
import { API_URL } from "@/lib/urls";

export const metadata = {
  title: "API docs",
  description:
    "Documentation for the SkipDB open API — fetch crowd-sourced intro, recap, outro and preview timestamps for any title by IMDb ID.",
};

const METHOD_COLOR: Record<string, string> = {
  GET: "bg-skip/15 text-skip-bright",
  POST: "bg-signal/15 text-signal-bright",
  PATCH: "bg-amber-500/15 text-amber-300",
  DELETE: "bg-danger/15 text-rose-300",
};

function Endpoint({
  method,
  path,
  auth,
  children,
}: {
  method: string;
  path: string;
  auth: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${METHOD_COLOR[method] ?? METHOD_COLOR.GET}`}>
          {method}
        </span>
        <code className="mono text-sm text-white">{path}</code>
        <span className="chip ml-auto bg-white/5 text-slate-400">{auth}</span>
      </div>
      <div className="mt-3 space-y-3 text-sm text-slate-400">{children}</div>
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

type Row = {
  name: string;
  type: string;
  required?: boolean;
  note: React.ReactNode;
};

function FieldTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/5 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-3 py-2 align-top whitespace-nowrap">
                  <code className="mono text-slate-200">{r.name}</code>
                  {r.required && (
                    <span className="ml-1 text-rose-300" title="required">
                      *
                    </span>
                  )}
                </td>
                <td className="mono px-3 py-2 align-top whitespace-nowrap text-slate-400">
                  {r.type}
                </td>
                <td className="px-3 py-2 align-top">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Errors({ rows }: { rows: { code: string; note: React.ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {rows.map((r) => (
        <span key={r.code}>
          <code className="mono text-slate-400">{r.code}</code> {r.note}
        </span>
      ))}
    </div>
  );
}

const SEGMENT_TYPES: { type: string; label: string; note: React.ReactNode }[] =
  [
    {
      type: "intro",
      label: "Intro",
      note: "Title sequence / opening credits.",
    },
    {
      type: "recap",
      label: "Recap",
      note: "“Previously on…” catch-up before the episode proper starts.",
    },
    {
      type: "outro",
      label: "Outro",
      note: (
        <>
          End credits. <span className="mono">end_ms</span> may be omitted — it
          defaults to <span className="mono">duration_ms</span> (credits run to
          the end of the stream). If provided, an end within{" "}
          {config.limits.outroEndThresholdMs / 1000}s of the stream duration is
          snapped to it automatically.
        </>
      ),
    },
    {
      type: "preview",
      label: "Preview",
      note: "“Next time on…” teaser for the following episode, usually after the outro.",
    },
  ];

export default function DocsPage() {
  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold text-white">API documentation</h1>
      <p className="mt-2 max-w-2xl text-slate-400">
        Base URL: <code className="mono text-slate-300">{API_URL}</code>. All
        timestamps are in milliseconds (<span className="mono">_ms</span>{" "}
        suffix) unless noted otherwise. Data is licensed{" "}
        <a href="/license" className="text-skip hover:underline">
          ODbL 1.0 + reciprocity
        </a>{" "}
        unless you have explicit permission. Fields marked{" "}
        <span className="text-rose-300">*</span> are required.
      </p>

      {/* ── Segment types ─────────────────────────────────────────────── */}
      <h2 className="mt-10 text-lg font-semibold text-white">Segment types</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Every segment belongs to exactly one of these four{" "}
        <span className="mono">segment_type</span> values — this is the only set
        the API accepts for the <span className="mono">type</span> query param
        and the <span className="mono">segment_type</span> body field.
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">segment_type</th>
              <th className="px-4 py-2 font-medium">Meaning</th>
              <th className="px-4 py-2 font-medium">Max length</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-400">
            {SEGMENT_TYPES.map((s) => (
              <tr key={s.type}>
                <td className="px-4 py-2 align-top whitespace-nowrap">
                  <code className="mono text-white">{s.type}</code>
                </td>
                <td className="px-4 py-2 align-top">{s.note}</td>
                <td className="px-4 py-2 align-top whitespace-nowrap">
                  {config.limits.maxByType[s.type] / 60_000} min
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 max-w-2xl text-xs text-slate-500">
        All segments must be at least {config.limits.minSegmentMs / 1000}s long,
        with one exception: submitting{" "}
        <span className="mono">start_ms: 0, end_ms: 0</span> is a sentinel
        meaning &ldquo;confirmed — this episode has no segment of this
        type&rdquo; (e.g. no recap this week). It always passes validation and
        is treated differently from a missing/unsubmitted segment.
      </p>

      {/* ── Conventions ───────────────────────────────────────────────── */}
      <h2 className="mt-10 text-lg font-semibold text-white">Conventions</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="card p-5 text-sm text-slate-400">
          <p className="font-medium text-white">Auth</p>
          <p className="mt-2">
            Reading is open and rate-limited ({config.limits.readPerMinute}{" "}
            req/min). Writing needs one of:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>a logged-in session cookie (browser use), or</li>
            <li>
              <span className="mono">Authorization: Bearer skdb_…</span>, or
            </li>
            <li>
              <span className="mono">X-API-Key: skdb_…</span>
            </li>
          </ul>
          <p className="mt-2">
            Writes are rate-limited to {config.limits.writePerMinute} req/min
            per account. Anonymous API keys (see below) can do everything a full
            account can except vote.
          </p>
        </div>
        <div className="card p-5 text-sm text-slate-400">
          <p className="font-medium text-white">Errors</p>
          <p className="mt-2">
            Errors are always{" "}
            <span className="mono">{`{ "error": "message", ... }`}</span> with
            extra context where relevant (e.g.{" "}
            <span className="mono">issues</span> for validation,{" "}
            <span className="mono">conflicting_segment_id</span> for conflicts).
          </p>
          <div className="mt-2">
            <Errors
              rows={[
                { code: "400", note: "malformed request" },
                { code: "401", note: "auth required" },
                { code: "403", note: "not allowed" },
                { code: "404", note: "not found" },
                { code: "409", note: "conflict" },
                { code: "422", note: "failed validation" },
                { code: "429", note: "rate limited" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ── Endpoints ─────────────────────────────────────────────────── */}
      <h2 className="mt-10 text-lg font-semibold text-white">Endpoints</h2>
      <div className="mt-3 space-y-4">
        <Endpoint
          method="GET"
          path="/api/segments"
          auth={`Open · ${config.limits.readPerMinute}/min`}
        >
          <p>
            Fetch the best segment of each type for a movie or episode, adjusted
            for the requester&apos;s stream duration when given.
          </p>
          <FieldTable
            title="Query params"
            rows={[
              {
                name: "imdb_id",
                type: "string",
                required: true,
                note: "IMDb id, e.g. tt0903747.",
              },
              {
                name: "season",
                type: "integer",
                note: "Omit both season and episode for a movie.",
              },
              { name: "episode", type: "integer", note: "See season." },
              {
                name: "type",
                type: `${config.segmentTypes.join(" | ")}`,
                note: "Restrict to one segment type. Omit to fetch all four — see note below.",
              },
              {
                name: "duration",
                type: "number (seconds)",
                note: "Stream length. Strongly recommended — enables duration matching/shifting and improves CDN cache hit rates versus passing ms.",
              },
              {
                name: "adjust",
                type: '"conservative" | "greedy" | "none"',
                note: (
                  <>
                    Default <span className="mono">conservative</span>. How to
                    shift timestamps when the stream duration is close but not
                    identical: <span className="mono">conservative</span> only
                    shifts earlier (never risks a late skip button),{" "}
                    <span className="mono">greedy</span> shifts in either
                    direction, <span className="mono">none</span> never shifts
                    (still reports <span className="mono">out-of-range</span>).
                  </>
                ),
              },
            ]}
          />
          <FieldTable
            title="Response fields"
            rows={[
              {
                name: "segments",
                type: "object",
                note: (
                  <>
                    Always has all four keys (
                    <span className="mono">
                      {config.segmentTypes.join(", ")}
                    </span>
                    ). If <span className="mono">type</span> was passed, the
                    other three keys are always{" "}
                    <span className="mono">null</span> — that does not mean no
                    data exists for them, just that they weren&apos;t requested.
                  </>
                ),
              },
              {
                name: "segments[type]",
                type: "object | null",
                note: (
                  <>
                    <span className="mono">null</span> means no approved data
                    yet for that type. Otherwise:{" "}
                    <span className="mono">start_ms</span>,{" "}
                    <span className="mono">end_ms</span>,{" "}
                    <span className="mono">match</span> (
                    <span className="mono">exact</span> |{" "}
                    <span className="mono">shifted</span> |{" "}
                    <span className="mono">agnostic</span> |{" "}
                    <span className="mono">out-of-range</span>),{" "}
                    <span className="mono">adjusted</span> (bool, whether
                    start/end were shifted),{" "}
                    <span className="mono">offset_ms</span> (requested minus
                    stored duration, 0 if not shifted), and{" "}
                    <span className="mono">confidence</span> (0–1, from
                    submission agreement + votes + match quality).
                  </>
                ),
              },
              {
                name: "intro_length_estimate_ms",
                type: "number | null",
                note: "Median intro length for the season, when 80% of episodes agree within 15s. Use to offer a “skip ~Xs” button (minus a few seconds of lead time) when no intro segment exists yet for this episode.",
              },
            ]}
          />
          <p>
            <span className="mono">match</span> reference:{" "}
            <span className="mono">exact</span> (stream duration matched within{" "}
            {config.duration.exactToleranceMs / 1000}s),{" "}
            <span className="mono">shifted</span> (within{" "}
            {config.duration.shiftToleranceMs / 1000}s, timestamps adjusted for
            an assumed extra/missing logo or scene at the start),{" "}
            <span className="mono">agnostic</span> (no{" "}
            <span className="mono">duration</span> supplied, so no comparison
            was possible), <span className="mono">out-of-range</span> (closest
            available data differs too much to shift reliably — treat as an
            uncertain match in your UI).
          </p>
          <Errors
            rows={[
              {
                code: "400",
                note: "missing/invalid imdb_id, type, adjust, season, episode, or duration",
              },
              { code: "429", note: "rate limit exceeded" },
            ]}
          />
          <Code>{`curl "${API_URL}/api/segments?imdb_id=tt0903747&season=1&episode=1&duration=2820"

{
  "imdb_id": "tt0903747", "season": 1, "episode": 1,
  "segments": {
    "intro": {
      "start_ms": 61000, "end_ms": 91000,
      "match": "exact", "adjusted": false, "offset_ms": 0,
      "confidence": 0.93
    },
    "recap":   null,
    "outro":   { "start_ms": 2760000, "end_ms": 2820000, "match": "shifted", ... },
    "preview": { "start_ms": 2700000, "end_ms": 2760000, "match": "out-of-range", ... }
  },
  "intro_length_estimate_ms": 30000
}`}</Code>
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/segments"
          auth={`Session or API key · ${config.limits.writePerMinute}/min`}
        >
          <p>
            Submit a segment. Submitting implies agreement to publish under{" "}
            <a href="/license" className="text-skip hover:underline">
              ODbL 1.0 + reciprocity
            </a>{" "}
            (see{" "}
            <a href="/terms" className="text-skip hover:underline">
              terms
            </a>
            ). Resubmitting the same episode/type/duration within 24h edits your
            existing submission instead of creating a duplicate.
          </p>
          <FieldTable
            title="Body"
            rows={[
              {
                name: "imdb_id",
                type: "string",
                required: true,
                note: "IMDb id.",
              },
              {
                name: "segment_type",
                type: config.segmentTypes.join(" | "),
                required: true,
                note: "Fixed once submitted — edit the times via PATCH, not the type.",
              },
              {
                name: "season",
                type: "integer",
                note: "Omit both for a movie.",
              },
              { name: "episode", type: "integer", note: "See season." },
              {
                name: "start_ms",
                type: "number",
                required: true,
                note: "Milliseconds.",
              },
              {
                name: "end_ms",
                type: "number",
                note: (
                  <>
                    Required for every type except{" "}
                    <span className="mono">outro</span>, where it defaults to{" "}
                    <span className="mono">duration_ms</span> if omitted (so at
                    least one of <span className="mono">end_ms</span> /{" "}
                    <span className="mono">duration_ms</span> must be given for
                    an outro).
                  </>
                ),
              },
              {
                name: "duration_ms",
                type: "number",
                note: (
                  <>
                    Stream length in ms. Recommended — improves matching for
                    other requesters. <span className="mono">duration_sec</span>{" "}
                    accepts the same thing in seconds or a clock string (e.g.{" "}
                    <span className="mono">&quot;47:00&quot;</span>).
                  </>
                ),
              },
            ]}
          />
          <Errors
            rows={[
              { code: "401", note: "no session/API key" },
              {
                code: "422",
                note: "schema validation failed (issues[]) or bounds invalid (too short/long, end ≤ start, beyond duration)",
              },
              {
                code: "409",
                note: "identical approved segment already exists (vote_url returned), or overlaps your own other submission (conflicting_segment_id)",
              },
              { code: "429", note: "rate limit exceeded" },
            ]}
          />
          <Code>{`curl -X POST ${API_URL}/api/segments \\
  -H "Authorization: Bearer skdb_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "imdb_id": "tt0903747",
    "season": 1, "episode": 1,
    "segment_type": "intro",
    "start_ms": 61000, "end_ms": 91000,
    "duration_ms": 2820000
  }'

{ "id": 42, "status": "approved", "auto_approved": true,
  "reasons": ["matches an existing approved segment (consensus)"],
  "message": "Submission accepted and published.",
  "license": "ODbL 1.0 + Service Provider Reciprocity ..." }`}</Code>
          <p className="text-xs text-slate-500">
            <span className="mono">status</span> is one of{" "}
            <span className="mono">approved</span>,{" "}
            <span className="mono">pending</span>,{" "}
            <span className="mono">rejected</span>, or (on a 409){" "}
            <span className="mono">already_approved</span>.
          </p>
        </Endpoint>

        <Endpoint
          method="PATCH"
          path="/api/segments/{id}"
          auth="Owner or moderator/admin"
        >
          <p>
            Edit a submission&apos;s times. Re-runs review, so a previously
            auto-approved segment can drop back to{" "}
            <span className="mono">pending</span> if the new values no longer
            qualify.
          </p>
          <FieldTable
            title="Body (all optional — omitted fields keep their current value)"
            rows={[
              { name: "start_ms", type: "number", note: "Milliseconds." },
              { name: "end_ms", type: "number", note: "Milliseconds." },
              {
                name: "duration_ms",
                type: "number",
                note: (
                  <>
                    <span className="mono">duration_sec</span> also accepted.
                  </>
                ),
              },
              {
                name: "clear_duration",
                type: "boolean",
                note: "Drop the stored duration_ms.",
              },
              {
                name: "segment_type",
                type: "string",
                note: (
                  <>
                    Immutable — passing a different value than the segment
                    already has returns a 422. Delete and resubmit instead.
                  </>
                ),
              },
            ]}
          />
          <Errors
            rows={[
              { code: "401", note: "no session/API key" },
              { code: "403", note: "not your submission and not staff" },
              { code: "404", note: "segment not found" },
              {
                code: "422",
                note: "bounds invalid or segment_type change attempted",
              },
              { code: "409", note: "overlaps your own other submission" },
            ]}
          />
          <Code>{`{ "id": 42, "status": "pending", "auto_approved": false,
  "reasons": [...], "message": "Submission updated and sent back to review." }`}</Code>
        </Endpoint>

        <Endpoint
          method="DELETE"
          path="/api/segments/{id}"
          auth="Owner or moderator/admin"
        >
          <p>Delete a submission.</p>
          <Errors
            rows={[
              { code: "401", note: "no session/API key" },
              { code: "403", note: "not your submission and not staff" },
              { code: "404", note: "segment not found" },
            ]}
          />
          <Code>{`{ "id": 42, "deleted": true }`}</Code>
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/segments/{id}/vote"
          auth="Session or registered API key (not anonymous)"
        >
          <p>
            Vote a segment up or down. Requires a real, ownable identity — an
            anonymous key (below) can&apos;t vote — and you can&apos;t vote on
            your own submission.
          </p>
          <FieldTable
            title="Body"
            rows={[
              {
                name: "value",
                type: "1 | -1 | 0",
                required: true,
                note: "1 = good, -1 = bad, 0 = clear your existing vote.",
              },
            ]}
          />
          <Errors
            rows={[
              { code: "400", note: "invalid segment id or JSON body" },
              { code: "401", note: "auth required" },
              { code: "403", note: "own segment, or segment disabled" },
              { code: "404", note: "segment not found" },
              { code: "422", note: "value must be 1, -1, or 0" },
              { code: "429", note: "rate limit exceeded (60/min)" },
            ]}
          />
          <Code>{`{ "segment_id": 42, "your_vote": 1,
  "votes": { "up": 6, "down": 1, "score": 5 } }`}</Code>
        </Endpoint>

        <Endpoint
          method="GET"
          path="/api/titles/search"
          auth={`Open · ${config.limits.metadataPerMinute}/min`}
        >
          <p>
            Search by name or IMDb id. Proxies TMDB (when configured) and always
            also checks titles already in the database.
          </p>
          <FieldTable
            title="Query params"
            rows={[
              {
                name: "q",
                type: "string",
                required: true,
                note: "Free-text name, or an IMDb id (e.g. tt0903747) for a direct lookup.",
              },
            ]}
          />
          <FieldTable
            title="Response fields"
            rows={[
              {
                name: "provider",
                type: '"tmdb" | "local" | "none"',
                note: "Which source results came from.",
              },
              {
                name: "results",
                type: "array",
                note: "TMDB (or fallback) matches. For an IMDb-id query with no metadata match, contains a single placeholder object with a note field — you can still submit segments for it.",
              },
              {
                name: "local",
                type: "array",
                note: "Titles already in SkipDB's database matching by name (name search only).",
              },
            ]}
          />
          <Code>{`curl "${API_URL}/api/titles/search?q=Breaking%20Bad"`}</Code>
        </Endpoint>

        <Endpoint
          method="GET"
          path="/api/titles/{imdbId}"
          auth={`Open · ${config.limits.metadataPerMinute}/min`}
        >
          <p>
            Title metadata with the season/episode list and a per-episode
            coverage matrix (which segment types have data).
          </p>
          <FieldTable
            title="Response fields"
            rows={[
              { name: "name", type: "string", note: "" },
              { name: "year", type: "number | null", note: "" },
              { name: "media_type", type: '"movie" | "series"', note: "" },
              { name: "poster_url", type: "string | null", note: "" },
              { name: "seasons", type: "array", note: "Season list." },
              {
                name: "totals",
                type: "object",
                note: "Aggregate coverage counts.",
              },
              {
                name: "episodes",
                type: "array",
                note: "Per-episode coverage matrix.",
              },
            ]}
          />
          <Errors
            rows={[
              { code: "400", note: "invalid IMDb id" },
              { code: "429", note: "rate limit exceeded" },
            ]}
          />
        </Endpoint>

        <Endpoint method="GET" path="/api/dump" auth="Open · 6/min">
          <p>
            The full open data dump of every approved segment — no user data.
            Licensed ODbL 1.0 + reciprocity. This is the guarantee that the data
            stays free. Cached for an hour; may 302-redirect to a static mirror.
          </p>
          <FieldTable
            title="Response fields"
            rows={[
              {
                name: "segments",
                type: "array",
                note: (
                  <>
                    Each row: <span className="mono">id</span>,{" "}
                    <span className="mono">imdb_id</span>,{" "}
                    <span className="mono">media_type</span>,{" "}
                    <span className="mono">season</span>,{" "}
                    <span className="mono">episode</span>,{" "}
                    <span className="mono">segment_type</span>,{" "}
                    <span className="mono">start_ms</span>,{" "}
                    <span className="mono">end_ms</span>,{" "}
                    <span className="mono">duration_ms</span>,{" "}
                    <span className="mono">submitted_by</span> (opaque user id,
                    no PII), <span className="mono">votes_up</span>,{" "}
                    <span className="mono">votes_down</span>,{" "}
                    <span className="mono">score</span>,{" "}
                    <span className="mono">created_at</span>,{" "}
                    <span className="mono">updated_at</span>.
                  </>
                ),
              },
              { name: "count", type: "number", note: "Length of segments." },
              {
                name: "generated_at",
                type: "string (ISO 8601)",
                note: "",
              },
            ]}
          />
        </Endpoint>

        <Endpoint method="POST" path="/api/keys" auth="Session only">
          <p>
            Generate or reset your API key. <span className="mono">GET</span>{" "}
            returns the active key&apos;s prefix (not the secret);{" "}
            <span className="mono">POST</span> returns the plaintext key{" "}
            <strong className="text-white">once</strong> and revokes any
            previous key; <span className="mono">DELETE</span> revokes it. Not
            available via API key — you can&apos;t bootstrap key management from
            a key.
          </p>
          <Code>{`// POST response (201)
{ "key": "skdb_live_...", "prefix": "skdb_live_ab12",
  "message": "Here is your API key. ..." }`}</Code>
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/keys/anonymous"
          auth="Open (IP rate-limited)"
        >
          <p>
            Get an API key without signing up. Creates a blank, login-less user
            behind the scenes and returns its key (plaintext, once) —
            there&apos;s no account to recover it from, so save it immediately.
            Rate-limited per IP ({config.limits.anonymousKeysPerHour}/hour).{" "}
            <span className="mono">DELETE</span> with the same key (via{" "}
            <span className="mono">Authorization</span> or{" "}
            <span className="mono">X-API-Key</span>) revokes it.
          </p>
          <p>
            Anonymous keys can submit, edit, and delete their own segments the
            same as a full account — the one thing they can&apos;t do is vote on
            other people&apos;s submissions, since voting feeds reputation and
            abuse resistance that depend on a real, ownable identity.
          </p>
          <Errors
            rows={[
              {
                code: "429",
                note: `more than ${config.limits.anonymousKeysPerHour} keys from this IP in an hour (POST)`,
              },
              { code: "401", note: "missing key (DELETE)" },
              {
                code: "403",
                note: "key belongs to a registered account — manage it from /account instead (DELETE)",
              },
            ]}
          />
          <Code>{`// POST response (201)
{ "key": "skdb_live_...", "prefix": "skdb_live_cd34",
  "message": "Here is your anonymous API key. ..." }`}</Code>
        </Endpoint>
      </div>
    </div>
  );
}
