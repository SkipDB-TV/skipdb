import type { MetadataRoute } from "next";
import { db } from "@/db";
import { titles } from "@/db/schema";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const allTitles = await db.select({ imdbId: titles.imdbId }).from(titles);
  return [
    { url: "https://skipdb.tv", changeFrequency: "daily", priority: 1 },
    { url: "https://skipdb.tv/docs", changeFrequency: "monthly", priority: 0.7 },
    ...allTitles.map((t) => ({
      url: `https://skipdb.tv/title/${t.imdbId}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
