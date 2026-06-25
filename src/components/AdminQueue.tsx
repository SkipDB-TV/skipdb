"use client";

import { useState } from "react";
import Link from "next/link";
import { SegmentChip } from "./SegmentChip";
import { msToClock, msToSec } from "@/lib/time";
import type { SegmentTypeName } from "@/lib/config";

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
        <div
          key={i.id}
          className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
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
                {i.season != null ? ` · S${i.season}E${i.episode}` : " · movie"}
              </Link>
            </div>
            <p className="mono text-sm text-slate-300">
              {msToClock(i.startMs)} → {msToClock(i.endMs)}{" "}
              <span className="text-slate-500">
                ({msToSec(i.startMs)}s–{msToSec(i.endMs)}s, skips{" "}
                {msToSec(i.endMs - i.startMs)}s)
              </span>
            </p>
            <p className="text-xs text-slate-500">
              {i.durationMs
                ? `stream ${msToClock(i.durationMs)} · `
                : "no stream duration · "}
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
      ))}
    </div>
  );
}
