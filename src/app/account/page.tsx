import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { segments, titles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { activeKeyInfo } from "@/lib/api-key";
import { usesSocialLogin } from "@/lib/account";
import { ApiKeyManager } from "@/components/ApiKeyManager";
import { ProfileEditor } from "@/components/ProfileEditor";
import { SegmentChip } from "@/components/SegmentChip";
import { msToClock } from "@/lib/time";
import { SEGMENT_META, SEGMENT_ORDER } from "@/lib/segment-types";
import type { SegmentTypeName } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");
  const user = session.user;

  const keyInfo = await activeKeyInfo(user.id);
  const social = await usesSocialLogin(user.id);

  // Full history for stats (lightweight columns only)
  const all = await db
    .select({
      status: segments.status,
      segmentType: segments.segmentType,
      votesUp: segments.votesUp,
    })
    .from(segments)
    .where(eq(segments.submittedBy, user.id));

  const total = all.length;
  const approved = all.filter((s) => s.status === "approved").length;
  const pending = all.filter((s) => s.status === "pending").length;
  const rejected = all.filter((s) => s.status === "rejected").length;
  const totalVotes = all.reduce((n, s) => n + s.votesUp, 0);

  const byType = Object.fromEntries(
    SEGMENT_ORDER.map((t) => [
      t,
      all.filter((s) => s.segmentType === t).length,
    ]),
  ) as Record<SegmentTypeName, number>;

  // Recent 50 for the submissions list
  const mine = await db
    .select({
      id: segments.id,
      imdbId: segments.imdbId,
      season: segments.season,
      episode: segments.episode,
      segmentType: segments.segmentType,
      startMs: segments.startMs,
      endMs: segments.endMs,
      status: segments.status,
      titleName: titles.name,
    })
    .from(segments)
    .leftJoin(titles, eq(titles.imdbId, segments.imdbId))
    .where(eq(segments.submittedBy, user.id))
    .orderBy(desc(segments.createdAt))
    .limit(50);

  return (
    <div className="container-page py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">
            {user.name ?? "Your account"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {user.email} ·{" "}
            <span className="capitalize text-slate-300">{user.role}</span> ·
            reputation <span className="text-skip">{user.reputation}</span>
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <ProfileEditor
          initialName={user.name ?? ""}
          initialEmail={user.email ?? ""}
          social={social}
        />

        <ApiKeyManager
          initial={
            keyInfo
              ? {
                  keyPrefix: keyInfo.keyPrefix,
                  createdAt: keyInfo.createdAt.toISOString(),
                  lastUsedAt: keyInfo.lastUsedAt
                    ? keyInfo.lastUsedAt.toISOString()
                    : null,
                }
              : null
          }
        />
      </div>

      <div className="card mt-6 p-6">
        <h2 className="text-lg font-semibold text-white">How it works</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-400">
          <li>
            Submissions that match a show&apos;s established pattern, reach
            consensus, or come from trusted contributors go live instantly.
          </li>
          <li>Everything else enters the review queue for a moderator.</li>
          <li>
            Earn reputation when your segments are approved and upvoted — reach
            the trust threshold and your future submissions auto-approve.
          </li>
        </ul>
      </div>

      <h2 className="mt-12 text-xl font-semibold text-white">
        Your submissions
      </h2>

      {total > 0 && (
        <div className="mt-4 card p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(
              [
                { label: "Total", value: total, cls: "text-white" },
                { label: "Approved", value: approved, cls: "text-ok" },
                { label: "Pending", value: pending, cls: "text-amber-300" },
                {
                  label: "Upvotes received",
                  value: totalVotes,
                  cls: "text-skip",
                },
              ] as const
            ).map(({ label, value, cls }) => (
              <div key={label}>
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${cls}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-black/8 pt-4 flex flex-wrap gap-2 dark:border-white/5">
            {SEGMENT_ORDER.map((t) => {
              const meta = SEGMENT_META[t];
              const count = byType[t];
              if (!count) return null;
              return (
                <span key={t} className={`chip ${meta.color}`}>
                  {meta.icon} {meta.label}{" "}
                  <span className="opacity-60">{count}</span>
                </span>
              );
            })}
            {rejected > 0 && (
              <span className="chip bg-danger/10 text-rose-400">
                {rejected} rejected
              </span>
            )}
          </div>
        </div>
      )}

      {mine.length === 0 ? (
        <p className="mt-3 text-slate-400">
          You haven&apos;t submitted anything yet.{" "}
          <Link href="/search" className="text-skip hover:underline">
            Find a title to contribute.
          </Link>
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {mine.map((s) => (
            <Link
              key={s.id}
              href={
                s.season != null
                  ? `/title/${s.imdbId}/${s.season}/${s.episode}`
                  : `/title/${s.imdbId}`
              }
              className="card flex items-center justify-between gap-4 p-4 transition hover:shadow-glow"
            >
              <div className="flex min-w-0 items-center gap-3">
                <SegmentChip type={s.segmentType as SegmentTypeName} />
                <div className="min-w-0">
                  <span className="truncate text-sm text-slate-200">
                    {s.titleName ?? s.imdbId}
                    {s.season != null
                      ? ` S${s.season}E${s.episode}`
                      : ""}
                  </span>
                  <span className="mono ml-2 text-xs text-slate-500">
                    {msToClock(s.startMs)}–{msToClock(s.endMs)}
                  </span>
                </div>
              </div>
              <StatusBadge status={s.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-ok/15 text-ok",
    pending: "bg-warn/15 text-amber-300",
    rejected: "bg-danger/15 text-rose-300",
  };
  return (
    <span className={`chip ${map[status] ?? "bg-white/10 text-slate-300"}`}>
      {status}
    </span>
  );
}
