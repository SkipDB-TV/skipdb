// Imported by the Cloudflare Worker (deploy/cloudflare-segments-worker).
// Keep this file free of Node.js, Next.js, and database imports.

/**
 * Central tunable configuration for SkipDB's matching and review behavior.
 * All durations are in milliseconds.
 */
export const config = {
  duration: {
    /** |offset| at or below this is treated as the same stream (no shift). */
    exactToleranceMs: 2_000,
    /**
     * |offset| above exact and at/below this is shifted: we assume an extra or
     * missing logo/scene at the start, so timestamps move by the offset.
     */
    shiftToleranceMs: 15_000,
  },

  review: {
    /** Reputation at or above this auto-approves a user's submissions. */
    trustedReputation: 50,
    /** Reputation granted to a user when one of their segments is approved. */
    reputationPerApproval: 5,
    /**
     * A submission whose length is within this of the established median length
     * (per show + segment type) is considered a pattern match.
     */
    patternLengthToleranceMs: 8_000,
    /**
     * A submission that agrees with an existing approved segment within this
     * (after duration adjustment) reaches consensus and auto-approves.
     */
    consensusToleranceMs: 4_000,
    /** Minimum existing approved samples needed to trust a show's pattern. */
    minPatternSamples: 2,
  },

  limits: {
    /** Sensible per-type bounds to reject obviously-bad submissions. */
    minSegmentMs: 5_000, // 5 seconds
    maxSegmentMs: 15 * 60_000, // 15 minutes (overall cap)
    /** Per-type maximum lengths. */
    maxByType: {
      intro: 5 * 60_000, // 5 minutes
      recap: 5 * 60_000, // 5 minutes
      outro: 15 * 60_000, // 15 minutes
      preview: 15 * 60_000, // 15 minutes
    } as Record<string, number>,
    /**
     * For outros: if the submitted end (or duration) is within this many ms of
     * the stream duration, snap the end to the duration ("to the end").
     */
    outroEndThresholdMs: 10_000,
    // Read/write rate limits (requests per window).
    readPerMinute: 120,
    writePerMinute: 30,
    // Tighter limit for endpoints that proxy a third-party metadata provider
    // (TMDB/TVDB), to protect the shared server API key from abuse.
    metadataPerMinute: 30,
    rateWindowMs: 60_000,
    // Per-IP cap on minting anonymous (no-signup) users + keys, since each one
    // gets its own write-rate-limit bucket and reputation — without this, one
    // IP could farm throwaway identities to dodge writePerMinute.
    anonymousKeysPerHour: 5,
  },

  segmentTypes: ["intro", "recap", "outro", "preview"] as const,
} as const;

export type SegmentTypeName = (typeof config.segmentTypes)[number];
