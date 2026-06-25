import { db } from "@/db";
import { titles, segments } from "@/db/schema";
import { sql, eq, desc } from "drizzle-orm";

export interface PopularTitle {
  imdbId: string;
  name: string;
  year: number | null;
  mediaType: "movie" | "series";
  posterUrl: string | null;
  approvedCount: number;
  votes: number;
}

/**
 * Most-covered titles for the browse page: ranked by number of approved
 * segments, then total community votes. Gives newcomers something to explore.
 */
export async function getPopularTitles(limit = 18): Promise<PopularTitle[]> {
  const rows = await db
    .select({
      imdbId: titles.imdbId,
      name: titles.name,
      year: titles.year,
      mediaType: titles.mediaType,
      posterUrl: titles.posterUrl,
      approvedCount: sql<number>`count(${segments.id}) filter (where ${segments.status} = 'approved')`,
      votes: sql<number>`coalesce(sum(${segments.votesUp} + ${segments.votesDown}), 0)`,
    })
    .from(titles)
    .leftJoin(segments, eq(segments.titleId, titles.id))
    .groupBy(
      titles.id,
      titles.imdbId,
      titles.name,
      titles.year,
      titles.mediaType,
      titles.posterUrl,
    )
    .orderBy(
      desc(
        sql`count(${segments.id}) filter (where ${segments.status} = 'approved')`,
      ),
      desc(sql`coalesce(sum(${segments.votesUp} + ${segments.votesDown}), 0)`),
    )
    .limit(limit);

  return rows
    .filter((r) => Number(r.approvedCount) > 0)
    .map((r) => ({
      imdbId: r.imdbId,
      name: r.name,
      year: r.year,
      mediaType: r.mediaType,
      posterUrl: r.posterUrl,
      approvedCount: Number(r.approvedCount),
      votes: Number(r.votes),
    }));
}
