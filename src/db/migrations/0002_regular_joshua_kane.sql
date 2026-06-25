CREATE TABLE IF NOT EXISTS "resolved_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"imdb_id" text NOT NULL,
	"title_id" integer NOT NULL,
	"season" integer,
	"episode" integer,
	"segment_type" "segment_type" NOT NULL,
	"segment_id" integer NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"duration_ms" bigint,
	"votes_up" integer DEFAULT 0 NOT NULL,
	"votes_down" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "key_cipher" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resolved_segments" ADD CONSTRAINT "resolved_segments_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resolved_segments" ADD CONSTRAINT "resolved_segments_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resolved_lookup_idx" ON "resolved_segments" USING btree ("imdb_id","season","episode");