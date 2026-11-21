CREATE TYPE "rate_contract_status" AS ENUM('draft', 'active', 'terminated', 'cancelled');--> statement-breakpoint
CREATE TYPE "rfq_line_status" AS ENUM('open', 'awarded', 'dropped');--> statement-breakpoint
CREATE TYPE "rfq_quote_status" AS ENUM('draft', 'submitted', 'cancelled', 'not_awarded');--> statement-breakpoint
CREATE TYPE "rfq_status" AS ENUM('draft', 'sent', 'partially_awarded', 'awarded', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "rate_contract_items" (
	"id" serial PRIMARY KEY,
	"contract_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"uom" text NOT NULL,
	"rate_paise" bigint NOT NULL,
	"gst_percent" numeric(5,2) NOT NULL,
	"agreed_qty" numeric(14,3)
);
--> statement-breakpoint
CREATE TABLE "rate_contracts" (
	"id" serial PRIMARY KEY,
	"contract_number" text NOT NULL UNIQUE,
	"supplier_id" integer NOT NULL,
	"status" "rate_contract_status" DEFAULT 'draft'::"rate_contract_status" NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date NOT NULL,
	"allowance_percent" numeric(4,2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp,
	"activated_by" integer,
	"activated_at" timestamp,
	"terminated_on" date,
	"terminated_by" integer,
	"terminated_at" timestamp,
	"terminate_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "rfq_items" (
	"id" serial PRIMARY KEY,
	"rfq_id" integer NOT NULL,
	"pr_item_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"qty" numeric(14,3) NOT NULL,
	"uom" text NOT NULL,
	"line_status" "rfq_line_status" DEFAULT 'open'::"rfq_line_status" NOT NULL,
	"awarded_quote_item_id" integer,
	"po_item_id" integer,
	"awarded_by" integer,
	"awarded_at" timestamp,
	"award_reason" text,
	"award_lowest_landed_paise" bigint,
	"award_chosen_landed_paise" bigint,
	"dropped_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rfq_quote_items" (
	"id" serial PRIMARY KEY,
	"quote_id" integer NOT NULL,
	"rfq_item_id" integer NOT NULL,
	"is_quoted" boolean NOT NULL,
	"rate_paise" bigint,
	"gst_percent" numeric(5,2),
	"lead_days" integer,
	"freight_paise" bigint,
	"line_value_paise" bigint,
	"line_tax_paise" bigint,
	"landed_rate_paise" bigint
);
--> statement-breakpoint
CREATE TABLE "rfq_quotes" (
	"id" serial PRIMARY KEY,
	"quote_number" text NOT NULL UNIQUE,
	"rfq_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"status" "rfq_quote_status" DEFAULT 'draft'::"rfq_quote_status" NOT NULL,
	"supplier_quote_ref" text NOT NULL,
	"quote_date" date NOT NULL,
	"valid_till" date NOT NULL,
	"payment_terms_days" integer DEFAULT 0 NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp,
	"submitted_by" integer,
	"submitted_at" timestamp,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "rfq_suppliers" (
	"id" serial PRIMARY KEY,
	"rfq_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" serial PRIMARY KEY,
	"rfq_number" text NOT NULL UNIQUE,
	"status" "rfq_status" DEFAULT 'draft'::"rfq_status" NOT NULL,
	"due_date" date NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp,
	"sent_by" integer,
	"sent_at" timestamp,
	"completed_at" timestamp,
	"closed_by" integer,
	"closed_at" timestamp,
	"close_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text
);
--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "quote_item_id" integer;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "contract_item_id" integer;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "contract_rate_paise" bigint;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "rate_override_reason" text;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "rate_override_by" integer;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "rate_override_at" timestamp;--> statement-breakpoint
CREATE INDEX "idx_po_items_contract_item" ON "purchase_order_items" ("contract_item_id");--> statement-breakpoint
CREATE INDEX "idx_po_items_quote_item" ON "purchase_order_items" ("quote_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rate_contract_items_contract_item" ON "rate_contract_items" ("contract_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_rate_contract_items_item" ON "rate_contract_items" ("item_id");--> statement-breakpoint
CREATE INDEX "idx_rate_contracts_supplier_status" ON "rate_contracts" ("supplier_id","status");--> statement-breakpoint
CREATE INDEX "idx_rate_contracts_status_valid_to" ON "rate_contracts" ("status","valid_to");--> statement-breakpoint
CREATE INDEX "idx_rate_contracts_contract_number_trgm" ON "rate_contracts" USING gin ("contract_number" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rfq_items_rfq_pr_item" ON "rfq_items" ("rfq_id","pr_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rfq_items_open_pr_item" ON "rfq_items" ("pr_item_id") WHERE "line_status" = 'open';--> statement-breakpoint
CREATE INDEX "idx_rfq_items_rfq" ON "rfq_items" ("rfq_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_items_item" ON "rfq_items" ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rfq_items_awarded_quote_item" ON "rfq_items" ("awarded_quote_item_id") WHERE "awarded_quote_item_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_rfq_items_po_item" ON "rfq_items" ("po_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rfq_quote_items_quote_rfq_item" ON "rfq_quote_items" ("quote_id","rfq_item_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_quote_items_rfq_item" ON "rfq_quote_items" ("rfq_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rfq_quotes_live" ON "rfq_quotes" ("rfq_id","supplier_id") WHERE "status" in ('draft', 'submitted');--> statement-breakpoint
CREATE INDEX "idx_rfq_quotes_rfq_status" ON "rfq_quotes" ("rfq_id","status");--> statement-breakpoint
CREATE INDEX "idx_rfq_quotes_supplier" ON "rfq_quotes" ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_quotes_quote_number_trgm" ON "rfq_quotes" USING gin ("quote_number" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rfq_suppliers_rfq_supplier" ON "rfq_suppliers" ("rfq_id","supplier_id");--> statement-breakpoint
CREATE INDEX "idx_rfq_suppliers_supplier" ON "rfq_suppliers" ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_rfqs_status" ON "rfqs" ("status");--> statement-breakpoint
CREATE INDEX "idx_rfqs_created_at" ON "rfqs" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_rfqs_rfq_number_trgm" ON "rfqs" USING gin ("rfq_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_rfqs_notes_trgm" ON "rfqs" USING gin ("notes" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_quote_item_id_rfq_quote_items_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "rfq_quote_items"("id");--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_QkseR1Dit64F_fkey" FOREIGN KEY ("contract_item_id") REFERENCES "rate_contract_items"("id");--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_rate_override_by_employees_id_fkey" FOREIGN KEY ("rate_override_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rate_contract_items" ADD CONSTRAINT "rate_contract_items_contract_id_rate_contracts_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "rate_contracts"("id");--> statement-breakpoint
ALTER TABLE "rate_contract_items" ADD CONSTRAINT "rate_contract_items_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "rate_contracts" ADD CONSTRAINT "rate_contracts_supplier_id_supplier_master_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "rate_contracts" ADD CONSTRAINT "rate_contracts_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rate_contracts" ADD CONSTRAINT "rate_contracts_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rate_contracts" ADD CONSTRAINT "rate_contracts_activated_by_employees_id_fkey" FOREIGN KEY ("activated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rate_contracts" ADD CONSTRAINT "rate_contracts_terminated_by_employees_id_fkey" FOREIGN KEY ("terminated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rate_contracts" ADD CONSTRAINT "rate_contracts_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_rfq_id_rfqs_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id");--> statement-breakpoint
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_pr_item_id_purchase_request_items_id_fkey" FOREIGN KEY ("pr_item_id") REFERENCES "purchase_request_items"("id");--> statement-breakpoint
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_po_item_id_purchase_order_items_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "purchase_order_items"("id");--> statement-breakpoint
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_awarded_by_employees_id_fkey" FOREIGN KEY ("awarded_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rfq_quote_items" ADD CONSTRAINT "rfq_quote_items_quote_id_rfq_quotes_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "rfq_quotes"("id");--> statement-breakpoint
ALTER TABLE "rfq_quote_items" ADD CONSTRAINT "rfq_quote_items_rfq_item_id_rfq_items_id_fkey" FOREIGN KEY ("rfq_item_id") REFERENCES "rfq_items"("id");--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_rfq_id_rfqs_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id");--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_supplier_id_supplier_master_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_submitted_by_employees_id_fkey" FOREIGN KEY ("submitted_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rfq_suppliers" ADD CONSTRAINT "rfq_suppliers_rfq_id_rfqs_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id");--> statement-breakpoint
ALTER TABLE "rfq_suppliers" ADD CONSTRAINT "rfq_suppliers_supplier_id_supplier_master_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_sent_by_employees_id_fkey" FOREIGN KEY ("sent_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_closed_by_employees_id_fkey" FOREIGN KEY ("closed_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");