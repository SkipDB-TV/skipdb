import { z } from "zod";
import { config } from "./config";
import { parseTimeToMs } from "./time";

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

    agree_terms: z.literal(true, {
      errorMap: () => ({
        message:
          "You must agree to publish your contribution under CC BY-NC-SA 4.0.",
      }),
    }),
  })
  .transform((data, ctx) => {
    const startMs = data.start_ms ?? parseTimeToMs(data.start_sec);
    const endMs = data.end_ms ?? parseTimeToMs(data.end_sec);
    const durationMs =
      data.duration_ms ?? parseTimeToMs(data.duration_sec ?? null);

    if (startMs == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "start_ms or start_sec is required",
        path: ["start_ms"],
      });
    }
    if (endMs == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "end_ms or end_sec is required",
        path: ["end_ms"],
      });
    }
    if (startMs == null || endMs == null) return z.NEVER;

    return {
      imdbId: data.imdb_id,
      segmentType: data.segment_type,
      season: data.season ?? null,
      episode: data.episode ?? null,
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
      durationMs: durationMs != null ? Math.round(durationMs) : null,
    };
  });

export type SubmitInput = z.infer<typeof submitSchema>;

/** Static sanity checks shared by the API and review logic. */
export function validateSegmentBounds(input: {
  startMs: number;
  endMs: number;
  durationMs: number | null;
}): string | null {
  const { startMs, endMs, durationMs } = input;
  if (startMs < 0) return "start must be >= 0";
  if (endMs <= startMs) return "end must be after start";
  const len = endMs - startMs;
  if (len < config.limits.minSegmentMs)
    return `segment too short (min ${config.limits.minSegmentMs} ms)`;
  if (len > config.limits.maxSegmentMs)
    return `segment too long (max ${config.limits.maxSegmentMs} ms)`;
  if (durationMs != null && endMs > durationMs)
    return "end is beyond the provided stream duration";
  return null;
}

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

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200),
  name: z.string().trim().min(1).max(80).optional(),
});
