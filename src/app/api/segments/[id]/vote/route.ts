import { db } from "@/db";
import { segments, votes, users } from "@/db/schema";
import { json, apiError, preflight } from "@/lib/api";
import { getActor } from "@/lib/actor";
import { voteSchema } from "@/lib/validation";
import { recomputeResolved } from "@/lib/resolved";
import { and, eq, sql } from "drizzle-orm";
import type { SegmentTypeName } from "@/lib/config";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor(req);
  if (!actor) return apiError("Authentication required.", 401);

  const { id } = await params;
  const segmentId = Number(id);
  if (!Number.isInteger(segmentId)) return apiError("Invalid segment id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) return apiError("value must be 1, -1, or 0", 422);
  const value = parsed.data.value;

  const segment = (
    await db.select().from(segments).where(eq(segments.id, segmentId))
  )[0];
  if (!segment) return apiError("Segment not found", 404);

  const userId = actor.user.id;
  const existing = (
    await db
      .select()
      .from(votes)
      .where(and(eq(votes.segmentId, segmentId), eq(votes.userId, userId)))
  )[0];

  if (value === 0) {
    if (existing) await db.delete(votes).where(eq(votes.id, existing.id));
  } else if (existing) {
    await db.update(votes).set({ value }).where(eq(votes.id, existing.id));
  } else {
    await db.insert(votes).values({ segmentId, userId, value });
  }

  // Recompute aggregates from the source of truth.
  const [agg] = await db
    .select({
      up: sql<number>`coalesce(sum(case when ${votes.value} = 1 then 1 else 0 end), 0)`,
      down: sql<number>`coalesce(sum(case when ${votes.value} = -1 then 1 else 0 end), 0)`,
    })
    .from(votes)
    .where(eq(votes.segmentId, segmentId));

  const up = Number(agg.up);
  const down = Number(agg.down);
  await db
    .update(segments)
    .set({ votesUp: up, votesDown: down, score: up - down })
    .where(eq(segments.id, segmentId));

  // Recompute the contributor's reputation as the total score across all of
  // their segments, so support accumulates over their whole contribution history.
  if (segment.submittedBy) {
    const [rep] = await db
      .select({
        total: sql<number>`coalesce(sum(${segments.score}), 0)`,
      })
      .from(segments)
      .where(eq(segments.submittedBy, segment.submittedBy));
    await db
      .update(users)
      .set({ reputation: Number(rep.total) })
      .where(eq(users.id, segment.submittedBy));
  }

  // Votes can change which segment wins, so refresh the resolved best.
  if (segment.status === "approved") {
    await recomputeResolved({
      imdbId: segment.imdbId,
      titleId: segment.titleId,
      season: segment.season,
      episode: segment.episode,
      segmentType: segment.segmentType as SegmentTypeName,
    });
  }

  return json({
    segment_id: segmentId,
    your_vote: value,
    votes: { up, down, score: up - down },
  });
}
