import { db } from "@/db";
import { segments, titles, users, votes, moderationLog } from "@/db/schema";
import { and, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { revokeApiKeys } from "./api-key";
import type { User, Segment } from "@/db/schema";

type SegmentStatus = Segment["status"];

export interface UserListItem {
  id: string;
  name: string | null;
  email: string | null;
  role: User["role"];
  reputation: number;
  disabled: boolean;
  createdAt: Date;
  submissionCount: number;
  approvedCount: number;
}

export interface UserListPage {
  users: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Users ordered by submission volume, each with a total/approved count.
 * Paginated (default 100/page) since a real deployment can have thousands of
 * users — the list must never load them all into one request.
 *
 * Disabled users are excluded by default (a disabled account is usually a
 * handled spammer — the list shouldn't fill up with them) — pass
 * `includeDisabled: true` to see everyone.
 */
export async function listUsers(
  opts: {
    page?: number;
    pageSize?: number;
    q?: string;
    includeDisabled?: boolean;
  } = {},
): Promise<UserListPage> {
  const pageSize = opts.pageSize ?? 100;
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const conditions = [
    q
      ? or(
          ilike(users.name, `%${q}%`),
          ilike(users.email, `%${q}%`),
          ilike(users.id, `%${q}%`),
        )
      : undefined,
    opts.includeDisabled ? undefined : eq(users.disabled, false),
  ].filter((c): c is NonNullable<typeof c> => c != null);
  const filter = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(filter);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      reputation: users.reputation,
      disabled: users.disabled,
      createdAt: users.createdAt,
      submissionCount: sql<number>`count(${segments.id})`,
      approvedCount: sql<number>`count(${segments.id}) filter (where ${segments.status} = 'approved')`,
    })
    .from(users)
    .leftJoin(segments, eq(segments.submittedBy, users.id))
    .where(filter)
    .groupBy(users.id)
    // Tiebreak by id so ties in submission count don't shift rows between
    // pages (LIMIT/OFFSET needs a fully deterministic order to paginate safely).
    .orderBy(desc(sql`count(${segments.id})`), users.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    users: rows.map((r) => ({
      ...r,
      submissionCount: Number(r.submissionCount),
      approvedCount: Number(r.approvedCount),
    })),
    total: Number(total),
    page,
    pageSize,
  };
}

export interface UserSubmission extends Segment {
  title: string | null;
}

// Excludes `passwordHash` — this is returned straight to the admin UI as JSON
// and a scrypt hash has no business leaving the DB layer.
export type SafeUser = Omit<User, "passwordHash">;

export interface UserDetail {
  user: SafeUser;
  submissions: UserSubmission[];
  submissionTotal: number;
  page: number;
  pageSize: number;
}

/**
 * A single user plus a page of the segments they've submitted (most recent
 * first). Paginated (default 100/page) — a single prolific or abusive user
 * can easily have thousands of submissions.
 */
export async function getUserDetail(
  userId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<UserDetail | null> {
  const pageSize = opts.pageSize ?? 100;
  const page = Math.max(1, opts.page ?? 1);

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      image: users.image,
      role: users.role,
      reputation: users.reputation,
      disabled: users.disabled,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const [{ count: submissionTotal }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(segments)
    .where(eq(segments.submittedBy, userId));

  const rows = await db
    .select({ segment: segments, titleName: titles.name })
    .from(segments)
    .leftJoin(titles, eq(segments.titleId, titles.id))
    .where(eq(segments.submittedBy, userId))
    .orderBy(desc(segments.createdAt), segments.id)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    user,
    submissions: rows.map((r) => ({ ...r.segment, title: r.titleName })),
    submissionTotal: Number(submissionTotal),
    page,
    pageSize,
  };
}

/**
 * Delete every vote a user cast on OTHER people's segments and bulk-recompute
 * the aggregates that depended on them (the affected segments' votes_up/down/
 * score, and the reputation of the segments' owners — reputation is defined
 * as the sum of score across a user's own non-disabled segments). Unlike
 * `disableUser`'s segment soft-disable, this is a hard delete: votes have no
 * "disabled" concept for callers to filter around, so a stale vote would
 * otherwise sit baked into another user's segment score/rank forever.
 *
 * Deliberately just 4 set-based statements total, none of them looping per
 * vote — a spammer who cast zero or one vote costs the same one SELECT (which
 * comes back empty and short-circuits) as a spammer who cast a million, and
 * even the worst case never issues more than one query per affected table.
 */
async function purgeUserVotes(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
): Promise<void> {
  const affected = await tx
    .select({ segmentId: votes.segmentId, ownerId: segments.submittedBy })
    .from(votes)
    .innerJoin(segments, eq(segments.id, votes.segmentId))
    .where(eq(votes.userId, userId));

  if (affected.length === 0) return;

  await tx.delete(votes).where(eq(votes.userId, userId));

  const segmentIds = [...new Set(affected.map((a) => a.segmentId))];
  const segmentIdList = sql.join(
    segmentIds.map((id) => sql`${id}`),
    sql`, `,
  );
  // Zero first so segments left with no remaining votes land at 0/0/0 —
  // the aggregate query below only touches rows that still have votes.
  await tx
    .update(segments)
    .set({ votesUp: 0, votesDown: 0, score: 0, updatedAt: new Date() })
    .where(inArray(segments.id, segmentIds));

  await tx.execute(sql`
    UPDATE segments s
    SET votes_up = agg.up,
        votes_down = agg.down,
        score = agg.up - agg.down,
        updated_at = now()
    FROM (
      SELECT segment_id,
             sum(case when value = 1 then 1 else 0 end) AS up,
             sum(case when value = -1 then 1 else 0 end) AS down
      FROM votes
      WHERE segment_id IN (${segmentIdList})
      GROUP BY segment_id
    ) agg
    WHERE s.id = agg.segment_id
  `);

  const ownerIds = [
    ...new Set(
      affected.map((a) => a.ownerId).filter((id): id is string => id != null),
    ),
  ];
  if (ownerIds.length === 0) return;

  const ownerIdList = sql.join(
    ownerIds.map((id) => sql`${id}`),
    sql`, `,
  );
  await tx
    .update(users)
    .set({ reputation: 0 })
    .where(inArray(users.id, ownerIds));

  await tx.execute(sql`
    UPDATE users u
    SET reputation = agg.total
    FROM (
      SELECT submitted_by, sum(score) AS total
      FROM segments
      WHERE submitted_by IN (${ownerIdList}) AND status != 'disabled'
      GROUP BY submitted_by
    ) agg
    WHERE u.id = agg.submitted_by
  `);
}

/**
 * Soft-disable a user: revoke their API key, flag the account, bulk-flip
 * every segment they've submitted to `status: "disabled"` so it drops out of
 * every public/matching query that already filters on status (approved,
 * pending, etc.) — no separate "disabled" column for callers to learn about —
 * and purge their votes on other people's segments (see `purgeUserVotes`).
 *
 * Each disabled segment's status right before the flip is snapshotted onto
 * its moderation_log "disable" entry (`detail.previousStatus`) so
 * `enableUser` can restore it exactly. Segments are never deleted; votes are
 * (see `purgeUserVotes`) since there's nothing to restore them to.
 */
export async function disableUser(
  userId: string,
  moderatorId: string,
): Promise<void> {
  await revokeApiKeys(userId);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ disabled: true }).where(eq(users.id, userId));

    await purgeUserVotes(tx, userId);

    const toDisable = await tx
      .select({ id: segments.id, status: segments.status })
      .from(segments)
      .where(
        and(eq(segments.submittedBy, userId), ne(segments.status, "disabled")),
      );

    if (toDisable.length === 0) return;

    await tx
      .update(segments)
      .set({ status: "disabled", updatedAt: new Date() })
      .where(
        inArray(
          segments.id,
          toDisable.map((s) => s.id),
        ),
      );

    await tx.insert(moderationLog).values(
      toDisable.map((s) => ({
        segmentId: s.id,
        moderatorId,
        action: "disable",
        reason: "user account disabled",
        detail: { previousStatus: s.status },
      })),
    );
  });
}

