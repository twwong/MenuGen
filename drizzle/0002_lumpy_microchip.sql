ALTER TABLE "quota_ledger" DROP CONSTRAINT "quota_ledger_menu_id_menus_id_fk";
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "source_file_order" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "page_index" integer;--> statement-breakpoint
ALTER TABLE "deletion_audits" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "deletion_audits" ADD COLUMN "business_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD COLUMN "regeneration_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "business_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "public_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "extraction_workflow_run_id" text;--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "source_cleanup_workflow_run_id" text;--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "result_expiration_workflow_run_id" text;--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "source_deletion_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "preflight_assessment" jsonb;--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "estimated_cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_object_key_uq" ON "assets" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_audits_business_key_uq" ON "deletion_audits" USING btree ("business_key");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_business_key_uq" ON "jobs" USING btree ("business_key");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_public_id_uq" ON "menu_items" USING btree ("public_id");