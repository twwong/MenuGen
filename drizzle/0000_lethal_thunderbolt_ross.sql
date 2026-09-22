CREATE TYPE "public"."asset_kind" AS ENUM('source', 'normalized_page', 'source_photo_crop', 'generated_image');--> statement-breakpoint
CREATE TYPE "public"."asset_state" AS ENUM('pending', 'ready', 'deleting', 'deleted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."item_state" AS ENUM('pending', 'source_photo_ready', 'generation_eligible', 'generating', 'generated', 'failed', 'not_eligible');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('queued', 'running', 'succeeded', 'partially_succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."menu_state" AS ENUM('uploading', 'preflight', 'extracting', 'review_ready', 'generation_ready', 'generating', 'ready', 'deleting', 'deleted', 'failed');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"item_id" text,
	"kind" "asset_kind" NOT NULL,
	"state" "asset_state" DEFAULT 'pending' NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"source_candidate_id" text,
	"expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"asset_kind" "asset_kind" NOT NULL,
	"outcome" text NOT NULL,
	"sanitized_error_code" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retain_until" timestamp with time zone NOT NULL,
	"content_free" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"menu_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"resend_id" text,
	"sent_at" timestamp with time zone,
	"sanitized_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"revision_id" uuid NOT NULL,
	"request_key" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"requested_by" text NOT NULL,
	"state" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"template_version" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"moderation_result" text NOT NULL,
	"estimated_cost_usd" numeric(10, 6) NOT NULL,
	"sanitized_error_code" text,
	"provider_request_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"state" "job_state" DEFAULT 'queued' NOT NULL,
	"workflow_run_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"sanitized_error_code" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"menu_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"state" "item_state" DEFAULT 'pending' NOT NULL,
	"active_asset_id" uuid,
	"uploader_regeneration_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_menu_id_item_id_pk" PRIMARY KEY("menu_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "menu_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"menu_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"based_on_revision_id" uuid,
	"snapshot" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"source_file_order" integer NOT NULL,
	"original_file_name" text NOT NULL,
	"normalized_mime_type" text,
	"byte_size" integer NOT NULL,
	"page_count" integer,
	"object_key" text NOT NULL,
	"scanner_assembly_id" text,
	"malware_status" text DEFAULT 'pending' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"anonymous_token_hash" text,
	"target_language" text NOT NULL,
	"state" "menu_state" DEFAULT 'uploading' NOT NULL,
	"current_revision_id" uuid,
	"generation_revision_id" uuid,
	"generation_workflow_run_id" text,
	"result_expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"image_count" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(10, 6) NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"menu_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"business_key" text NOT NULL,
	"reason_code" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_creator_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."creator_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_revisions" ADD CONSTRAINT "menu_revisions_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_revisions" ADD CONSTRAINT "menu_revisions_created_by_user_id_creator_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."creator_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_sources" ADD CONSTRAINT "menu_sources_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_owner_user_id_creator_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."creator_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_ledger" ADD CONSTRAINT "quota_ledger_user_id_creator_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."creator_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_ledger" ADD CONSTRAINT "quota_ledger_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_menu_kind_idx" ON "assets" USING btree ("menu_id","kind");--> statement-breakpoint
CREATE INDEX "assets_expiry_idx" ON "assets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_users_clerk_id_uq" ON "creator_users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "deletion_audits_retention_idx" ON "deletion_audits" USING btree ("retain_until");--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_event_key_uq" ON "email_outbox" USING btree ("event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_attempts_request_key_uq" ON "generation_attempts" USING btree ("request_key");--> statement-breakpoint
CREATE INDEX "generation_attempts_item_idx" ON "generation_attempts" USING btree ("menu_id","item_id");--> statement-breakpoint
CREATE INDEX "jobs_menu_state_idx" ON "jobs" USING btree ("menu_id","state");--> statement-breakpoint
CREATE INDEX "menu_items_state_idx" ON "menu_items" USING btree ("menu_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_revisions_number_uq" ON "menu_revisions" USING btree ("menu_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_sources_order_uq" ON "menu_sources" USING btree ("menu_id","source_file_order");--> statement-breakpoint
CREATE INDEX "menus_owner_user_idx" ON "menus" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "menus_state_idx" ON "menus" USING btree ("state");--> statement-breakpoint
CREATE INDEX "menus_result_expiry_idx" ON "menus" USING btree ("result_expires_at");--> statement-breakpoint
CREATE INDEX "provider_usage_menu_idx" ON "provider_usage" USING btree ("menu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_ledger_business_key_uq" ON "quota_ledger" USING btree ("business_key");--> statement-breakpoint
CREATE INDEX "quota_ledger_user_time_idx" ON "quota_ledger" USING btree ("user_id","occurred_at");