/**
 * Reverse of `disableUser`: restores each segment's pre-disable status from
 * its "disable" log entry (falling back to "pending" — safe, just re-queues
 * it for review — if that's somehow missing). Does not restore a revoked API
 * key; the user generates a new one.
 */
export async function enableUser(
  userId: string,
  moderatorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ disabled: false }).where(eq(users.id, userId));

    const disabledSegments = await tx
      .select({ id: segments.id })
      .from(segments)
      .where(
        and(eq(segments.submittedBy, userId), eq(segments.status, "disabled")),
      );
    if (disabledSegments.length === 0) return;

    const ids = disabledSegments.map((s) => s.id);

    const disableLogs = await tx
      .select({
        segmentId: moderationLog.segmentId,
        detail: moderationLog.detail,
      })
      .from(moderationLog)
      .where(
        and(
          inArray(moderationLog.segmentId, ids),
          eq(moderationLog.action, "disable"),
        ),
      )
      .orderBy(desc(moderationLog.createdAt));

    // Keep only the most recent "disable" entry per segment (rows arrive
    // newest-first, so the first one seen per id wins).
    const previousStatusById = new Map<number, SegmentStatus>();
    for (const log of disableLogs) {
      if (previousStatusById.has(log.segmentId)) continue;
      const status = (log.detail as { previousStatus?: SegmentStatus } | null)
        ?.previousStatus;
      if (status) previousStatusById.set(log.segmentId, status);
    }

    const idsByStatus = new Map<SegmentStatus, number[]>();
    for (const id of ids) {
      const status = previousStatusById.get(id) ?? "pending";
      const arr = idsByStatus.get(status) ?? [];
      arr.push(id);
      idsByStatus.set(status, arr);
    }

    for (const [status, segmentIds] of idsByStatus) {
      await tx
        .update(segments)
        .set({ status, updatedAt: new Date() })
        .where(inArray(segments.id, segmentIds));
    }

    await tx.insert(moderationLog).values(
      ids.map((id) => ({
        segmentId: id,
        moderatorId,
        action: "enable",
        reason: "user account re-enabled",
        detail: { restoredStatus: previousStatusById.get(id) ?? "pending" },
      })),
    );
  });
}
