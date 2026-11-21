CREATE TYPE "bom_history_action" AS ENUM('create', 'edit', 'delete', 'release', 'retire');--> statement-breakpoint
CREATE TYPE "bom_kind" AS ENUM('casting', 'job_work', 'assembly');--> statement-breakpoint
CREATE TYPE "bom_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TABLE "bom_history" (
	"id" serial PRIMARY KEY,
	"bom_id" integer NOT NULL,
	"part_id" integer NOT NULL,
	"revision_no" integer NOT NULL,
	"action" "bom_history_action" NOT NULL,
	"changes" jsonb NOT NULL,
	"reason" text,
	"changed_by" integer NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_lines" (
	"id" serial PRIMARY KEY,
	"bom_id" integer NOT NULL,
	"component_item_id" integer NOT NULL,
	"qty_per_piece" numeric(10,3) NOT NULL,
	"buy_as_is" boolean DEFAULT false NOT NULL,
	"note" text,
	"line_no" smallint NOT NULL,
	CONSTRAINT "uq_bom_lines_bom_component" UNIQUE("bom_id","component_item_id"),
	CONSTRAINT "bom_lines_qty_positive_ck" CHECK ("qty_per_piece" > 0),
	CONSTRAINT "bom_lines_line_no_ck" CHECK ("line_no" between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "bom_part_seq" (
	"part_id" integer PRIMARY KEY,
	"last_revision_no" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boms" (
	"id" serial PRIMARY KEY,
	"part_id" integer NOT NULL,
	"revision_no" integer NOT NULL,
	"kind" "bom_kind" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "bom_status" DEFAULT 'draft'::"bom_status" NOT NULL,
	"alloy_item_id" integer,
	"net_weight_kg" numeric(10,3),
	"shot_weight_kg" numeric(10,3),
	"cavities" smallint,
	"melt_loss_pct" numeric(4,2),
	"casting_reject_pct" numeric(4,2),
	"sent_item_id" integer,
	"send_qty" integer,
	"return_qty" integer,
	"job_worker_id" integer,
	"service_id" integer,
	"job_work_loss_pct" numeric(4,2),
	"change_reason" text,
	"released_by" integer,
	"released_at" timestamp,
	"retired_by" integer,
	"retired_at" timestamp,
	"retire_reason" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_boms_part_revision" UNIQUE("part_id","revision_no"),
	CONSTRAINT "boms_cavities_ck" CHECK ("cavities" is null or "cavities" between 1 and 64),
	CONSTRAINT "boms_melt_loss_pct_ck" CHECK ("melt_loss_pct" is null or ("melt_loss_pct" >= 0 and "melt_loss_pct" < 50)),
	CONSTRAINT "boms_casting_reject_pct_ck" CHECK ("casting_reject_pct" is null or ("casting_reject_pct" >= 0 and "casting_reject_pct" < 50)),
	CONSTRAINT "boms_job_work_loss_pct_ck" CHECK ("job_work_loss_pct" is null or ("job_work_loss_pct" >= 0 and "job_work_loss_pct" < 50)),
	CONSTRAINT "boms_weights_positive_ck" CHECK (("net_weight_kg" is null or "net_weight_kg" > 0) and ("shot_weight_kg" is null or "shot_weight_kg" > 0)),
	CONSTRAINT "boms_send_return_positive_ck" CHECK (("send_qty" is null or "send_qty" > 0) and ("return_qty" is null or "return_qty" > 0)),
	CONSTRAINT "boms_shot_covers_net_ck" CHECK ("net_weight_kg" is null or "shot_weight_kg" is null or "cavities" is null or "shot_weight_kg" >= "net_weight_kg" * "cavities"),
	CONSTRAINT "boms_sent_item_not_part_ck" CHECK ("sent_item_id" is null or "sent_item_id" <> "part_id"),
	CONSTRAINT "boms_kind_casting_ck" CHECK ("kind" = 'casting' or ("alloy_item_id" is null and "net_weight_kg" is null and "shot_weight_kg" is null and "cavities" is null and "melt_loss_pct" is null and "casting_reject_pct" is null)),
	CONSTRAINT "boms_kind_job_work_ck" CHECK ("kind" = 'job_work' or ("sent_item_id" is null and "send_qty" is null and "return_qty" is null and "job_worker_id" is null and "service_id" is null and "job_work_loss_pct" is null))
);
--> statement-breakpoint
CREATE INDEX "idx_bom_history_part_changed" ON "bom_history" ("part_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_bom_lines_component_item_id" ON "bom_lines" ("component_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_boms_one_active" ON "boms" ("part_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_boms_one_draft" ON "boms" ("part_id") WHERE "status" = 'draft';--> statement-breakpoint
CREATE INDEX "idx_boms_sent_item_id" ON "boms" ("sent_item_id");--> statement-breakpoint
CREATE INDEX "idx_boms_alloy_item_id" ON "boms" ("alloy_item_id");--> statement-breakpoint
CREATE INDEX "idx_boms_job_worker_id" ON "boms" ("job_worker_id");--> statement-breakpoint
CREATE INDEX "idx_boms_service_id" ON "boms" ("service_id");--> statement-breakpoint
CREATE INDEX "idx_boms_status_kind" ON "boms" ("status","kind");--> statement-breakpoint
CREATE INDEX "idx_boms_released_at" ON "boms" ("released_at");--> statement-breakpoint
ALTER TABLE "bom_history" ADD CONSTRAINT "bom_history_part_id_item_master_id_fkey" FOREIGN KEY ("part_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "bom_history" ADD CONSTRAINT "bom_history_changed_by_employees_id_fkey" FOREIGN KEY ("changed_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_id_boms_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "boms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_component_item_id_item_master_id_fkey" FOREIGN KEY ("component_item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "bom_part_seq" ADD CONSTRAINT "bom_part_seq_part_id_item_master_id_fkey" FOREIGN KEY ("part_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_part_id_item_master_id_fkey" FOREIGN KEY ("part_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_alloy_item_id_item_master_id_fkey" FOREIGN KEY ("alloy_item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_sent_item_id_item_master_id_fkey" FOREIGN KEY ("sent_item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_job_worker_id_supplier_master_id_fkey" FOREIGN KEY ("job_worker_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_service_id_service_master_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_master"("id");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_released_by_employees_id_fkey" FOREIGN KEY ("released_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_retired_by_employees_id_fkey" FOREIGN KEY ("retired_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");