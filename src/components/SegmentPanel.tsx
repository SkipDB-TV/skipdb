"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { msToClock, msToSec, parseTimeToMs } from "@/lib/time";
import { SEGMENT_META, SEGMENT_ORDER } from "@/lib/segment-types";
import { Tooltip } from "./Tooltip";
import type { SegmentTypeName } from "@/lib/config";
import { READ_ONLY } from "@/lib/read-only";

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
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Compact, locale-aware date for display (e.g. "12 Jun 2026"). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const DURATION_HELP =
  "Optional: the total length of the stream you timed this on. It lets SkipDB match your segment to viewers whose stream is a slightly different length (e.g. an extra logo at the start) by shifting the times to fit.";

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
  const [editingId, setEditingId] = useState<number | null>(null);

  // Re-sync local state when the server re-sends data (e.g. after
  // router.refresh()). React's "adjust state during render" pattern — not an
  // effect — so a fresh `initial` reference immediately replaces local edits.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setSegments(initial);
  }

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

  async function remove(id: number) {
    if (!confirm("Delete this submission? This cannot be undone.")) return;
    const res = await fetch(`/api/segments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSegments((prev) => prev.filter((s) => s.id !== id));
      router.refresh();
    }
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
                  {g.items.map((s) => {
                    const isAbsence = s.startMs === 0 && s.endMs === 0;
                    if (isAbsence) {
                      return (
                        <div
                          key={s.id}
                          className="card flex items-center justify-between gap-4 p-4"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-300">
                              No {s.segmentType}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Community marked: this episode has no {s.segmentType}
                              {s.status === "pending" && (
                                <span className="ml-2 text-warn">· pending</span>
                              )}
                              {s.mine && (
                                <span className="ml-2 text-signal-bright">
                                  · yours
                                </span>
                              )}
                            </p>
                          </div>
                          {!READ_ONLY && <div className="flex shrink-0 items-center gap-1">
                            {s.mine && (
                              <button
                                onClick={() => remove(s.id)}
                                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-rose-300 transition hover:bg-danger/10"
                              >
                                Delete
                              </button>
                            )}
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
                          </div>}
                        </div>
                      );
                    }
                    return editingId === s.id ? (
                      <div key={s.id} className="card p-4">
                        <SegmentForm
                          mode="edit"
                          initialType={s.segmentType}
                          initialStart={String(msToSec(s.startMs))}
                          initialEnd={String(msToSec(s.endMs))}
                          initialDuration={
                            s.durationMs != null
                              ? String(msToSec(s.durationMs))
                              : ""
                          }
                          defaultDurationMs={defaultDurationMs}
                          isAuthed={isAuthed}
                          onCancel={() => setEditingId(null)}
                          onSubmit={async (payload) => {
                            const res = await fetch(`/api/segments/${s.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(payload),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (res.ok) {
                              setEditingId(null);
                              router.refresh();
                            }
                            return { ok: res.ok, data };
                          }}
                        />
                      </div>
                    ) : (
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
                            {s.mine && (
                              <span className="ml-2 text-signal-bright">
                                · yours
                              </span>
                            )}
                          </p>
                          <p
                            className="mt-0.5 text-[11px] text-slate-600"
                            title={new Date(s.createdAt).toLocaleString()}
                          >
                            Submitted {formatDate(s.createdAt)}
                            {new Date(s.updatedAt).getTime() -
                              new Date(s.createdAt).getTime() >
                              1000 && (
                              <span title={new Date(s.updatedAt).toLocaleString()}>
                                {" "}
                                · edited {formatDate(s.updatedAt)}
                              </span>
                            )}
                          </p>
                        </div>
                        {!READ_ONLY && <div className="flex shrink-0 items-center gap-1">
                          {s.mine && (
                            <>
                              <button
                                onClick={() => setEditingId(s.id)}
                                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => remove(s.id)}
                                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-rose-300 transition hover:bg-danger/10"
                              >
                                Delete
                              </button>
                            </>
                          )}
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
                        </div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New submission */}
      {!READ_ONLY && <div className="card p-6">
        <h3 className="text-lg font-semibold text-white">
          Contribute a segment
        </h3>
        <p className="mb-4 mt-1 text-sm text-slate-400">
          Times accept seconds (<span className="mono">91</span>) or clock format
          (<span className="mono">1:31</span>).
        </p>
        <SegmentForm
          mode="create"
          initialType="intro"
          initialStart=""
          initialEnd=""
          initialDuration=""
          defaultDurationMs={defaultDurationMs}
          isAuthed={isAuthed}
          onSubmit={async (payload) => {
            const res = await fetch("/api/segments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                imdb_id: imdbId,
                season: season ?? undefined,
                episode: episode ?? undefined,
                ...payload,
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) router.refresh();
            return { ok: res.ok, data };
          }}
        />
      </div>}
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

