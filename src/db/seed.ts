import "dotenv/config";
import { db } from "./index";
import { titles, episodes, segments, users } from "./schema";
import { eq } from "drizzle-orm";

/**
 * Seeds a small, realistic dataset so the app is explorable immediately:
 * - Breaking Bad (series) with two episodes and intro/recap/outro segments,
 *   including TWO intro submissions for S1E1 against different stream durations
 *   to demonstrate duration-aware offset matching.
 * - A movie with an outro (credits) segment.
 */
async function main() {
  console.log("Seeding SkipDB…");

  // A seed contributor so submitted_by is populated.
  const seedEmail = "seed@skipdb.local";
  let seedUser = (
    await db.select().from(users).where(eq(users.email, seedEmail))
  )[0];
  if (!seedUser) {
    seedUser = (
      await db
        .insert(users)
        .values({
          name: "SkipDB Seed",
          email: seedEmail,
          role: "moderator",
          reputation: 100,
        })
        .returning()
    )[0];
  }

  // --- Series: Breaking Bad ---
  const [bb] = await db
    .insert(titles)
    .values({
      imdbId: "tt0903747",
      tmdbId: 1396,
      mediaType: "series",
      name: "Breaking Bad",
      year: 2008,
      overview:
        "A high school chemistry teacher turned methamphetamine producer.",
    })
    .onConflictDoUpdate({
      target: titles.imdbId,
      set: { name: "Breaking Bad" },
    })
    .returning();

  const ep1 = await upsertEpisode(bb.id, 1, 1, "Pilot", 2820000);
  const ep2 = await upsertEpisode(bb.id, 1, 2, "Cat's in the Bag...", 2880000);

  // S1E1: two intro submissions against different stream durations.
  await insertSegment({
    titleId: bb.id,
    imdbId: bb.imdbId,
    season: 1,
    episode: 1,
    segmentType: "intro",
    startMs: 61000,
    endMs: 91000,
    durationMs: 2820000, // 47:00 stream
    submittedBy: seedUser.id,
    status: "approved",
    votesUp: 12,
    votesDown: 1,
  });
  await insertSegment({
    titleId: bb.id,
    imdbId: bb.imdbId,
    season: 1,
    episode: 1,
    segmentType: "intro",
    startMs: 67000,
    endMs: 97000,
    durationMs: 2826000, // 6s longer stream → +6s offset
    submittedBy: seedUser.id,
    status: "approved",
    votesUp: 4,
    votesDown: 0,
  });
  await insertSegment({
    titleId: bb.id,
    imdbId: bb.imdbId,
    season: 1,
    episode: 1,
    segmentType: "outro",
    startMs: 2760000,
    endMs: 2820000,
    durationMs: 2820000,
    submittedBy: seedUser.id,
    status: "approved",
    votesUp: 6,
    votesDown: 0,
  });

  // S1E2: recap + intro, one pending for the review queue demo.
  await insertSegment({
    titleId: bb.id,
    imdbId: bb.imdbId,
    season: 1,
    episode: 2,
    segmentType: "recap",
    startMs: 0,
    endMs: 38000,
    durationMs: 2880000,
    submittedBy: seedUser.id,
    status: "approved",
    votesUp: 3,
    votesDown: 0,
  });
  await insertSegment({
    titleId: bb.id,
    imdbId: bb.imdbId,
    season: 1,
    episode: 2,
    segmentType: "intro",
    startMs: 40000,
    endMs: 70000,
    durationMs: 2880000,
    submittedBy: seedUser.id,
    status: "pending", // shows up in the admin review queue
    votesUp: 0,
    votesDown: 0,
  });

  // --- Movie: Spirited Away (outro/credits) ---
  const [movie] = await db
    .insert(titles)
    .values({
      imdbId: "tt0245429",
      tmdbId: 129,
      mediaType: "movie",
      name: "Spirited Away",
      year: 2001,
      overview:
        "A young girl wanders into a world of spirits and must find a way home.",
    })
    .onConflictDoUpdate({
      target: titles.imdbId,
      set: { name: "Spirited Away" },
    })
    .returning();

  await insertSegment({
    titleId: movie.id,
    imdbId: movie.imdbId,
    season: null,
    episode: null,
    segmentType: "outro",
    startMs: 7020000,
    endMs: 7440000,
    durationMs: 7440000,
    submittedBy: seedUser.id,
    status: "approved",
    votesUp: 9,
    votesDown: 0,
  });

  console.log("Seed complete.");
  process.exit(0);
}

async function upsertEpisode(
  titleId: number,
  season: number,
  episode: number,
  name: string,
  runtimeMs: number,
) {
  const existing = await db
    .select()
    .from(episodes)
    .where(eq(episodes.titleId, titleId));
  const found = existing.find(
    (e) => e.season === season && e.episode === episode,
  );
  if (found) return found;
  const [row] = await db
    .insert(episodes)
    .values({ titleId, season, episode, name, runtimeMs })
    .returning();
  return row;
}

async function insertSegment(values: typeof segments.$inferInsert) {
  const score = (values.votesUp ?? 0) - (values.votesDown ?? 0);
  await db.insert(segments).values({ ...values, score });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
