import {
  pgTable,
  pgEnum,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["user", "moderator", "admin"]);
export const mediaType = pgEnum("media_type", ["movie", "series"]);
export const segmentType = pgEnum("segment_type", [
  "intro",
  "recap",
  "outro",
  "preview",
]);
export const segmentStatus = pgEnum("segment_status", [
  "pending",
  "approved",
  "rejected",
]);
export const submissionSource = pgEnum("submission_source", ["web", "api"]);

// ---------------------------------------------------------------------------
// Auth.js core tables (Drizzle adapter shape) + SkipDB extensions
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  // SkipDB extensions
  // scrypt password hash for email/password accounts (null for OAuth/email-link users)
  passwordHash: text("password_hash"),
  role: userRole("role").notNull().default("user"),
  reputation: integer("reputation").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.identifier, table.token] }),
  }),
);

// ---------------------------------------------------------------------------
// API keys — one active key per user; "reset" = revoke old + create new
// ---------------------------------------------------------------------------

export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // sha-256 hash of the full key, used for constant-time lookup
    keyHash: text("key_hash").notNull().unique(),
    // AES-256-GCM ciphertext of the full key so the owner can reveal it again
    keyCipher: text("key_cipher"),
    // short non-secret prefix shown in the UI to identify the key (e.g. skdb_a1b2)
    keyPrefix: text("key_prefix").notNull(),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  },
  (table) => ({
    byUser: index("api_keys_user_idx").on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// Titles & episodes — cached metadata from TMDB/TVDB (and manual entries)
// ---------------------------------------------------------------------------

export const titles = pgTable(
  "titles",
  {
    id: serial("id").primaryKey(),
    imdbId: text("imdb_id").notNull().unique(),
    tmdbId: integer("tmdb_id"),
    tvdbId: integer("tvdb_id"),
    mediaType: mediaType("media_type").notNull(),
    name: text("name").notNull(),
    year: integer("year"),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    overview: text("overview"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    refreshedAt: timestamp("refreshed_at", { mode: "date" }),
  },
  (table) => ({
    byImdb: uniqueIndex("titles_imdb_idx").on(table.imdbId),
  }),
);

export const episodes = pgTable(
  "episodes",
  {
    id: serial("id").primaryKey(),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    episode: integer("episode").notNull(),
    name: text("name"),
    overview: text("overview"),
    airDate: text("air_date"),
    stillUrl: text("still_url"),
    runtimeMs: bigint("runtime_ms", { mode: "number" }),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    uniq: uniqueIndex("episodes_title_season_episode_idx").on(
      table.titleId,
      table.season,
      table.episode,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Segments — the core crowdsourced data. Times stored in milliseconds.
// season/episode are null for movies.
// ---------------------------------------------------------------------------

export const segments = pgTable(
  "segments",
  {
    id: serial("id").primaryKey(),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    // denormalized for fast public reads + clean data dumps
    imdbId: text("imdb_id").notNull(),
    season: integer("season"),
    episode: integer("episode"),
    segmentType: segmentType("segment_type").notNull(),
    startMs: bigint("start_ms", { mode: "number" }).notNull(),
    endMs: bigint("end_ms", { mode: "number" }).notNull(),
    // total duration of the stream this was timed against (optional)
    durationMs: bigint("duration_ms", { mode: "number" }),
    submittedBy: text("submitted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    status: segmentStatus("status").notNull().default("pending"),
    autoApproved: boolean("auto_approved").notNull().default(false),
    source: submissionSource("source").notNull().default("web"),
    votesUp: integer("votes_up").notNull().default(0),
    votesDown: integer("votes_down").notNull().default(0),
    score: integer("score").notNull().default(0),
    reviewedBy: text("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    lookup: index("segments_lookup_idx").on(
      table.imdbId,
      table.season,
      table.episode,
      table.status,
    ),
    byTypeStatus: index("segments_type_status_idx").on(
      table.imdbId,
      table.segmentType,
      table.status,
    ),
    byTitle: index("segments_title_idx").on(table.titleId),
    byStatus: index("segments_status_idx").on(table.status),
  }),
);

// ---------------------------------------------------------------------------
// Votes — one per (segment, user). Aggregates kept on segments for fast reads.
// ---------------------------------------------------------------------------

export const votes = pgTable(
  "votes",
  {
    id: serial("id").primaryKey(),
    segmentId: integer("segment_id")
      .notNull()
      .references(() => segments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // +1 = good skip, -1 = bad skip
    value: integer("value").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    uniq: uniqueIndex("votes_segment_user_idx").on(
      table.segmentId,
      table.userId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Moderation log — audit trail for approvals/rejections/edits
// ---------------------------------------------------------------------------

export const moderationLog = pgTable("moderation_log", {
  id: serial("id").primaryKey(),
  segmentId: integer("segment_id")
    .notNull()
    .references(() => segments.id, { onDelete: "cascade" }),
  moderatorId: text("moderator_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(), // approve | reject | auto-approve | edit
  reason: text("reason"),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const titlesRelations = relations(titles, ({ many }) => ({
  episodes: many(episodes),
  segments: many(segments),
}));

export const episodesRelations = relations(episodes, ({ one }) => ({
  title: one(titles, { fields: [episodes.titleId], references: [titles.id] }),
}));

export const segmentsRelations = relations(segments, ({ one, many }) => ({
  title: one(titles, { fields: [segments.titleId], references: [titles.id] }),
  submitter: one(users, {
    fields: [segments.submittedBy],
    references: [users.id],
  }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  segment: one(segments, {
    fields: [votes.segmentId],
    references: [segments.id],
  }),
  user: one(users, { fields: [votes.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Title = typeof titles.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type Segment = typeof segments.$inferSelect;
export type Vote = typeof votes.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
