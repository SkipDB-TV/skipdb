import type { MetadataRoute } from "next";
import { db } from "@/db";
import { titles } from "@/db/schema";
import { BASE_URL } from "@/lib/urls";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const allTitles = await db.select({ imdbId: titles.imdbId }).from(titles);
  return [
    { url: BASE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/docs`, changeFrequency: "monthly", priority: 0.7 },
    ...allTitles.map((t) => ({
      url: `${BASE_URL}/title/${t.imdbId}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
