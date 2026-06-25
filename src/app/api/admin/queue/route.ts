import { db } from "@/db";
import { segments, titles, users } from "@/db/schema";
import { json, apiError } from "@/lib/api";
import { requireStaff } from "@/lib/admin";
import { eq, desc } from "drizzle-orm";
import { msToClock } from "@/lib/time";

export const runtime = "nodejs";

export async function GET() {
  const staff = await requireStaff();
  if (!staff) return apiError("Forbidden", 403);

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

  return json({
    count: rows.length,
    queue: rows.map((r) => ({
      id: r.segment.id,
      imdb_id: r.segment.imdbId,
      title: r.titleName,
      season: r.segment.season,
      episode: r.segment.episode,
      segment_type: r.segment.segmentType,
      start_ms: r.segment.startMs,
      end_ms: r.segment.endMs,
      start_clock: msToClock(r.segment.startMs),
      end_clock: msToClock(r.segment.endMs),
      duration_ms: r.segment.durationMs,
      submitted_by: r.submitter,
      submitted_at: r.segment.createdAt,
    })),
  });
}
