import { db } from "@/db";
import { segments, moderationLog } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { json, apiError, preflight, LICENSE_NOTICE } from "@/lib/api";
import { getBestByType } from "@/lib/segments";
import type { AdjustMode } from "@/lib/duration";
import { getIntroLengthEstimate } from "@/lib/estimate";
import { READ_ONLY, readOnlyError } from "@/lib/read-only";
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
  const durationRaw = url.searchParams.get("duration");
  const typeRaw = url.searchParams.get("type") ?? undefined;
  const adjustRaw = url.searchParams.get("adjust") ?? "conservative";

  if (typeRaw && !config.segmentTypes.includes(typeRaw as never))
    return apiError(
      `type must be one of: ${config.segmentTypes.join(", ")}`,
      400,
    );

  const ADJUST_MODES = ["conservative", "greedy", "none"] as const;
  if (!ADJUST_MODES.includes(adjustRaw as AdjustMode))
    return apiError(`adjust must be one of: ${ADJUST_MODES.join(", ")}`, 400);
  const adjust = adjustRaw as AdjustMode;

  let durationMs: number | null = null;
  if (durationRaw != null) {
    const v = Math.round(Number(durationRaw));
    if (Number.isNaN(v)) return apiError("duration must be a number in seconds", 400);
    durationMs = v * 1000;
  }

  const season = seasonRaw != null ? Number(seasonRaw) : null;
  const episode = episodeRaw != null ? Number(episodeRaw) : null;
  const types = typeRaw ? ([typeRaw] as (typeof config.segmentTypes)[number][]) : [...config.segmentTypes];

  const [segmentsByType, introLengthEstimateMs] = await Promise.all([
    getBestByType({ imdbId, season, episode, durationMs, adjust, types }),
    getIntroLengthEstimate(imdbId, season),
  ]);

  return json(
    {
      imdb_id: imdbId,
      season,
      episode,
      segments: segmentsByType,
      // Median intro length (end_ms - start_ms) derived from the season (or
      // series fallback). null when fewer than 2 samples exist or lengths are
      // inconsistent (< 80% within 15s of the median). Use as a fallback to
      // offer a manual "skip intro" button of roughly the right duration.
      intro_length_estimate_ms: introLengthEstimateMs,
    },
    {
      headers: {
        // Cache at Vercel's CDN keyed by full URL (imdb_id + season + episode +
        // duration_ms + adjust). Segment data only changes on approve/reject events
        // so 30s fresh + 5min stale is safe and removes the DB round-trip entirely
        // for popular episodes.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
      },
    },
  );
}

// --- Submit (auth: session or API key) ---
export async function POST(req: Request) {
  if (READ_ONLY) return readOnlyError();
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

  const episodeWhere = [
    eq(segments.imdbId, input.imdbId),
    input.season != null ? eq(segments.season, input.season) : isNull(segments.season),
    input.episode != null ? eq(segments.episode, input.episode) : isNull(segments.episode),
    eq(segments.segmentType, input.segmentType),
  ] as const;

  // If an identical approved segment exists, don't duplicate — ask for a vote.
  const [exactMatch] = await db
    .select({ id: segments.id })
    .from(segments)
    .where(
      and(
        ...episodeWhere,
        eq(segments.startMs, input.startMs),
        eq(segments.endMs, input.endMs),
        eq(segments.status, "approved"),
      ),
    )
    .limit(1);

  if (exactMatch) {
    return json(
      {
        id: exactMatch.id,
        status: "already_approved",
        message: "An identical approved segment already exists — please vote on it instead.",
        vote_url: `/api/segments/${exactMatch.id}/vote`,
        license: LICENSE_NOTICE,
      },
      { status: 409 },
    );
  }

  // If this user submitted for the same episode/type/duration within 24 hours, edit it.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recentOwn] = await db
    .select()
    .from(segments)
    .where(
      and(
        ...episodeWhere,
        input.durationMs != null
          ? eq(segments.durationMs, input.durationMs)
          : isNull(segments.durationMs),
        eq(segments.submittedBy, actor.user.id),
        gt(segments.createdAt, cutoff),
      ),
    )
    .limit(1);

  if (recentOwn) {
    const decision = await reviewSubmission(
      {
        titleId: recentOwn.titleId,
        season: recentOwn.season,
        episode: recentOwn.episode,
        segmentType: input.segmentType,
        startMs: input.startMs,
        endMs: input.endMs,
        durationMs: input.durationMs,
        excludeSegmentId: recentOwn.id,
      },
      { role: actor.user.role, reputation: actor.user.reputation },
    );

    await db
      .update(segments)
      .set({
        startMs: input.startMs,
        endMs: input.endMs,
        status: decision.status,
        autoApproved: decision.autoApproved,
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(segments.id, recentOwn.id));

    await db.insert(moderationLog).values({
      segmentId: recentOwn.id,
      moderatorId: null,
      action: "edit",
      reason: `auto-updated on resubmit within 24h; ${decision.reasons.join("; ")}`,
    });

    return json(
      {
        id: recentOwn.id,
        status: decision.status,
        auto_approved: decision.autoApproved,
        reasons: decision.reasons,
        updated: true,
        message:
          decision.status === "approved"
            ? "Your recent submission was updated."
            : "Your recent submission was updated and sent back to review.",
        license: LICENSE_NOTICE,
      },
      { status: 200, headers: rateLimitHeaders(rl) },
    );
  }

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
