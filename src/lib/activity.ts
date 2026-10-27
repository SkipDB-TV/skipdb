import { db } from "@/db";
import { moderationLog, segments, titles, users } from "@/db/schema";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Disabling/enabling a user logs one entry per submission, all in one
// statement — collapsed into a single row per user here.
const ACCOUNT_ACTIONS = new Set(["disable", "enable"]);

export interface ActivityEntry {
  id: number;
  action: string;
  reason: string | null;
  detail: unknown;
  createdAt: Date;
  moderatorId: string | null;
  moderatorName: string | null;
  /** For collapsed disable/enable entries: the affected user and submission count. */
  targetUserId: string | null;
  targetUserName: string | null;
  count: number;
  segment: {
    id: number;
    imdbId: string;
    title: string | null;
    season: number | null;
    episode: number | null;
    segmentType: string;
    startMs: number;
    endMs: number;
  } | null;
}

export interface ModeratorSummary {
  moderatorId: string;
  name: string | null;
  role: string;
  approved: number;
  rejected: number;
  edited: number;
  lastActiveAt: Date;
}

/** Recent actions taken by staff (system auto-approvals are excluded). */
export async function getStaffActivity({
  moderatorId,
  limit = 200,
}: {
  moderatorId?: string;
  limit?: number;
}): Promise<ActivityEntry[]> {
  const moderator = alias(users, "moderator");
  const submitter = alias(users, "submitter");

  const rows = await db
    .select({
      log: moderationLog,
      moderatorName: sql<string | null>`coalesce(${moderator.name}, ${moderator.email})`,
      submitterId: segments.submittedBy,
      submitterName: sql<string | null>`coalesce(${submitter.name}, ${submitter.email})`,
      segment: {
        id: segments.id,
        imdbId: segments.imdbId,
        season: segments.season,
        episode: segments.episode,
        segmentType: segments.segmentType,
        startMs: segments.startMs,
        endMs: segments.endMs,
      },
      title: titles.name,
    })
    .from(moderationLog)
    .leftJoin(moderator, eq(moderationLog.moderatorId, moderator.id))
    .leftJoin(segments, eq(moderationLog.segmentId, segments.id))
    .leftJoin(submitter, eq(segments.submittedBy, submitter.id))
    .leftJoin(titles, eq(segments.titleId, titles.id))
    .where(
      moderatorId
        ? eq(moderationLog.moderatorId, moderatorId)
        : isNotNull(moderationLog.moderatorId),
    )
    .orderBy(desc(moderationLog.createdAt), desc(moderationLog.id))
    .limit(limit);

  const entries: ActivityEntry[] = [];
  for (const r of rows) {
    if (ACCOUNT_ACTIONS.has(r.log.action)) {
      const prev = entries.at(-1);
      if (
        prev &&
        prev.action === r.log.action &&
        prev.moderatorId === r.log.moderatorId &&
        prev.targetUserId === r.submitterId &&
        prev.createdAt.getTime() === r.log.createdAt.getTime()
      ) {
        prev.count++;
        continue;
      }
      entries.push({
        id: r.log.id,
        action: r.log.action,
        reason: r.log.reason,
        detail: null,
        createdAt: r.log.createdAt,
        moderatorId: r.log.moderatorId,
        moderatorName: r.moderatorName,
        targetUserId: r.submitterId,
        targetUserName: r.submitterName,
        count: 1,
        segment: null,
      });
      continue;
    }
    entries.push({
      id: r.log.id,
      action: r.log.action,
      reason: r.log.reason,
      detail: r.log.detail,
      createdAt: r.log.createdAt,
      moderatorId: r.log.moderatorId,
      moderatorName: r.moderatorName,
      targetUserId: null,
      targetUserName: null,
      count: 1,
      segment: r.segment?.id != null ? { ...r.segment, title: r.title } : null,
    });
  }
  return entries;
}

/** Per-staff-member action counts over the last `days` days. */
export async function getModeratorSummary(days = 30): Promise<ModeratorSummary[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      moderatorId: moderationLog.moderatorId,
      name: sql<string | null>`coalesce(${users.name}, ${users.email})`,
      role: users.role,
      approved: sql<number>`count(*) filter (where ${moderationLog.action} = 'approve')::int`,
      rejected: sql<number>`count(*) filter (where ${moderationLog.action} = 'reject')::int`,
      edited: sql<number>`count(*) filter (where ${moderationLog.action} = 'edit')::int`,
      lastActiveAt: sql<Date>`max(${moderationLog.createdAt})`,
    })
    .from(moderationLog)
    .innerJoin(users, eq(moderationLog.moderatorId, users.id))
    .where(gte(moderationLog.createdAt, since))
    .groupBy(moderationLog.moderatorId, users.name, users.email, users.role)
    .orderBy(desc(sql`max(${moderationLog.createdAt})`));

  return rows.map((r) => ({
    ...r,
    moderatorId: r.moderatorId!,
    lastActiveAt: new Date(r.lastActiveAt),
  }));
}
