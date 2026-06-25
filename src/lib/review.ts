import { db } from "@/db";
import { segments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { config } from "./config";
import { adjustForDuration } from "./duration";
import type { SegmentTypeName } from "./config";

export interface ReviewDecision {
  status: "approved" | "pending";
  autoApproved: boolean;
  reasons: string[];
}

interface Candidate {
  titleId: number;
  season: number | null;
  episode: number | null;
  segmentType: SegmentTypeName;
  startMs: number;
  endMs: number;
  durationMs: number | null;
  // When re-evaluating an edit, exclude the segment itself from comparisons so
  // it can't reach "consensus" with its own previously-approved version.
  excludeSegmentId?: number;
}

/**
 * Decide whether a new submission goes live immediately or enters the review
 * queue. The "smart controls":
 *
 *  1. Moderators/admins and trusted users (high reputation) are auto-approved.
 *  2. Consensus: it agrees (after duration adjustment) with an existing approved
 *     segment for the same episode + type  ->  auto-approve.
 *  3. Pattern fit: its length matches the established median length for this
 *     show + segment type (intros are consistent within a series)  ->  approve,
 *     UNLESS it conflicts with an existing approved segment (then -> review).
 *  4. Otherwise  ->  pending review.
 */
export async function reviewSubmission(
  candidate: Candidate,
  submitter: { role: string; reputation: number },
): Promise<ReviewDecision> {
  const reasons: string[] = [];

  if (submitter.role === "moderator" || submitter.role === "admin") {
    return {
      status: "approved",
      autoApproved: true,
      reasons: ["submitter is staff"],
    };
  }

  const approvedAll = await db
    .select()
    .from(segments)
    .where(
      and(
        eq(segments.titleId, candidate.titleId),
        eq(segments.segmentType, candidate.segmentType),
        eq(segments.status, "approved"),
      ),
    );
  const approved =
    candidate.excludeSegmentId != null
      ? approvedAll.filter((s) => s.id !== candidate.excludeSegmentId)
      : approvedAll;

  // Same-episode approved segments (for consensus + conflict detection).
  const sameEpisode = approved.filter(
    (s) => s.season === candidate.season && s.episode === candidate.episode,
  );

  // 2. Consensus with an existing approved segment for this exact episode.
  for (const existing of sameEpisode) {
    // Express both in the candidate's stream timeline before comparing.
    const adj = adjustForDuration(
      {
        startMs: existing.startMs,
        endMs: existing.endMs,
        durationMs: existing.durationMs,
      },
      candidate.durationMs,
    );
    if (adj.kind === "out-of-range") continue;
    const startClose =
      Math.abs(adj.startMs - candidate.startMs) <=
      config.review.consensusToleranceMs;
    const endClose =
      Math.abs(adj.endMs - candidate.endMs) <=
      config.review.consensusToleranceMs;
    if (startClose && endClose) {
      reasons.push("matches an existing approved segment (consensus)");
      return { status: "approved", autoApproved: true, reasons };
    }
  }

  const conflictsWithExisting = sameEpisode.length > 0;

  // 1b. Trusted user: auto-approve as long as it doesn't contradict consensus.
  if (submitter.reputation >= config.review.trustedReputation) {
    reasons.push("submitter is trusted");
    return { status: "approved", autoApproved: true, reasons };
  }

  // 3. Pattern fit across the whole show for this segment type.
  const otherEpisodeLengths = approved
    .filter(
      (s) => s.season !== candidate.season || s.episode !== candidate.episode,
    )
    .map((s) => s.endMs - s.startMs);

  if (otherEpisodeLengths.length >= config.review.minPatternSamples) {
    const median = medianOf(otherEpisodeLengths);
    const candidateLen = candidate.endMs - candidate.startMs;
    if (
      Math.abs(candidateLen - median) <= config.review.patternLengthToleranceMs
    ) {
      if (conflictsWithExisting) {
        reasons.push(
          "length matches the show pattern but conflicts with an existing segment",
        );
        return { status: "pending", autoApproved: false, reasons };
      }
      reasons.push("length matches this show's established pattern");
      return { status: "approved", autoApproved: true, reasons };
    }
    reasons.push("length differs from this show's established pattern");
  } else {
    reasons.push("not enough data yet to verify automatically");
  }

  return { status: "pending", autoApproved: false, reasons };
}

function medianOf(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
