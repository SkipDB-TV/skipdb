import { z } from "zod";
import { config } from "./config";
import type { SegmentTypeName } from "./config";
import { parseTimeToMs, roundTime } from "./time";

export const imdbIdSchema = z
  .string()
  .trim()
  .regex(/^tt\d{6,10}$/i, "Must be a valid IMDb id, e.g. tt0903747")
  .transform((s) => s.toLowerCase());

export const segmentTypeSchema = z.enum(config.segmentTypes);

/** A time field that accepts ms (number) or seconds / clock string. */
const flexibleTime = z.union([z.number(), z.string()]);

/**
 * Submission payload. Times may be given as `*_ms` (preferred, milliseconds) or
 * `*_sec` (seconds or clock strings). Same for duration.
 */
export const submitSchema = z
  .object({
    imdb_id: imdbIdSchema,
    segment_type: segmentTypeSchema,
    season: z.coerce.number().int().min(0).optional(),
    episode: z.coerce.number().int().min(0).optional(),

    start_ms: z.number().optional(),
    end_ms: z.number().optional(),
    start_sec: flexibleTime.optional(),
    end_sec: flexibleTime.optional(),

    duration_ms: z.number().optional(),
    duration_sec: flexibleTime.optional(),

    // Submitting implies agreement to publish under ODbL 1.0 (see /terms);
    // accepted for backwards-compatibility but no longer required.
    agree_terms: z.boolean().optional(),
  })
  .transform((data, ctx) => {
    const startMs = data.start_ms ?? parseTimeToMs(data.start_sec);
    const submittedEndMs = data.end_ms ?? parseTimeToMs(data.end_sec);
    const durationMs =
      data.duration_ms ?? parseTimeToMs(data.duration_sec ?? null);

    if (startMs == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "start_ms or start_sec is required",
        path: ["start_ms"],
      });
    }

    // Outros: end is optional — if omitted the credits run to the end of the
    // stream. If an explicit end IS provided (post-credits scene present), use
    // it. Either way, snap to durationMs when within the threshold.
    let endMs: number | null;
    if (data.segment_type === "outro") {
      endMs = submittedEndMs ?? durationMs;
      if (endMs == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "outro submissions without an end time require duration_ms so we know where the stream ends",
          path: ["end_ms"],
        });
      } else if (
        durationMs != null &&
        Math.abs(endMs - durationMs) <= config.limits.outroEndThresholdMs
      ) {
        endMs = durationMs;
      }
    } else {
      endMs = submittedEndMs;
      if (endMs == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "end_ms or end_sec is required",
          path: ["end_ms"],
        });
      }
    }

    if (startMs == null || endMs == null) return z.NEVER;

    return {
      imdbId: data.imdb_id,
      segmentType: data.segment_type,
      season: data.season ?? null,
      episode: data.episode ?? null,
      // Stored at one decimal place of seconds (100 ms granularity).
      startMs: roundTime(startMs),
      endMs: roundTime(endMs),
      durationMs: durationMs != null ? roundTime(durationMs) : null,
    };
  });

export type SubmitInput = z.infer<typeof submitSchema>;

/** Static sanity checks shared by the API and review logic. */
export function validateSegmentBounds(input: {
  startMs: number;
  endMs: number;
  durationMs: number | null;
  segmentType: SegmentTypeName;
}): string | null {
  const { startMs, endMs, durationMs, segmentType } = input;
  // 0,0 is the sentinel for "confirmed no segment of this type" — always valid.
  if (startMs === 0 && endMs === 0) return null;
  if (startMs < 0) return "start must be >= 0";
  if (endMs <= startMs) return "end must be after start";
  const len = endMs - startMs;
  const minMs = config.limits.minSegmentMs;
  if (len < minMs) return `segment too short (min ${minMs / 1000}s)`;
  const maxMs =
    config.limits.maxByType[segmentType] ?? config.limits.maxSegmentMs;
  if (len > maxMs) {
    const maxMin = maxMs / 60_000;
    return `${segmentType} too long (max ${maxMin} min)`;
  }
  if (durationMs != null && endMs > durationMs)
    return "end is beyond the provided stream duration";
  return null;
}

/** Partial edit of an existing segment; omitted fields keep their value. */
export const editSchema = z.object({
  segment_type: segmentTypeSchema.optional(),
  start_ms: z.number().optional(),
  end_ms: z.number().optional(),
  start_sec: flexibleTime.optional(),
  end_sec: flexibleTime.optional(),
  duration_ms: z.number().optional(),
  duration_sec: flexibleTime.optional(),
  clear_duration: z.boolean().optional(),
});

export const voteSchema = z.object({
  value: z.union([
    z.literal(1),
    z.literal(-1),
    z.literal(0), // 0 clears the vote
  ]),
});

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(120),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200),
  name: z.string().trim().min(1).max(80).optional(),
});
