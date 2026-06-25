import { json, apiError, preflight, LICENSE_NOTICE } from "@/lib/api";
import { getTitleOverview } from "@/lib/coverage";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ imdbId: string }> },
) {
  // First-time loads fetch metadata from TMDB, so use the tighter limit.
  const rl = rateLimit(`title:${clientIp(req)}`, config.limits.metadataPerMinute);
  if (!rl.ok) return apiError("Rate limit exceeded", 429);

  const { imdbId } = await params;
  const id = imdbId.toLowerCase();
  if (!/^tt\d{6,10}$/.test(id)) return apiError("Invalid IMDb id", 400);

  const overview = await getTitleOverview(id);
  return json({
    imdb_id: overview.title.imdbId,
    name: overview.title.name,
    year: overview.title.year,
    media_type: overview.title.mediaType,
    poster_url: overview.title.posterUrl,
    overview: overview.title.overview,
    seasons: overview.seasons,
    totals: overview.totals,
    episodes: overview.episodes,
    license: LICENSE_NOTICE,
  });
}
