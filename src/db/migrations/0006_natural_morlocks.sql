ALTER TYPE "public"."segment_status" ADD VALUE 'disabled';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "segments_submitted_by_idx" ON "segments" USING btree ("submitted_by");