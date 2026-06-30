/**
 * POST /api/admin/import
 *
 * Staff-only bulk import with full per-episode, per-segment control.
 * Accepts a JSON array where each item is one episode (or movie) with its
 * own segment list. Times accept milliseconds (numbers) or clock/seconds
 * strings (e.g. "1:02", "62", 62000).
 *
 * Example body:
 * [
 *   {
 *     "imdb_id": "tt0903747",
 *     "season": 1,
 *     "episode": 1,
 *     "duration": "47:00",
 *     "segments": [
 *       { "type": "intro", "start": "1:02", "end": "1:32" },
 *       { "type": "outro", "start": "44:20" }
 *     ]
 *   },
 *   {
 *     "imdb_id": "tt0903747",
 *     "season": 1,
 *     "episode": 2,
 *     "duration_ms": 2880000,
 *     "segments": [
 *       { "type": "recap", "start": 0, "end": 38 },
 *       { "type": "intro", "start": 40, "end": 70 }
 *     ]
 *   }
 * ]
 *
 * Response:
 * {
 *   "submitted": 3,
 *   "failed": 1,
 *   "results": [
 *     {
 *       "imdb_id": "tt0903747", "season": 1, "episode": 1,
 *       "segments": [
 *         { "type": "intro", "id": 42, "start_ms": 62000, "end_ms": 92000, "status": "approved" },
 *         { "type": "outro", "error": "outro submissions without an end time require duration_ms..." }
 *       ]
 *     }
 *   ]
 * }
 */

import { json, apiError } from "@/lib/api";
import { getActor } from "@/lib/actor";
import { ensureTitle } from "@/lib/titles";
import { insertStaffSegment } from "@/lib/staff-submit";
import { parseTimeToMs, roundTime } from "@/lib/time";
import { config } from "@/lib/config";
import { z } from "zod";
import type { SegmentTypeName } from "@/lib/config";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Schema — intentionally loose; time resolution happens imperatively below.
// ---------------------------------------------------------------------------

const flexTime = z.union([z.number(), z.string()]);

const segmentInputSchema = z.object({
  type: z.enum(config.segmentTypes),
  start: flexTime.optional(),
  start_ms: z.number().optional(),
  end: flexTime.optional(),
  end_ms: z.number().optional(),
  duration: flexTime.optional(),
  duration_ms: z.number().optional(),
});

const episodeInputSchema = z.object({
  imdb_id: z
    .string()
    .regex(/^tt\d{6,10}$/i, "Must be a valid IMDb id, e.g. tt0903747")
    .transform((s) => s.toLowerCase()),
  // season/episode are optional so movies can be imported too (omit both).
  season: z.coerce.number().int().min(0).optional(),
  episode: z.coerce.number().int().min(0).optional(),
  duration: flexTime.optional(),
  duration_ms: z.number().optional(),
  segments: z.array(segmentInputSchema).min(1).max(50),
});

const importSchema = z.array(episodeInputSchema).min(1).max(1000);

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function resolveMs(ms?: number, flex?: z.infer<typeof flexTime>): number | null {
  if (ms != null) return ms;
  if (flex != null) return parseTimeToMs(flex);
  return null;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const actor = await getActor(req);
  const role = actor?.user?.role;
  if (!actor || (role !== "moderator" && role !== "admin"))
    return apiError("Forbidden — staff API key or session required", 403);
  const staff = { id: actor.user.id, role: role as "moderator" | "admin" };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 422, {
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  // Cache title lookups — multiple episodes from the same show share one row.
  const titleCache = new Map<string, Awaited<ReturnType<typeof ensureTitle>>>();
  async function getTitle(imdbId: string, isMovie: boolean) {
    const cached = titleCache.get(imdbId);
    if (cached) return cached;
    const t = await ensureTitle(imdbId, isMovie ? "movie" : "series");
    titleCache.set(imdbId, t);
    return t;
  }

  type SegResult =
    | { type: string; id: number; start_ms: number; end_ms: number; duration_ms: number | null; status: "approved" }
    | { type: string; skipped: true; existing_id: number; reason: string }
    | { type: string; error: string };

  const results: Array<{
    imdb_id: string;
    season: number | null;
    episode: number | null;
    segments: SegResult[];
  }> = [];

  for (const item of parsed.data) {
    const season = item.season ?? null;
    const episode = item.episode ?? null;
    const isMovie = season == null && episode == null;
    const epDurationMs = resolveMs(item.duration_ms, item.duration);

    const title = await getTitle(item.imdb_id, isMovie);

    const segResults: SegResult[] = [];

    for (const seg of item.segments) {
      const segType = seg.type as SegmentTypeName;

      const rawStart = resolveMs(seg.start_ms, seg.start);
      const rawEnd = resolveMs(seg.end_ms, seg.end);
      const segDurationMs = resolveMs(seg.duration_ms, seg.duration) ?? epDurationMs;

      if (rawStart == null) {
        segResults.push({ type: segType, error: "start is required" });
        continue;
      }
      const startMs = roundTime(rawStart);

      // Resolve end: outros allow omitting end (falls back to duration, then snaps).
      let endMs: number | null = rawEnd != null ? roundTime(rawEnd) : null;

      if (segType === "outro") {
        endMs ??= segDurationMs != null ? roundTime(segDurationMs) : null;
        if (endMs == null) {
          segResults.push({
            type: segType,
            error:
              "outro without an end time requires duration or duration_ms on the episode or segment",
          });
          continue;
        }
        // Snap to end of stream when within threshold.
        if (
          segDurationMs != null &&
          Math.abs(endMs - roundTime(segDurationMs)) <=
            config.limits.outroEndThresholdMs
        ) {
          endMs = roundTime(segDurationMs);
        }
      } else if (endMs == null) {
        segResults.push({
          type: segType,
          error: "end is required for non-outro segments",
        });
        continue;
      }

      try {
        const outcome = await insertStaffSegment({
          titleId: title.id,
          imdbId: item.imdb_id,
          season,
          episode,
          segmentType: segType,
          startMs,
          endMs,
          durationMs: segDurationMs != null ? roundTime(segDurationMs) : null,
          submittedById: staff.id,
        });

        if (outcome.kind === "skipped") {
          segResults.push({
            type: segType,
            skipped: true,
            existing_id: outcome.existingId,
            reason: "Identical approved segment already exists — vote on it instead",
          });
        } else {
          segResults.push({
            type: segType,
            id: outcome.id,
            start_ms: outcome.startMs,
            end_ms: outcome.endMs,
            duration_ms: outcome.durationMs,
            status: "approved",
          });

        }
      } catch (err) {
        segResults.push({ type: segType, error: String(err) });
      }
    }

    results.push({
      imdb_id: item.imdb_id,
      season,
      episode,
      segments: segResults,
    });
  }

  const submitted = results.flatMap((r) => r.segments).filter((s) => "id" in s).length;
  const skipped = results.flatMap((r) => r.segments).filter((s) => "skipped" in s).length;
  const failed = results.flatMap((r) => r.segments).filter((s) => "error" in s).length;

  return json({ submitted, skipped, failed, results });
}
