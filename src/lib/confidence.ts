import { config } from "./config";

/**
 * Confidence (0–1) that a segment is correct, from two signals:
 *  - how many independent submissions agree on it (consensus), and
 *  - community votes (up minus down).
 *
 * Laplace-smoothed proportion of positive vs negative evidence, so a lone
 * unverified submission sits at 0.5 and climbs with agreement/upvotes or falls
 * with downvotes.
 */
export function computeConfidence(input: {
  agreeCount: number; // other submissions agreeing with the winner
  votesUp: number;
  votesDown: number;
}): number {
  const positives = input.agreeCount + input.votesUp;
  const negatives = input.votesDown;
  const conf = (positives + 1) / (positives + negatives + 2);
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