/** Faded "other format" hint for a time input (seconds <-> mm:ss). */
function TimeHint({ value }: { value: string }) {
  const v = value.trim();
  if (!v) return null;
  const ms = parseTimeToMs(v);
  if (ms == null) return null;
  const alt = v.includes(":") ? `${msToSec(ms)}s` : msToClock(ms);
  return <span className="mono text-[11px] text-slate-600">= {alt}</span>;
}

interface FormPayload {
  segment_type: SegmentTypeName;
  start_sec: string;
  end_sec: string;
  duration_sec?: string;
  clear_duration?: boolean;
}

function SegmentForm({
  mode,
  initialType,
  initialStart,
  initialEnd,
  initialDuration,
  defaultDurationMs,
  isAuthed,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initialType: SegmentTypeName;
  initialStart: string;
  initialEnd: string;
  initialDuration: string;
  defaultDurationMs: number | null;
  isAuthed: boolean;
  onSubmit: (
    payload: FormPayload,
  ) => Promise<{ ok: boolean; data: { message?: string; error?: string; issues?: string[] } }>;
  onCancel?: () => void;
}) {
  const [type, setType] = useState<SegmentTypeName>(initialType);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [duration, setDuration] = useState(initialDuration);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setMsg(null);
    if (!isAuthed) {
      window.location.href = "/auth/signin";
      return;
    }
    setBusy(true);
    try {
      const payload: FormPayload = {
        segment_type: type,
        start_sec: start,
        end_sec: end,
      };
      if (mode === "edit" && duration.trim() === "") payload.clear_duration = true;
      else if (duration.trim() !== "") payload.duration_sec = duration;

      const { ok, data } = await onSubmit(payload);
      if (!ok) {
        setMsg({
          ok: false,
          text: Array.isArray(data.issues)
            ? data.issues.join(", ")
            : (data.error ?? "Something went wrong"),
        });
      } else {
        setMsg({ ok: true, text: data.message ?? "Saved." });
        if (mode === "create") {
          setStart("");
          setEnd("");
          setDuration("");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Type</span>
          <select
            className="input disabled:cursor-not-allowed disabled:opacity-60"
            value={type}
            disabled={mode === "edit"}
            title={
              mode === "edit"
                ? "Type can't be changed — delete and resubmit to change it"
                : undefined
            }
            onChange={(e) => setType(e.target.value as SegmentTypeName)}
          >
            {SEGMENT_ORDER.map((t) => (
              <option key={t} value={t}>
                {SEGMENT_META[t].label}
              </option>
            ))}
          </select>
          {mode === "edit" && (
            <span className="mt-1 block text-[11px] text-slate-500">
              Can&apos;t change — delete &amp; resubmit
            </span>
          )}
        </label>
        <label className="text-sm">
          <span className="mb-1 flex items-center justify-between text-slate-400">
            Start <TimeHint value={start} />
          </span>
          <input
            className="input mono"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="1:01"
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 flex items-center justify-between text-slate-400">
            End <TimeHint value={end} />
          </span>
          <input
            className="input mono"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="1:31"
            required
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1">
              Stream duration <Tooltip text={DURATION_HELP} />
            </span>
            <TimeHint value={duration} />
          </span>
          <input
            className="input mono"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder={
              defaultDurationMs ? `e.g. ${msToClock(defaultDurationMs)}` : "47:00"
            }
          />
        </label>
      </div>

      {msg && (
        <p
          className={`rounded-xl px-4 py-2 text-sm ${
            msg.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-rose-300"
          }`}
        >
          {msg.text}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy} type="submit">
          {busy
            ? "Saving…"
            : mode === "edit"
              ? "Save changes"
              : isAuthed
                ? "Submit segment"
                : "Sign in to submit"}
        </button>
        {mode === "edit" && onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        {mode === "create" && type !== "outro" && (
          <button
            type="button"
            disabled={busy}
            className="btn-ghost text-sm text-slate-500"
            onClick={async () => {
              if (!isAuthed) {
                window.location.href = "/auth/signin";
                return;
              }
              setBusy(true);
              try {
                const { ok, data } = await onSubmit({
                  segment_type: type,
                  start_sec: "0",
                  end_sec: "0",
                });
                if (!ok) {
                  setMsg({
                    ok: false,
                    text: data.error ?? "Something went wrong",
                  });
                } else {
                  setMsg({ ok: true, text: `Marked as no ${type}.` });
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            No {type}
          </button>
        )}
        {mode === "create" && (
          <p className="text-xs text-slate-500">
            By submitting you agree it&apos;s published under{" "}
            <a href="/license" target="_blank" className="text-skip hover:underline">
              ODbL 1.0
            </a>{" "}
            (
            <a href="/terms" target="_blank" className="text-skip hover:underline">
              terms
            </a>
            ).
          </p>
        )}
      </div>
    </form>
  );
}
