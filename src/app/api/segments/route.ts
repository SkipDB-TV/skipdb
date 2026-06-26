import { db } from "@/db";
import { segments, moderationLog } from "@/db/schema";
import { json, apiError, preflight, LICENSE_NOTICE } from "@/lib/api";
import { getBestByType } from "@/lib/segments";
import { recomputeResolved } from "@/lib/resolved";
import { submitSchema, validateSegmentBounds } from "@/lib/validation";
import { getActor } from "@/lib/actor";
import { reviewSubmission } from "@/lib/review";
import { ensureTitle } from "@/lib/titles";
import { rateLimit, rateLimitHeaders, clientIp } from "@/lib/rate-limit";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

// --- Read (open, rate-limited) ---
export async function GET(req: Request) {
  const rl = rateLimit(`read:${clientIp(req)}`, config.limits.readPerMinute);
  if (!rl.ok) return apiError("Rate limit exceeded", 429, { retry_after_s: 0 });

  const url = new URL(req.url);
  const imdbId = url.searchParams.get("imdb_id")?.toLowerCase();
  if (!imdbId || !/^tt\d{6,10}$/.test(imdbId))
    return apiError("imdb_id is required (e.g. tt0903747)", 400);

  const seasonRaw = url.searchParams.get("season");
  const episodeRaw = url.searchParams.get("episode");
  const durationRaw =
    url.searchParams.get("duration") ?? url.searchParams.get("duration_ms");
  const typeRaw = url.searchParams.get("type") ?? undefined;

  if (typeRaw && !config.segmentTypes.includes(typeRaw as never))
    return apiError(
      `type must be one of: ${config.segmentTypes.join(", ")}`,
      400,
    );

  // duration accepts ms (if "duration_ms" or large) — treat plain "duration" as ms.
  const durationMs =
    durationRaw != null ? Math.round(Number(durationRaw)) : null;
  if (durationRaw != null && (durationMs == null || Number.isNaN(durationMs)))
    return apiError("duration must be a number in milliseconds", 400);

  const segmentsByType = await getBestByType({
    imdbId,
    season: seasonRaw != null ? Number(seasonRaw) : null,
    episode: episodeRaw != null ? Number(episodeRaw) : null,
    durationMs,
    types: typeRaw ? [typeRaw as never] : undefined,
  });

  return json(
    {
      imdb_id: imdbId,
      season: seasonRaw != null ? Number(seasonRaw) : null,
      episode: episodeRaw != null ? Number(episodeRaw) : null,
      requested_duration_ms: durationMs,
      // Best result per type as top-level keys. Each value is the segment,
      // null (no data), or { excluded: "duration_mismatch" }.
      segments: segmentsByType,
    },
    { headers: rateLimitHeaders(rl) },
  );
}

// --- Submit (auth: session or API key) ---
export async function POST(req: Request) {
  const actor = await getActor(req);
  if (!actor)
    return apiError(
      "Authentication required. Sign in or provide an API key.",
      401,
    );

  const rl = rateLimit(`write:${actor.user.id}`, config.limits.writePerMinute);
  if (!rl.ok) return apiError("Rate limit exceeded", 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 422, {
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  const input = parsed.data;

  const boundsError = validateSegmentBounds({
    startMs: input.startMs,
    endMs: input.endMs,
    durationMs: input.durationMs,
    segmentType: input.segmentType,
  });
  if (boundsError) return apiError(boundsError, 422);

  // Resolve / create the title (also infers media type from IMDb lookup).
  const isMovie = input.season == null && input.episode == null;
  const title = await ensureTitle(input.imdbId, isMovie ? "movie" : "series");

  const decision = await reviewSubmission(
    {
      titleId: title.id,
      season: input.season,
      episode: input.episode,
      segmentType: input.segmentType,
      startMs: input.startMs,
      endMs: input.endMs,
      durationMs: input.durationMs,
    },
    { role: actor.user.role, reputation: actor.user.reputation },
  );

  const [created] = await db
    .insert(segments)
    .values({
      titleId: title.id,
      imdbId: input.imdbId,
      season: input.season,
      episode: input.episode,
      segmentType: input.segmentType,
      startMs: input.startMs,
      endMs: input.endMs,
      durationMs: input.durationMs,
      submittedBy: actor.user.id,
      status: decision.status,
      autoApproved: decision.autoApproved,
      source: actor.via === "api-key" ? "api" : "web",
    })
    .returning();

  if (decision.autoApproved) {
    await db.insert(moderationLog).values({
      segmentId: created.id,
      moderatorId: null,
      action: "auto-approve",
      reason: decision.reasons.join("; "),
    });
    // Refresh the decided/best segment for this episode + type.
    await recomputeResolved({
      imdbId: input.imdbId,
      titleId: title.id,
      season: input.season,
      episode: input.episode,
      segmentType: input.segmentType,
    });
  }

  return json(
    {
      id: created.id,
      status: created.status,
      auto_approved: created.autoApproved,
      reasons: decision.reasons,
      message:
        created.status === "approved"
          ? "Submission accepted and published."
          : "Submission received and queued for review.",
      license: LICENSE_NOTICE,
    },
    { status: 201, headers: rateLimitHeaders(rl) },
  );
}
