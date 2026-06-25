import { redirect, notFound } from "next/navigation";
import { getExternalImdbId } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

/** Resolves a TMDB search result to its IMDb id and redirects to the title page. */
export default async function ResolveTmdbPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  const mediaType = type === "movie" ? "movie" : "series";
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId)) notFound();

  const imdbId = await getExternalImdbId(tmdbId, mediaType);
  if (!imdbId) notFound();
  redirect(`/title/${imdbId}`);
}
