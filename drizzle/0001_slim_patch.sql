CREATE TYPE "public"."email_outbox_state" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."generation_attempt_state" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."generation_requested_by" AS ENUM('initial', 'uploader_regeneration');--> statement-breakpoint
CREATE TYPE "public"."moderation_result" AS ENUM('allowed', 'blocked', 'error');--> statement-breakpoint
CREATE TYPE "public"."quota_entry_kind" AS ENUM('reservation', 'consumption', 'release', 'adjustment');--> statement-breakpoint
ALTER TABLE "email_outbox" ALTER COLUMN "state" SET DEFAULT 'pending'::"public"."email_outbox_state";--> statement-breakpoint
ALTER TABLE "email_outbox" ALTER COLUMN "state" SET DATA TYPE "public"."email_outbox_state" USING "state"::"public"."email_outbox_state";--> statement-breakpoint
ALTER TABLE "generation_attempts" ALTER COLUMN "requested_by" SET DATA TYPE "public"."generation_requested_by" USING "requested_by"::"public"."generation_requested_by";--> statement-breakpoint
ALTER TABLE "generation_attempts" ALTER COLUMN "state" SET DATA TYPE "public"."generation_attempt_state" USING "state"::"public"."generation_attempt_state";--> statement-breakpoint
ALTER TABLE "generation_attempts" ALTER COLUMN "moderation_result" SET DATA TYPE "public"."moderation_result" USING "moderation_result"::"public"."moderation_result";--> statement-breakpoint
ALTER TABLE "quota_ledger" ALTER COLUMN "kind" SET DATA TYPE "public"."quota_entry_kind" USING "kind"::"public"."quota_entry_kind";--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_exactly_one_owner_check" CHECK (("menus"."owner_user_id" is not null) <> ("menus"."anonymous_token_hash" is not null));