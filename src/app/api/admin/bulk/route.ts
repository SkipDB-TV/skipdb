import { json, apiError } from "@/lib/api";
import { requireStaff } from "@/lib/admin";
import { ensureTitle } from "@/lib/titles";
import { insertStaffSegment } from "@/lib/staff-submit";
import { config } from "@/lib/config";
import { z } from "zod";
import type { SegmentTypeName } from "@/lib/config";

export const runtime = "nodejs";

const bulkSchema = z.object({
  imdb_id: z
    .string()
    .regex(/^tt\d{6,10}$/i)
    .transform((s) => s.toLowerCase()),
  segment_type: z.enum(config.segmentTypes),
  episodes: z
    .array(
      z.object({
        season: z.number().int().min(0),
        episode: z.number().int().min(0),
        start_ms: z.number(),
        end_ms: z.number(),
        duration_ms: z.number().optional(),
      }),
    )
    .min(1)
    .max(500),
});

export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return apiError("Forbidden", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON", 400);
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 422, {
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  const { imdb_id: imdbId, segment_type: segmentType, episodes } = parsed.data;
  const title = await ensureTitle(imdbId, "series");

  const results: Array<{
    season: number;
    episode: number;
    id?: number;
    status?: string;
    skipped?: true;
    existing_id?: number;
    error?: string;
  }> = [];

  for (const ep of episodes) {
    try {
      const outcome = await insertStaffSegment({
        titleId: title.id,
        imdbId,
        season: ep.season,
        episode: ep.episode,
        segmentType: segmentType as SegmentTypeName,
        startMs: ep.start_ms,
        endMs: ep.end_ms,
        durationMs: ep.duration_ms ?? null,
        submittedById: staff.id,
      });
      if (outcome.kind === "skipped") {
        results.push({ season: ep.season, episode: ep.episode, skipped: true, existing_id: outcome.existingId, status: "exact_match" });
      } else {
        results.push({ season: ep.season, episode: ep.episode, id: outcome.id, status: "approved" });
      }
    } catch (err) {
      results.push({ season: ep.season, episode: ep.episode, error: String(err) });
    }
  }

  const ok = results.filter((r) => r.id != null).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => r.error != null).length;

  return json({ submitted: ok, skipped, failed, results });
}
