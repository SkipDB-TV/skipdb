import { db } from "@/db";
import { segments } from "@/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { config } from "./config";
import { adjustForDuration } from "./duration";
import type { SegmentTypeName } from "./config";
import { moderateSegments } from "./moderate";

export interface ReviewDecision {
  status: "approved" | "pending";
  autoApproved: boolean;
  reasons: string[];
  /**
   * Other users' pending segments this submission independently agrees with.
   * Callers approve them (via `approveConfirmedPeers`) once the submission is saved.
   */
  confirmsPendingIds?: number[];
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
 *  1. Moderators/admins and trusted users (high reputation, or a strong
 *     approval record) are auto-approved.
 *  2. Consensus: it agrees (after duration adjustment) with an existing approved
 *     segment for the same episode + type  ->  auto-approve.
 *  2b. Peer consensus: no approved segment yet, but it agrees with another
 *     user's pending one  ->  approve both.
 *  3. Pattern fit: its length matches the established median length for this
 *     show + segment type (intros are consistent within a series)  ->  approve,
 *     UNLESS it conflicts with an existing approved segment (then -> review).
 *     A submitter with a clean record only needs one same-season sample.
 *  4. Otherwise  ->  pending review.
 */
export async function reviewSubmission(
  candidate: Candidate,
  submitter: { id: string; role: string; reputation: number },
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

  // If a 0,0 sentinel ("no intro") is already approved, send real intro
  // submissions to manual review rather than auto-approving them.
  if (
    candidate.segmentType === "intro" &&
    !(candidate.startMs === 0 && candidate.endMs === 0)
  ) {
    const hasNoIntroMarker = sameEpisode.some(
      (s) => s.startMs === 0 && s.endMs === 0,
    );
    if (hasNoIntroMarker) {
      return {
        status: "pending",
        autoApproved: false,
        reasons: ["episode has a confirmed 'no intro' — needs manual review"],
      };
    }
  }

  // 2. Consensus with an existing approved segment for this exact episode.
  if (sameEpisode.some((existing) => agrees(existing, candidate))) {
    reasons.push("matches an existing approved segment (consensus)");
    return { status: "approved", autoApproved: true, reasons };
  }

  const conflictsWithExisting = sameEpisode.length > 0;

  // 2b. Peer consensus: another user's pending submission for this episode
  // independently agrees. Two people agreeing beats one moderator guessing.
  if (!conflictsWithExisting) {
    const peers = await db
      .select()
      .from(segments)
      .where(
        and(
          eq(segments.titleId, candidate.titleId),
          eq(segments.segmentType, candidate.segmentType),
          eq(segments.status, "pending"),
          ne(segments.submittedBy, submitter.id),
        ),
      );
    const agreeing = peers.filter(
      (s) =>
        s.id !== candidate.excludeSegmentId &&
        s.season === candidate.season &&
        s.episode === candidate.episode &&
        agrees(s, candidate),
    );
    if (agreeing.length > 0) {
      reasons.push("matches another user's pending submission (peer consensus)");
      return {
        status: "approved",
        autoApproved: true,
        reasons,
        confirmsPendingIds: agreeing.map((s) => s.id),
      };
    }
  }

  // 1b. Trusted user: auto-approve as long as it doesn't contradict consensus.
  if (submitter.reputation >= config.review.trustedReputation) {
    reasons.push("submitter is trusted");
    return { status: "approved", autoApproved: true, reasons };
  }
  const record = await submitterRecord(submitter.id);
  const reviewed = record.approved + record.rejected;
  if (
    reviewed >= config.review.trustedMinReviewed &&
    record.approved / reviewed >= config.review.trustedApprovalRate
  ) {
    reasons.push("submitter has a strong approval record");
    return { status: "approved", autoApproved: true, reasons };
  }

  // 3. Pattern fit across the whole show for this segment type.
  const otherEpisodes = approved.filter(
    (s) => s.season !== candidate.season || s.episode !== candidate.episode,
  );
  const otherEpisodeLengths = otherEpisodes.map((s) => s.endMs - s.startMs);
  const candidateLen = candidate.endMs - candidate.startMs;

  if (otherEpisodeLengths.length >= config.review.minPatternSamples) {
    const median = medianOf(otherEpisodeLengths);
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
    return { status: "pending", autoApproved: false, reasons };
  }

  // 3b. Thin data, but a clean submitter: one approved sample from the same
  // season is enough when this is the first for the episode.
  const seasonLengths = otherEpisodes
    .filter((s) => s.season === candidate.season)
    .map((s) => s.endMs - s.startMs);
  if (
    !conflictsWithExisting &&
    record.approved > 0 &&
    record.rejected === 0 &&
    seasonLengths.length >= config.review.cleanRecordSeasonSamples &&
    Math.abs(candidateLen - medianOf(seasonLengths)) <=
      config.review.patternLengthToleranceMs
  ) {
    reasons.push("clean submitter and length matches this season");
    return { status: "approved", autoApproved: true, reasons };
  }

  reasons.push("not enough data yet to verify automatically");
  return { status: "pending", autoApproved: false, reasons };
}

/** Whether an existing segment agrees with the candidate after duration adjustment. */
function agrees(
  existing: { startMs: number; endMs: number; durationMs: number | null },
  candidate: Candidate,
): boolean {
  // Express both in the candidate's stream timeline before comparing.
  const adj = adjustForDuration(existing, candidate.durationMs);
  if (adj.kind === "out-of-range") return false;
  return (
    Math.abs(adj.startMs - candidate.startMs) <=
      config.review.consensusToleranceMs &&
    Math.abs(adj.endMs - candidate.endMs) <= config.review.consensusToleranceMs
  );
}

async function submitterRecord(
  userId: string,
): Promise<{ approved: number; rejected: number }> {
  const [row] = await db
    .select({
      approved: sql<number>`count(*) filter (where ${segments.status} = 'approved')::int`,
      rejected: sql<number>`count(*) filter (where ${segments.status} = 'rejected')::int`,
    })
    .from(segments)
    .where(eq(segments.submittedBy, userId));
  return row ?? { approved: 0, rejected: 0 };
}

/**
 * Approve the pending segments a new submission agreed with (peer consensus):
 * flips them to approved, logs it, and grants their submitters reputation.
 */
export async function approveConfirmedPeers(
  decision: ReviewDecision,
  confirmedBySegmentId: number,
): Promise<void> {
  const ids = decision.confirmsPendingIds ?? [];
  if (ids.length === 0) return;
  // Re-check status: a moderator may have acted on them in the meantime.
  const peers = await db
    .select({ id: segments.id, submittedBy: segments.submittedBy })
    .from(segments)
    .where(and(inArray(segments.id, ids), eq(segments.status, "pending")));
  await moderateSegments(
    peers,
    "approve",
    null,
    `peer consensus with segment ${confirmedBySegmentId}`,
    { auto: true },
  );
}

function medianOf(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
