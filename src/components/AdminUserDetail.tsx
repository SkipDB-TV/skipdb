"use client";

import { useState } from "react";
import Link from "next/link";
import { SegmentChip } from "./SegmentChip";
import { msToClock } from "@/lib/time";
import type { SegmentTypeName } from "@/lib/config";

export interface DetailUser {
  id: string;
  name: string | null;
  email: string | null;
  role: "user" | "moderator" | "admin";
  reputation: number;
  disabled: boolean;
  createdAt: string;
}

export interface DetailSubmission {
  id: number;
  imdbId: string;
  title: string | null;
  season: number | null;
  episode: number | null;
  segmentType: SegmentTypeName;
  startMs: number;
  endMs: number;
  status: "pending" | "approved" | "rejected" | "disabled";
  votesUp: number;
  votesDown: number;
  score: number;
  createdAt: string;
}

const STATUS_CLS: Record<DetailSubmission["status"], string> = {
  approved: "bg-ok/15 text-ok",
  pending: "bg-warn/15 text-amber-300",
  rejected: "bg-danger/15 text-rose-300",
  disabled: "bg-white/10 text-slate-400",
};

export function AdminUserDetail({
  user,
  submissions,
  submissionTotal,
  page,
  totalPages,
  isSelf,
}: {
  user: DetailUser;
  submissions: DetailSubmission[];
  submissionTotal: number;
  page: number;
  totalPages: number;
  isSelf: boolean;
}) {
  const [current, setCurrent] = useState(user);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const action = current.disabled ? "enable" : "disable";
    if (
      action === "disable" &&
      !confirm(
        `Disable ${current.name ?? current.email ?? current.id}? This revokes their API key and hides all ${submissionTotal} of their submissions. Reversible.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) setCurrent((prev) => ({ ...prev, disabled: action === "disable" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-white">
                {current.name ?? current.email ?? current.id}
              </h1>
              {current.role !== "user" && (
                <span className="chip bg-skip/15 text-skip-bright">{current.role}</span>
              )}
              {current.disabled && (
                <span className="chip bg-danger/15 text-rose-300">disabled</span>
              )}
            </div>
            <p className="mono text-xs text-slate-500">{current.id}</p>
            {current.email && <p className="text-sm text-slate-400">{current.email}</p>}
            <p className="text-xs text-slate-500">
              reputation {current.reputation} · joined{" "}
              {new Date(current.createdAt).toLocaleDateString()}
            </p>
          </div>
          {isSelf ? (
            <p className="text-xs text-slate-500">You can&apos;t disable your own account.</p>
          ) : (
            <button
              className={current.disabled ? "btn-primary" : "btn-danger"}
              disabled={busy}
              onClick={toggle}
            >
              {current.disabled ? "Enable user" : "Disable user"}
            </button>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white">
          Submissions ({submissionTotal})
        </h2>
        {submissions.length === 0 ? (
          <div className="card mt-3 p-10 text-center text-slate-400">
            No submissions yet.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {submissions.map((s) => (
              <div key={s.id} className="card p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SegmentChip type={s.segmentType} />
                      <Link
                        href={
                          s.season != null
                            ? `/title/${s.imdbId}/${s.season}/${s.episode}`
                            : `/title/${s.imdbId}`
                        }
                        className="text-sm font-medium text-white hover:underline"
                      >
                        {s.title ?? s.imdbId}
                        {s.season != null ? ` · S${s.season}E${s.episode}` : " · movie"}
                      </Link>
                      <span className={`chip ${STATUS_CLS[s.status]}`}>{s.status}</span>
                    </div>
                    <p className="mono text-sm text-slate-300">
                      {msToClock(s.startMs)} → {msToClock(s.endMs)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.votesUp} up · {s.votesDown} down · score {s.score} ·{" "}
                      {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <Link
              href={`/admin/users/${user.id}?page=${page - 1}`}
              aria-disabled={page <= 1}
              className={`btn-ghost text-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            >
              ← Previous
            </Link>
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </span>
            <Link
              href={`/admin/users/${user.id}?page=${page + 1}`}
              aria-disabled={page >= totalPages}
              className={`btn-ghost text-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
            >
              Next →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
