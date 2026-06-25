import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { segments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { activeKeyInfo } from "@/lib/api-key";
import { ApiKeyManager } from "@/components/ApiKeyManager";
import { SegmentChip } from "@/components/SegmentChip";
import { msToClock } from "@/lib/time";
import type { SegmentTypeName } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");
  const user = session.user;

  const keyInfo = await activeKeyInfo(user.id);
  const mine = await db
    .select()
    .from(segments)
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
            reputation{" "}
            <span className="text-skip">{user.reputation}</span>
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
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

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white">How it works</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>
              Submissions that match a show&apos;s established pattern, reach
              consensus, or come from trusted contributors go live instantly.
            </li>
            <li>
              Everything else enters the review queue for a moderator.
            </li>
            <li>
              Earn reputation when your segments are approved and upvoted — reach
              the trust threshold and your future submissions auto-approve.
            </li>
          </ul>
        </div>
      </div>

      <h2 className="mt-12 text-xl font-semibold text-white">
        Your submissions
      </h2>
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
              <div className="flex items-center gap-3">
                <SegmentChip type={s.segmentType as SegmentTypeName} />
                <span className="mono text-sm text-slate-300">
                  {s.imdbId}
                  {s.season != null
                    ? ` S${s.season}E${s.episode}`
                    : " (movie)"}
                </span>
                <span className="mono text-xs text-slate-500">
                  {msToClock(s.startMs)}–{msToClock(s.endMs)}
                </span>
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
