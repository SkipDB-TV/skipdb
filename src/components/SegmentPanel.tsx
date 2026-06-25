"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { msToClock, msToSec } from "@/lib/time";
import { SEGMENT_META, SEGMENT_ORDER } from "@/lib/segment-types";
import type { SegmentTypeName } from "@/lib/config";

export interface PanelSegment {
  id: number;
  segmentType: SegmentTypeName;
  startMs: number;
  endMs: number;
  durationMs: number | null;
  votesUp: number;
  votesDown: number;
  score: number;
  status: "approved" | "pending" | "rejected";
  yourVote: number;
}

export function SegmentPanel({
  imdbId,
  season,
  episode,
  defaultDurationMs,
  initial,
  isAuthed,
}: {
  imdbId: string;
  season: number | null;
  episode: number | null;
  defaultDurationMs: number | null;
  initial: PanelSegment[];
  isAuthed: boolean;
}) {
  const router = useRouter();
  const [segments, setSegments] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function vote(id: number, value: number) {
    if (!isAuthed) {
      router.push("/auth/signin");
      return;
    }
    const seg = segments.find((s) => s.id === id);
    const next = seg && seg.yourVote === value ? 0 : value; // toggle off
    const res = await fetch(`/api/segments/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: next }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setSegments((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              yourVote: next,
              votesUp: data.votes.up,
              votesDown: data.votes.down,
              score: data.votes.score,
            }
          : s,
      ),
    );
  }

  const grouped = SEGMENT_ORDER.map((t) => ({
    type: t,
    items: segments.filter((s) => s.segmentType === t),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {grouped.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          No segments yet. Be the first to contribute below.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => {
            const meta = SEGMENT_META[g.type];
            return (
              <div key={g.type}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`chip ${meta.color}`}>
                    {meta.icon} {meta.label}
                  </span>
                  <span className="text-xs text-slate-500">{meta.desc}</span>
                </div>
                <div className="space-y-2">
                  {g.items.map((s) => (
                    <div
                      key={s.id}
                      className="card flex items-center justify-between gap-4 p-4"
                    >
                      <div className="min-w-0">
                        <p className="mono text-sm text-white">
                          {msToClock(s.startMs)} → {msToClock(s.endMs)}{" "}
                          <span className="text-slate-500">
                            ({msToSec(s.startMs)}s–{msToSec(s.endMs)}s)
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          skips {msToSec(s.endMs - s.startMs)}s
                          {s.durationMs
                            ? ` · timed on a ${msToClock(s.durationMs)} stream`
                            : " · no stream duration"}
                          {s.status === "pending" && (
                            <span className="ml-2 text-warn">· pending</span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <VoteButton
                          dir="up"
                          active={s.yourVote === 1}
                          count={s.votesUp}
                          onClick={() => vote(s.id, 1)}
                        />
                        <VoteButton
                          dir="down"
                          active={s.yourVote === -1}
                          count={s.votesDown}
                          onClick={() => vote(s.id, -1)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SubmitForm
        imdbId={imdbId}
        season={season}
        episode={episode}
        defaultDurationMs={defaultDurationMs}
        isAuthed={isAuthed}
        busy={busy}
        setBusy={setBusy}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

function VoteButton({
  dir,
  active,
  count,
  onClick,
}: {
  dir: "up" | "down";
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const good = dir === "up";
  return (
    <button
      onClick={onClick}
      title={good ? "Good skip" : "Bad skip"}
      className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm transition
        ${
          active
            ? good
              ? "border-ok/50 bg-ok/15 text-ok"
              : "border-danger/50 bg-danger/15 text-rose-300"
            : "border-white/10 text-slate-400 hover:bg-white/5"
        }`}
    >
      <span aria-hidden>{good ? "▲" : "▼"}</span>
      {count}
    </button>
  );
}

function SubmitForm({
  imdbId,
  season,
  episode,
  defaultDurationMs,
  isAuthed,
  busy,
  setBusy,
  onDone,
}: {
  imdbId: string;
  season: number | null;
  episode: number | null;
  defaultDurationMs: number | null;
  isAuthed: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<SegmentTypeName>("intro");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [duration, setDuration] = useState(
    defaultDurationMs ? String(msToSec(defaultDurationMs)) : "",
  );
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!isAuthed) {
      window.location.href = "/auth/signin";
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imdb_id: imdbId,
          segment_type: type,
          season: season ?? undefined,
          episode: episode ?? undefined,
          start_sec: start,
          end_sec: end,
          duration_sec: duration || undefined,
          agree_terms: agree,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({
          ok: false,
          text:
            data.issues?.map((i: { message: string }) => i.message).join(", ") ??
            data.error ??
            "Submission failed",
        });
      } else {
        setMsg({ ok: true, text: data.message });
        setStart("");
        setEnd("");
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <h3 className="text-lg font-semibold text-white">Contribute a segment</h3>
      <p className="text-sm text-slate-400">
        Times accept seconds (<span className="mono">91</span>) or clock format (
        <span className="mono">1:31</span>). Add the stream duration so your
        timing can be matched against other versions.
      </p>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Type</span>
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as SegmentTypeName)}
          >
            {SEGMENT_ORDER.map((t) => (
              <option key={t} value={t}>
                {SEGMENT_META[t].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Start</span>
          <input
            className="input mono"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="1:01"
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">End</span>
          <input
            className="input mono"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="1:31"
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">
            Stream duration <span className="text-slate-600">(optional)</span>
          </span>
          <input
            className="input mono"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="47:00"
          />
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-1 h-4 w-4 accent-skip"
          required
        />
        <span>
          I agree that my contribution is published and may be freely used under{" "}
          <a
            href="/license"
            className="text-skip hover:underline"
            target="_blank"
          >
            CC BY-NC-SA 4.0
          </a>
          , per the{" "}
          <a href="/terms" className="text-skip hover:underline" target="_blank">
            submission terms
          </a>
          .
        </span>
      </label>

      {msg && (
        <p
          className={`rounded-xl px-4 py-2 text-sm ${
            msg.ok
              ? "bg-ok/10 text-ok"
              : "bg-danger/10 text-rose-300"
          }`}
        >
          {msg.text}
        </p>
      )}

      <button className="btn-primary" disabled={busy || !agree} type="submit">
        {busy ? "Submitting…" : isAuthed ? "Submit segment" : "Sign in to submit"}
      </button>
    </form>
  );
}
