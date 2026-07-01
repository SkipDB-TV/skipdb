"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface UserListItem {
  id: string;
  name: string | null;
  email: string | null;
  role: "user" | "moderator" | "admin";
  reputation: number;
  disabled: boolean;
  createdAt: string;
  submissionCount: number;
  approvedCount: number;
}

export function AdminUsers({
  initial,
  page,
  totalPages,
  q,
}: {
  initial: UserListItem[];
  page: number;
  totalPages: number;
  q: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initial);
  const [search, setSearch] = useState(q);
  const [busy, setBusy] = useState<string | null>(null);

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(p));
    return `/admin/users?${params.toString()}`;
  }

  async function toggle(u: UserListItem) {
    const action = u.disabled ? "enable" : "disable";
    if (
      action === "disable" &&
      !confirm(
        `Disable ${u.name ?? u.email ?? u.id}? This revokes their API key and hides all ${u.submissionCount} of their submissions. Reversible.`,
      )
    )
      return;
    setBusy(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((p) => (p.id === u.id ? { ...p, disabled: action === "disable" } : p)),
        );
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const params = new URLSearchParams();
          if (search.trim()) params.set("q", search.trim());
          router.push(`/admin/users?${params.toString()}`);
        }}
        className="flex max-w-sm gap-2"
      >
        <input
          type="text"
          placeholder="Search by name, email, or id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-midnight-850 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-skip focus:outline-none"
        />
        <button className="btn-ghost shrink-0 text-sm" type="submit">
          Search
        </button>
      </form>

      {users.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">No users found.</div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.id} className="card p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-sm font-medium text-white hover:underline"
                    >
                      {u.name ?? u.email ?? u.id}
                    </Link>
                    {u.role !== "user" && (
                      <span className="chip bg-skip/15 text-skip-bright">{u.role}</span>
                    )}
                    {u.disabled && (
                      <span className="chip bg-danger/15 text-rose-300">disabled</span>
                    )}
                  </div>
                  <p className="mono text-xs text-slate-500">{u.id}</p>
                  <p className="text-xs text-slate-500">
                    {u.submissionCount} submission{u.submissionCount === 1 ? "" : "s"} ·{" "}
                    {u.approvedCount} approved · reputation {u.reputation} · joined{" "}
                    {new Date(u.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link href={`/admin/users/${u.id}`} className="btn-ghost text-sm">
                    View
                  </Link>
                  <button
                    className={u.disabled ? "btn-primary text-sm" : "btn-danger text-sm"}
                    disabled={busy === u.id}
                    onClick={() => toggle(u)}
                  >
                    {u.disabled ? "Enable" : "Disable"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Link
            href={pageHref(page - 1)}
            aria-disabled={page <= 1}
            className={`btn-ghost text-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            ← Previous
          </Link>
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </span>
          <Link
            href={pageHref(page + 1)}
            aria-disabled={page >= totalPages}
            className={`btn-ghost text-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
          >
            Next →
          </Link>
        </div>
      )}
    </div>
  );
}
