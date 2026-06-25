"use client";

import { useState } from "react";
import Link from "next/link";
import { SegmentChip } from "./SegmentChip";
import { msToClock, msToSec } from "@/lib/time";
import type { SegmentTypeName } from "@/lib/config";
import type { ReviewContext } from "@/lib/review-context";

export interface QueueItem {
  id: number;
  imdbId: string;
  title: string | null;
  season: number | null;
  episode: number | null;
  segmentType: SegmentTypeName;
  startMs: number;
  endMs: number;
  durationMs: number | null;
  submittedBy: string | null;
  createdAt: string;
  context: ReviewContext | null;
}

/** ms delta -> signed seconds string, e.g. +2.3s / −1.0s. */
function delta(ms: number): string {
  const s = ms / 1000;
  const sign = s > 0 ? "+" : s < 0 ? "−" : "±";
  return `${sign}${Math.abs(s).toFixed(1)}s`;
}

export function AdminQueue({ initial }: { initial: QueueItem[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);

  async function act(id: number, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      reason = prompt("Reason for rejection (optional):") ?? undefined;
    }
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/segments/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="card p-10 text-center text-slate-400">
        🎉 The review queue is empty.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.id} className="card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <SegmentChip type={i.segmentType} />
                <Link
                  href={
                    i.season != null
                      ? `/title/${i.imdbId}/${i.season}/${i.episode}`
                      : `/title/${i.imdbId}`
                  }
                  className="text-sm font-medium text-white hover:underline"
                >
                  {i.title ?? i.imdbId}
                  {i.season != null
                    ? ` · S${i.season}E${i.episode}`
                    : " · movie"}
                </Link>
              </div>
              <p className="mono text-sm text-slate-300">
                {msToClock(i.startMs)} → {msToClock(i.endMs)}{" "}
                <span className="text-slate-500">
                  (skips {msToSec(i.endMs - i.startMs)}s)
                </span>
              </p>
              <p className="text-xs text-slate-500">
                by {i.submittedBy ?? "unknown"} ·{" "}
                {new Date(i.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                className="btn-primary"
                disabled={busy === i.id}
                onClick={() => act(i.id, "approve")}
              >
                Approve
              </button>
              <button
                className="btn-danger"
                disabled={busy === i.id}
                onClick={() => act(i.id, "reject")}
              >
                Reject
              </button>
            </div>
          </div>

          {i.context && <ContextPanel item={i} ctx={i.context} />}
        </div>
      ))}
    </div>
  );
}

function ContextPanel({ item, ctx }: { item: QueueItem; ctx: ReviewContext }) {
  const approvalRate =
    ctx.submitter.submissions > 0
      ? Math.round((ctx.submitter.approved / ctx.submitter.submissions) * 100)
      : 0;

  const durationBadge = {
    "none-provided": { label: "no duration given", cls: "bg-white/10 text-slate-400" },
    first: { label: "first with a duration", cls: "bg-signal/15 text-signal-bright" },
    matches: { label: "duration matches others", cls: "bg-ok/15 text-ok" },
    close: { label: "duration close (offset)", cls: "bg-skip/15 text-skip-bright" },
    differs: { label: "duration differs", cls: "bg-warn/15 text-amber-300" },
  }[ctx.durationCompare];

  const typical = ctx.typicalSeasonLengthMs ?? ctx.typicalSeriesLengthMs;

  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-white/5 bg-midnight-850/60 p-4 text-xs sm:grid-cols-3">
      {/* Submitter */}
      <div>
        <p className="mb-1 font-semibold uppercase tracking-wide text-slate-500">
          Submitter
        </p>
        <p className="text-slate-300">
          {ctx.submitter.submissions} submission
          {ctx.submitter.submissions === 1 ? "" : "s"} ·{" "}
          {ctx.submitter.approved} approved
        </p>
        <p className="text-slate-500">{approvalRate}% approval rate</p>
      </div>

      {/* Existing for this episode */}
      <div>
        <p className="mb-1 font-semibold uppercase tracking-wide text-slate-500">
          This episode ({item.segmentType})
        </p>
        {ctx.episode.existing ? (
          <>
            <p className="text-slate-300">
              {ctx.episode.approvedCount} approved already
            </p>
            <p className="text-slate-500">
              best: {msToClock(ctx.episode.existing.startMs)}→
              {msToClock(ctx.episode.existing.endMs)} (
              {msToSec(ctx.episode.existing.lengthMs)}s)
            </p>
            <p className="text-slate-500">
              vs this: start {delta(ctx.episode.startDeltaMs ?? 0)}, length{" "}
              {delta(ctx.episode.lengthDeltaMs ?? 0)}
            </p>
          </>
        ) : (
          <p className="text-signal-bright">
            No approved {item.segmentType} yet — this would be the first.
          </p>
        )}
      </div>

      {/* Series/season norm + duration */}
      <div>
        <p className="mb-1 font-semibold uppercase tracking-wide text-slate-500">
          Usual length &amp; duration
        </p>
        {typical != null ? (
          <p className="text-slate-300">
            typical {item.segmentType}: {msToSec(typical)}s
            {ctx.lengthVsTypicalMs != null && (
              <span
                className={
                  Math.abs(ctx.lengthVsTypicalMs) <= 8000
                    ? " text-ok"
                    : " text-amber-300"
                }
              >
                {" "}
                (this {delta(ctx.lengthVsTypicalMs)})
              </span>
            )}
          </p>
        ) : (
          <p className="text-slate-500">
            no series history yet ({ctx.seriesSamples} samples)
          </p>
        )}
        <span className={`chip mt-1 ${durationBadge.cls}`}>
          {durationBadge.label}
        </span>
      </div>
    </div>
  );
}
