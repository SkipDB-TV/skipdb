import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin";
import { db } from "@/db";
import { segments, titles, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { AdminQueue } from "@/components/AdminQueue";
import type { SegmentTypeName } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const staff = await requireStaff();
  if (!staff) redirect("/");

  const rows = await db
    .select({
      segment: segments,
      titleName: titles.name,
      submitter: users.name,
    })
    .from(segments)
    .leftJoin(titles, eq(segments.titleId, titles.id))
    .leftJoin(users, eq(segments.submittedBy, users.id))
    .where(eq(segments.status, "pending"))
    .orderBy(desc(segments.createdAt))
    .limit(200);

  const items = rows.map((r) => ({
    id: r.segment.id,
    imdbId: r.segment.imdbId,
    title: r.titleName,
    season: r.segment.season,
    episode: r.segment.episode,
    segmentType: r.segment.segmentType as SegmentTypeName,
    startMs: r.segment.startMs,
    endMs: r.segment.endMs,
    durationMs: r.segment.durationMs,
    submittedBy: r.submitter,
    createdAt: r.segment.createdAt.toISOString(),
  }));

  return (
    <div className="container-page py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Review queue</h1>
        <span className="chip bg-warn/15 text-amber-300">
          {items.length} pending
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Approve good submissions or reject bad ones. Approvals award the
        contributor reputation; the audit trail is recorded.
      </p>
      <div className="mt-8">
        <AdminQueue initial={items} />
      </div>
    </div>
  );
}
