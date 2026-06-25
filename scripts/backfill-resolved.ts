import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc } from "drizzle-orm";
import { segments, resolvedSegments } from "../src/db/schema";
import { computeConfidence, countAgreement } from "../src/lib/confidence";

/**
 * One-time/dev backfill: recompute the resolved (decided best) segment for every
 * (episode, type) group from the approved submissions. The app keeps these in
 * sync going forward on submit/approve/reject/vote.
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const approved = await db
    .select()
    .from(segments)
    .where(eq(segments.status, "approved"))
    .orderBy(desc(segments.score), desc(segments.votesUp), desc(segments.createdAt));

  // Group approved submissions by (episode, type); winner is the first (the
  // list is ordered best-first), confidence uses the whole group's agreement.
  const keyOf = (s: (typeof approved)[number]) =>
    `${s.imdbId}|${s.season}|${s.episode}|${s.segmentType}`;
  const groups = new Map<string, typeof approved>();
  for (const s of approved) {
    if (!groups.has(keyOf(s))) groups.set(keyOf(s), []);
    groups.get(keyOf(s))!.push(s);
  }

  await db.delete(resolvedSegments);

  let inserted = 0;
  for (const group of groups.values()) {
    const best = group[0];
    const confidence = computeConfidence({
      agreeCount: countAgreement(best, group),
      votesUp: best.votesUp,
      votesDown: best.votesDown,
    });
    await db.insert(resolvedSegments).values({
      imdbId: best.imdbId,
      titleId: best.titleId,
      season: best.season,
      episode: best.episode,
      segmentType: best.segmentType,
      segmentId: best.id,
      startMs: best.startMs,
      endMs: best.endMs,
      durationMs: best.durationMs,
      votesUp: best.votesUp,
      votesDown: best.votesDown,
      score: best.score,
      confidence,
    });
    inserted++;
  }
  console.log(`Backfilled ${inserted} resolved segments.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
