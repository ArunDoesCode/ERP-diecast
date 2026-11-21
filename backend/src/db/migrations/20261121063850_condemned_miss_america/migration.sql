CREATE TYPE "explosion_row_type" AS ENUM('cast', 'job_work', 'assemble', 'buy');--> statement-breakpoint
CREATE TYPE "explosion_status" AS ENUM('current', 'superseded');--> statement-breakpoint
CREATE TYPE "reservation_kind" AS ENUM('stock', 'open_pr', 'open_po', 'open_sco');--> statement-breakpoint
CREATE TYPE "so_close_kind" AS ENUM('manual', 'fully_delivered');--> statement-breakpoint
CREATE TYPE "so_status" AS ENUM('draft', 'confirmed', 'on_hold', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"state_code" text NOT NULL,
	"address" text NOT NULL,
	"gstin" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_state_code_ck" CHECK ("state_code" ~ '^[0-9]{2}$'),
	CONSTRAINT "customers_gstin_ck" CHECK ("gstin" is null or "gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
);
--> statement-breakpoint
CREATE TABLE "sale_explosion_rows" (
	"id" serial PRIMARY KEY,
	"explosion_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"level" smallint NOT NULL,
	"row_type" "explosion_row_type" NOT NULL,
	"tag" text,
	"block_reason" text,
	"bom_revision_id" integer,
	"uom" text NOT NULL,
	"gross_qty" numeric(14,3) NOT NULL,
	"on_hand_qty" numeric(14,3) NOT NULL,
	"reserved_other_qty" numeric(14,3) NOT NULL,
	"open_pr_qty" numeric(14,3) NOT NULL,
	"open_po_qty" numeric(14,3) NOT NULL,
	"open_sco_qty" numeric(14,3) NOT NULL,
	"late_supply_qty" numeric(14,3) NOT NULL,
	"net_qty" numeric(14,3) NOT NULL,
	"pour_qty" numeric(14,3),
	"send_qty" numeric(14,3),
	"required_by" date NOT NULL,
	"pr_item_id" integer,
	"sco_item_id" integer,
	"raised_qty" numeric(14,3),
	"raised_by" integer,
	"raised_at" timestamp,
	CONSTRAINT "uq_sale_explosion_rows_explosion_item" UNIQUE("explosion_id","item_id"),
	CONSTRAINT "sale_explosion_rows_level_ck" CHECK ("level" between 1 and 10),
	CONSTRAINT "sale_explosion_rows_net_ck" CHECK ("net_qty" >= 0),
	CONSTRAINT "sale_explosion_rows_one_doc_ck" CHECK ("pr_item_id" is null or "sco_item_id" is null)
);
--> statement-breakpoint
CREATE TABLE "sale_explosion_sources" (
	"id" serial PRIMARY KEY,
	"row_id" integer NOT NULL,
	"so_line_id" integer NOT NULL,
	"via_item_id" integer,
	"qty" numeric(14,3) NOT NULL,
	CONSTRAINT "sale_explosion_sources_qty_ck" CHECK ("qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_explosions" (
	"id" serial PRIMARY KEY,
	"so_id" integer NOT NULL,
	"run_no" integer NOT NULL,
	"status" "explosion_status" DEFAULT 'current'::"explosion_status" NOT NULL,
	"so_need_version" integer NOT NULL,
	"so_delivery_version" integer NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"superseded_at" timestamp,
	CONSTRAINT "uq_sale_explosions_so_run" UNIQUE("so_id","run_no")
);
--> statement-breakpoint
CREATE TABLE "sale_order_lines" (
	"id" serial PRIMARY KEY,
	"so_id" integer NOT NULL,
	"line_no" integer NOT NULL,
	"removed_at" timestamp,
	"removed_by" integer,
	"item_id" integer NOT NULL,
	"uom" text NOT NULL,
	"qty" numeric(14,3) NOT NULL,
	"unit_price_paise" bigint NOT NULL,
	"line_amount_paise" bigint NOT NULL,
	"gst_percent" numeric(5,2) NOT NULL,
	"delivery_date" date NOT NULL,
	"delivered_qty" numeric(14,3) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_sale_order_lines_so_line_no" UNIQUE("so_id","line_no"),
	CONSTRAINT "sale_order_lines_qty_ck" CHECK ("qty" > 0),
	CONSTRAINT "sale_order_lines_price_ck" CHECK ("unit_price_paise" >= 0 and "line_amount_paise" >= 0),
	CONSTRAINT "sale_order_lines_delivered_ck" CHECK ("delivered_qty" >= 0 and "delivered_qty" <= "qty")
);
--> statement-breakpoint
CREATE TABLE "sale_orders" (
	"id" serial PRIMARY KEY,
	"so_number" text NOT NULL CONSTRAINT "uq_sale_orders_so_number" UNIQUE,
	"customer_id" integer NOT NULL,
	"status" "so_status" DEFAULT 'draft'::"so_status" NOT NULL,
	"order_date" date NOT NULL,
	"customer_po_number" text,
	"customer_po_date" date,
	"notes" text,
	"ship_to_address" text,
	"ship_to_state_code" text,
	"total_amount_paise" bigint DEFAULT 0 NOT NULL,
	"edit_version" integer DEFAULT 0 NOT NULL,
	"need_version" integer DEFAULT 0 NOT NULL,
	"delivery_version" integer DEFAULT 0 NOT NULL,
	"last_line_no" integer DEFAULT 0 NOT NULL,
	"confirmed_by" integer,
	"confirmed_at" timestamp,
	"hold_reason" text,
	"held_by" integer,
	"held_at" timestamp,
	"close_kind" "so_close_kind",
	"close_reason" text,
	"closed_by" integer,
	"closed_at" timestamp,
	"cancel_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sale_orders_total_ck" CHECK ("total_amount_paise" >= 0),
	CONSTRAINT "sale_orders_ship_to_ck" CHECK ("ship_to_address" is null or "ship_to_state_code" is not null)
);
--> statement-breakpoint
CREATE TABLE "sale_reservations" (
	"id" serial PRIMARY KEY,
	"row_id" integer NOT NULL,
	"so_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"kind" "reservation_kind" NOT NULL,
	"pr_item_id" integer,
	"po_item_id" integer,
	"sco_item_id" integer,
	"qty" numeric(14,3) NOT NULL,
	"released_at" timestamp,
	CONSTRAINT "sale_reservations_qty_ck" CHECK ("qty" > 0),
	CONSTRAINT "sale_reservations_kind_ref_ck" CHECK (("kind" = 'stock' and "pr_item_id" is null and "po_item_id" is null and "sco_item_id" is null)
        or ("kind" = 'open_pr' and "pr_item_id" is not null and "po_item_id" is null and "sco_item_id" is null)
        or ("kind" = 'open_po' and "po_item_id" is not null and "pr_item_id" is null and "sco_item_id" is null)
        or ("kind" = 'open_sco' and "sco_item_id" is not null and "pr_item_id" is null and "po_item_id" is null))
);
--> statement-breakpoint
CREATE TABLE "sales_audit_log" (
	"id" serial PRIMARY KEY,
	"actor_id" integer NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" integer NOT NULL,
	"so_id" integer,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_pr_items_item_open" ON "purchase_request_items" ("item_id") WHERE "status" in ('pending', 'po_draft');--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_sale_order_id" ON "purchase_requests" ("sale_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_customers_name_norm" ON "customers" (lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "idx_customers_name_trgm" ON "customers" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sale_explosion_rows_pr_item" ON "sale_explosion_rows" ("pr_item_id") WHERE "pr_item_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sale_explosion_rows_sco_item" ON "sale_explosion_rows" ("sco_item_id") WHERE "sco_item_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_sale_explosion_rows_item_id" ON "sale_explosion_rows" ("item_id");--> statement-breakpoint
CREATE INDEX "idx_sale_explosion_rows_bom_revision_id" ON "sale_explosion_rows" ("bom_revision_id");--> statement-breakpoint
CREATE INDEX "idx_sale_explosion_sources_row_id" ON "sale_explosion_sources" ("row_id");--> statement-breakpoint
CREATE INDEX "idx_sale_explosion_sources_so_line_id" ON "sale_explosion_sources" ("so_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sale_explosions_one_current" ON "sale_explosions" ("so_id") WHERE "status" = 'current';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sale_order_lines_so_item_date" ON "sale_order_lines" ("so_id","item_id","delivery_date") WHERE "removed_at" is null;--> statement-breakpoint
CREATE INDEX "idx_sale_order_lines_item_id" ON "sale_order_lines" ("item_id");--> statement-breakpoint
CREATE INDEX "idx_sale_order_lines_open_delivery" ON "sale_order_lines" ("delivery_date") WHERE "removed_at" is null and "delivered_qty" < "qty";--> statement-breakpoint
CREATE INDEX "idx_sale_orders_status_created" ON "sale_orders" ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_sale_orders_customer_id" ON "sale_orders" ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_sale_orders_order_date" ON "sale_orders" ("order_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_sale_orders_status_order_date" ON "sale_orders" ("status","order_date");--> statement-breakpoint
CREATE INDEX "idx_sale_orders_so_number_trgm" ON "sale_orders" USING gin ("so_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_sale_orders_customer_po_trgm" ON "sale_orders" USING gin ("customer_po_number" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sale_orders_customer_po" ON "sale_orders" ("customer_id",lower(btrim("customer_po_number"))) WHERE "status" <> 'cancelled' and "customer_po_number" is not null;--> statement-breakpoint
CREATE INDEX "idx_sale_reservations_row_id" ON "sale_reservations" ("row_id");--> statement-breakpoint
CREATE INDEX "idx_sale_reservations_stock_item" ON "sale_reservations" ("item_id") WHERE "kind" = 'stock' and "released_at" is null;--> statement-breakpoint
CREATE INDEX "idx_sale_reservations_pr_item" ON "sale_reservations" ("pr_item_id") WHERE "released_at" is null;--> statement-breakpoint
CREATE INDEX "idx_sale_reservations_po_item" ON "sale_reservations" ("po_item_id") WHERE "released_at" is null;--> statement-breakpoint
CREATE INDEX "idx_sale_reservations_sco_item" ON "sale_reservations" ("sco_item_id") WHERE "released_at" is null;--> statement-breakpoint
CREATE INDEX "idx_sale_reservations_so_id" ON "sale_reservations" ("so_id") WHERE "released_at" is null;--> statement-breakpoint
CREATE INDEX "idx_sales_audit_log_so_at" ON "sales_audit_log" ("so_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_sales_audit_log_target" ON "sales_audit_log" ("target_type","target_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_sales_audit_log_actor_id" ON "sales_audit_log" ("actor_id");--> statement-breakpoint
-- Hand-edited (design/data.md migration notes 2-3): no SO table existed, so every old sale_order_id is an orphan.
UPDATE "purchase_requests" SET "notes" = concat_ws(' ', "notes", '(old SO ref ' || "sale_order_id" || ')'), "sale_order_id" = NULL WHERE "sale_order_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_sale_order_id_sale_orders_id_fkey" FOREIGN KEY ("sale_order_id") REFERENCES "sale_orders"("id") NOT VALID;--> statement-breakpoint
ALTER TABLE "purchase_requests" VALIDATE CONSTRAINT "purchase_requests_sale_order_id_sale_orders_id_fkey";--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_explosion_rows" ADD CONSTRAINT "sale_explosion_rows_explosion_id_sale_explosions_id_fkey" FOREIGN KEY ("explosion_id") REFERENCES "sale_explosions"("id");--> statement-breakpoint
ALTER TABLE "sale_explosion_rows" ADD CONSTRAINT "sale_explosion_rows_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "sale_explosion_rows" ADD CONSTRAINT "sale_explosion_rows_bom_revision_id_boms_id_fkey" FOREIGN KEY ("bom_revision_id") REFERENCES "boms"("id");--> statement-breakpoint
ALTER TABLE "sale_explosion_rows" ADD CONSTRAINT "sale_explosion_rows_pr_item_id_purchase_request_items_id_fkey" FOREIGN KEY ("pr_item_id") REFERENCES "purchase_request_items"("id");--> statement-breakpoint
ALTER TABLE "sale_explosion_rows" ADD CONSTRAINT "sale_explosion_rows_tkjJW9g2QojO_fkey" FOREIGN KEY ("sco_item_id") REFERENCES "subcontracting_order_items"("id");--> statement-breakpoint
ALTER TABLE "sale_explosion_rows" ADD CONSTRAINT "sale_explosion_rows_raised_by_employees_id_fkey" FOREIGN KEY ("raised_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_explosion_sources" ADD CONSTRAINT "sale_explosion_sources_row_id_sale_explosion_rows_id_fkey" FOREIGN KEY ("row_id") REFERENCES "sale_explosion_rows"("id");--> statement-breakpoint
ALTER TABLE "sale_explosion_sources" ADD CONSTRAINT "sale_explosion_sources_so_line_id_sale_order_lines_id_fkey" FOREIGN KEY ("so_line_id") REFERENCES "sale_order_lines"("id");--> statement-breakpoint
ALTER TABLE "sale_explosion_sources" ADD CONSTRAINT "sale_explosion_sources_via_item_id_item_master_id_fkey" FOREIGN KEY ("via_item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "sale_explosions" ADD CONSTRAINT "sale_explosions_so_id_sale_orders_id_fkey" FOREIGN KEY ("so_id") REFERENCES "sale_orders"("id");--> statement-breakpoint
ALTER TABLE "sale_explosions" ADD CONSTRAINT "sale_explosions_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_order_lines" ADD CONSTRAINT "sale_order_lines_so_id_sale_orders_id_fkey" FOREIGN KEY ("so_id") REFERENCES "sale_orders"("id");--> statement-breakpoint
ALTER TABLE "sale_order_lines" ADD CONSTRAINT "sale_order_lines_removed_by_employees_id_fkey" FOREIGN KEY ("removed_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_order_lines" ADD CONSTRAINT "sale_order_lines_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "sale_order_lines" ADD CONSTRAINT "sale_order_lines_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_order_lines" ADD CONSTRAINT "sale_order_lines_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_confirmed_by_employees_id_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_held_by_employees_id_fkey" FOREIGN KEY ("held_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_closed_by_employees_id_fkey" FOREIGN KEY ("closed_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sale_reservations" ADD CONSTRAINT "sale_reservations_row_id_sale_explosion_rows_id_fkey" FOREIGN KEY ("row_id") REFERENCES "sale_explosion_rows"("id");--> statement-breakpoint
ALTER TABLE "sale_reservations" ADD CONSTRAINT "sale_reservations_so_id_sale_orders_id_fkey" FOREIGN KEY ("so_id") REFERENCES "sale_orders"("id");--> statement-breakpoint
ALTER TABLE "sale_reservations" ADD CONSTRAINT "sale_reservations_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "sale_reservations" ADD CONSTRAINT "sale_reservations_pr_item_id_purchase_request_items_id_fkey" FOREIGN KEY ("pr_item_id") REFERENCES "purchase_request_items"("id");--> statement-breakpoint
ALTER TABLE "sale_reservations" ADD CONSTRAINT "sale_reservations_po_item_id_purchase_order_items_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "purchase_order_items"("id");--> statement-breakpoint
ALTER TABLE "sale_reservations" ADD CONSTRAINT "sale_reservations_jTy5RnslOmaS_fkey" FOREIGN KEY ("sco_item_id") REFERENCES "subcontracting_order_items"("id");--> statement-breakpoint
ALTER TABLE "sales_audit_log" ADD CONSTRAINT "sales_audit_log_actor_id_employees_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sales_audit_log" ADD CONSTRAINT "sales_audit_log_so_id_sale_orders_id_fkey" FOREIGN KEY ("so_id") REFERENCES "sale_orders"("id");