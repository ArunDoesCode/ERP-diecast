CREATE TYPE "reorder_item_outcome" AS ENUM('raised', 'needs_reorder_qty', 'invalid_line', 'deferred');--> statement-breakpoint
CREATE TYPE "reorder_run_state" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "reorder_run_trigger" AS ENUM('schedule', 'manual');--> statement-breakpoint
CREATE TABLE "reorder_run_items" (
	"id" serial PRIMARY KEY,
	"run_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"outcome" "reorder_item_outcome" NOT NULL,
	"uom" text NOT NULL,
	"usable_qty" numeric(14,3) NOT NULL,
	"on_the_way_qty" numeric(14,3) NOT NULL,
	"projected_qty" numeric(14,3) NOT NULL,
	"reorder_level" numeric(14,3) NOT NULL,
	"reorder_qty" numeric(14,3) NOT NULL,
	"order_qty" numeric(14,3),
	"pr_item_id" integer
);
--> statement-breakpoint
CREATE TABLE "reorder_runs" (
	"id" serial PRIMARY KEY,
	"trigger" "reorder_run_trigger" NOT NULL,
	"state" "reorder_run_state" NOT NULL,
	"started_by" integer,
	"scheduled_day" date,
	"draft_owner_id" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"items_checked" integer DEFAULT 0 NOT NULL,
	"items_raised" integer DEFAULT 0 NOT NULL,
	"items_skipped" integer DEFAULT 0 NOT NULL,
	"items_deferred" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	CONSTRAINT "reorder_runs_finished_ck" CHECK (("state" = 'running') = ("finished_at" is null)),
	CONSTRAINT "reorder_runs_failure_reason_ck" CHECK ("failure_reason" is null or char_length("failure_reason") <= 500)
);
--> statement-breakpoint
CREATE TABLE "reorder_settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"enabled" boolean DEFAULT false NOT NULL,
	"run_hour" smallint DEFAULT 7 NOT NULL,
	"draft_owner_id" integer,
	"schedule_changed_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reorder_settings_single_row" CHECK ("id" = 1),
	CONSTRAINT "reorder_settings_run_hour_ck" CHECK ("run_hour" between 0 and 23)
);
--> statement-breakpoint
CREATE TABLE "reorder_settings_history" (
	"id" serial PRIMARY KEY,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_master" ADD COLUMN "reorder_qty" numeric(14,3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "item_master" ADD COLUMN "min_order_qty" numeric(14,3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "item_master" ADD COLUMN "order_multiple" numeric(14,3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "reorder_run_id" integer;--> statement-breakpoint
CREATE INDEX "idx_item_master_reorder" ON "item_master" ("id") WHERE "reorder_level" > 0;--> statement-breakpoint
CREATE INDEX "idx_pr_items_pending_item" ON "purchase_request_items" ("item_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_purchase_requests_reorder_run" ON "purchase_requests" ("reorder_run_id") WHERE "reorder_run_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reorder_run_items_run_item" ON "reorder_run_items" ("run_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_reorder_run_items_item_id" ON "reorder_run_items" ("item_id");--> statement-breakpoint
CREATE INDEX "idx_reorder_run_items_pr_item_id" ON "reorder_run_items" ("pr_item_id") WHERE "pr_item_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reorder_runs_one_running" ON "reorder_runs" ("state") WHERE "state" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reorder_runs_schedule_day" ON "reorder_runs" ("scheduled_day") WHERE "trigger" = 'schedule';--> statement-breakpoint
CREATE INDEX "idx_reorder_runs_started_at" ON "reorder_runs" ("started_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_reorder_runs_state_started" ON "reorder_runs" ("state","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_reorder_runs_started_by" ON "reorder_runs" ("started_by");--> statement-breakpoint
CREATE INDEX "idx_reorder_runs_draft_owner_id" ON "reorder_runs" ("draft_owner_id");--> statement-breakpoint
CREATE INDEX "idx_reorder_settings_history_created_at" ON "reorder_settings_history" ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_reorder_run_id_reorder_runs_id_fkey" FOREIGN KEY ("reorder_run_id") REFERENCES "reorder_runs"("id");--> statement-breakpoint
ALTER TABLE "reorder_run_items" ADD CONSTRAINT "reorder_run_items_run_id_reorder_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "reorder_runs"("id");--> statement-breakpoint
ALTER TABLE "reorder_run_items" ADD CONSTRAINT "reorder_run_items_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "reorder_run_items" ADD CONSTRAINT "reorder_run_items_pr_item_id_purchase_request_items_id_fkey" FOREIGN KEY ("pr_item_id") REFERENCES "purchase_request_items"("id");--> statement-breakpoint
ALTER TABLE "reorder_runs" ADD CONSTRAINT "reorder_runs_started_by_employees_id_fkey" FOREIGN KEY ("started_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "reorder_runs" ADD CONSTRAINT "reorder_runs_draft_owner_id_employees_id_fkey" FOREIGN KEY ("draft_owner_id") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "reorder_settings" ADD CONSTRAINT "reorder_settings_draft_owner_id_employees_id_fkey" FOREIGN KEY ("draft_owner_id") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "reorder_settings" ADD CONSTRAINT "reorder_settings_updated_by_employees_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "reorder_settings_history" ADD CONSTRAINT "reorder_settings_history_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "item_master" ADD CONSTRAINT "item_master_reorder_qty_ck" CHECK ("reorder_qty" >= 0);--> statement-breakpoint
ALTER TABLE "item_master" ADD CONSTRAINT "item_master_min_order_qty_ck" CHECK ("min_order_qty" >= 0);--> statement-breakpoint
ALTER TABLE "item_master" ADD CONSTRAINT "item_master_order_multiple_ck" CHECK ("order_multiple" >= 0);--> statement-breakpoint
-- BR-RO-20: the one settings row (off, 07:00 IST, no owner), as the migration is the only writer of the insert.
INSERT INTO "reorder_settings" ("id", "enabled", "run_hour") VALUES (1, false, 7) ON CONFLICT ("id") DO NOTHING;
