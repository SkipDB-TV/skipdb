import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin";
import {
  getModeratorSummary,
  getStaffActivity,
  type ActivityEntry,
} from "@/lib/activity";
import { SegmentChip } from "@/components/SegmentChip";
import { msToClock } from "@/lib/time";
import type { SegmentTypeName } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff activity" };

const ACTION_META: Record<string, { label: string; cls: string }> = {
  approve: { label: "approved", cls: "bg-ok/15 text-ok" },
  reject: { label: "rejected", cls: "bg-danger/15 text-rose-300" },
  edit: { label: "edited", cls: "bg-skip/15 text-skip-bright" },
  "auto-approve": { label: "auto-approved", cls: "bg-ok/15 text-ok" },
  disable: { label: "disabled user", cls: "bg-danger/15 text-rose-300" },
  enable: { label: "enabled user", cls: "bg-signal/15 text-signal-bright" },
};

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ moderator?: string }>;
}) {
  // Admin-only: moderators shouldn't be auditing each other.
  const staff = await requireStaff();
  if (!staff) redirect("/");
  if (staff.role !== "admin") redirect("/admin");

  const { moderator } = await searchParams;
  const [summary, entries] = await Promise.all([
    getModeratorSummary(30),
    getStaffActivity({ moderatorId: moderator }),
  ]);
  const selected = summary.find((s) => s.moderatorId === moderator);

  return (
    <div className="container-page py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Staff activity</h1>
          <p className="mt-1 text-sm text-slate-400">
            What admins and moderators have approved, rejected, edited,
            disabled and re-enabled. Automatic approvals and role changes
            aren&apos;t recorded.
          </p>
        </div>
        <Link href="/admin" className="btn-ghost text-sm">
          Review queue
        </Link>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-white">Last 30 days</h2>
      {summary.length === 0 ? (
        <div className="card mt-3 p-6 text-center text-slate-400">
          No staff actions in the last 30 days.
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map((s) => (
            <Link
              key={s.moderatorId}
              href={
                moderator === s.moderatorId
                  ? "/admin/activity"
                  : `/admin/activity?moderator=${encodeURIComponent(s.moderatorId)}`
              }
              className={`card block p-4 hover:border-white/20 ${
                moderator === s.moderatorId ? "ring-1 ring-signal" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-white">
                  {s.name ?? s.moderatorId}
                </span>
                <span className="chip bg-skip/15 text-skip-bright">{s.role}</span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                {s.approved} approved · {s.rejected} rejected · {s.edited} edited
              </p>
              <p className="text-xs text-slate-500">
                last active {s.lastActiveAt.toLocaleString()}
              </p>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          {selected ? `Recent actions by ${selected.name ?? "this user"}` : "Recent actions"}
        </h2>
        {moderator && (
          <Link href="/admin/activity" className="text-sm text-slate-400 hover:text-white">
            Show everyone
          </Link>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="card mt-3 p-6 text-center text-slate-400">
          Nothing recorded yet.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {entries.map((e) => (
            <ActivityRow key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ entry: e }: { entry: ActivityEntry }) {
  const meta = ACTION_META[e.action] ?? {
    label: e.action,
    cls: "bg-white/10 text-slate-400",
  };

  return (
    <div className="card flex flex-col gap-1 p-4 text-sm sm:flex-row sm:items-center sm:gap-3">
      <span className="shrink-0 text-xs text-slate-500 sm:w-40">
        {e.createdAt.toLocaleString()}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          {e.moderatorId ? (
            <Link
              href={`/admin/users/${e.moderatorId}`}
              className="font-medium text-white hover:underline"
            >
              {e.moderatorName ?? e.moderatorId}
            </Link>
          ) : (
            <span className="text-slate-400">deleted user</span>
          )}
          <span className={`chip ${meta.cls}`}>{meta.label}</span>
          {e.segment ? (
            <>
              <SegmentChip type={e.segment.segmentType as SegmentTypeName} />
              <Link
                href={
                  e.segment.season != null
                    ? `/title/${e.segment.imdbId}/${e.segment.season}/${e.segment.episode}`
                    : `/title/${e.segment.imdbId}`
                }
                className="text-slate-300 hover:underline"
              >
                {e.segment.title ?? e.segment.imdbId}
                {e.segment.season != null
                  ? ` · S${e.segment.season}E${e.segment.episode}`
                  : " · movie"}
              </Link>
              <span className="mono text-xs text-slate-500">
                {msToClock(e.segment.startMs)} → {msToClock(e.segment.endMs)}
              </span>
            </>
          ) : e.targetUserId ? (
            <>
              <Link
                href={`/admin/users/${e.targetUserId}`}
                className="text-slate-300 hover:underline"
              >
                {e.targetUserName ?? e.targetUserId}
              </Link>
              <span className="text-xs text-slate-500">
                ({e.count} submission{e.count === 1 ? "" : "s"})
              </span>
            </>
          ) : (
            <span className="text-slate-500">(deleted)</span>
          )}
        </span>
        {e.reason && <span className="block text-xs text-slate-500">{e.reason}</span>}
      </span>
    </div>
  );
}
