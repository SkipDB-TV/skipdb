// Imported by the Cloudflare Worker (deploy/cloudflare-segments-worker).
// Keep this file free of Node.js, Next.js, and database imports.
import { config } from "./config";
import type { MatchKind } from "./duration";

// Extra negative-prior added per match kind. Represents how uncertain the
// duration alignment makes us about the timestamps.
const MATCH_PENALTY: Record<MatchKind, number> = {
  exact:          0, // baseline 0.90
  shifted:        1, // ~0.82 — timestamps were adjusted
  agnostic:       2, // ~0.75 — no duration info to compare
  "out-of-range": 5, // ~0.60 — duration mismatch too large to shift reliably
};

/**
 * Confidence (0–1) that a segment is correct, from three signals:
 *  - how many independent submissions agree on it (consensus),
 *  - community votes (up minus down), and
 *  - how well the submitted duration matched the requester's stream.
 *
 * Uses a high prior (9 positive : 1 negative) so a lone unverified submission
 * with an exact match starts at 0.9 and climbs toward 1.0 with upvotes.
 * Weaker match kinds reduce the baseline via extra negative prior.
 */
// Votes are weighted higher than agree-count because they're explicit community
// feedback. With only 1-2 votes typical, each vote needs to move the needle.
const VOTE_WEIGHT = 5;

export function computeConfidence(input: {
  agreeCount: number; // other submissions agreeing with the winner
  votesUp: number;
  votesDown: number;
  match?: MatchKind;  // omit when no duration context (treated as agnostic)
}): number {
  const PRIOR_POS = 9;
  const PRIOR_NEG = 1 + MATCH_PENALTY[input.match ?? "agnostic"];
  const positives = input.agreeCount + input.votesUp * VOTE_WEIGHT + PRIOR_POS;
  const negatives = input.votesDown * VOTE_WEIGHT + PRIOR_NEG;
  const conf = positives / (positives + negatives);
  return Math.round(conf * 100) / 100;
}

/** Count how many of `others` agree with `winner` within the consensus window. */
export function countAgreement(
  winner: { id: number; startMs: number; endMs: number },
  others: { id: number; startMs: number; endMs: number }[],
): number {
  const tol = config.review.consensusToleranceMs;
  return others.filter(
    (s) =>
      s.id !== winner.id &&
      Math.abs(s.startMs - winner.startMs) <= tol &&
      Math.abs(s.endMs - winner.endMs) <= tol,
  ).length;
}
