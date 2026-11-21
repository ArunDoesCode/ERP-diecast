DO $$ BEGIN IF EXISTS (SELECT 1 FROM "supplier_invoices" si LEFT JOIN "purchase_orders" po ON po.id = si.po_id WHERE si.po_id IS NULL OR po.id IS NULL OR po.supplier_id IS NULL) THEN RAISE EXCEPTION 'supplier_invoices has a row with no PO or supplier: fix or remove it before this migration (BR-SINV data design)'; END IF; END $$;--> statement-breakpoint
CREATE TYPE "supplier_invoice_charge_type" AS ENUM('freight', 'packing', 'tooling', 'other');--> statement-breakpoint
CREATE TYPE "supplier_invoice_history_action" AS ENUM('create', 'edit', 'submit', 'back_to_draft', 'release', 'cancel', 'delete');--> statement-breakpoint
CREATE TYPE "supplier_invoice_line_kind" AS ENUM('item', 'charge');--> statement-breakpoint
CREATE TYPE "supplier_invoice_mismatch_check" AS ENUM('qty', 'price', 'tax', 'tax_rate', 'total', 'charge');--> statement-breakpoint
CREATE TYPE "supplier_invoice_mismatch_unit" AS ENUM('paise', 'milli_qty', 'bp');--> statement-breakpoint
CREATE TYPE "supplier_invoice_status" AS ENUM('draft', 'blocked', 'approved', 'cancelled', 'legacy');--> statement-breakpoint
CREATE TYPE "supplier_invoice_tax_type" AS ENUM('cgst_sgst', 'igst', 'none');--> statement-breakpoint
CREATE TABLE "supplier_invoice_history" (
	"id" serial PRIMARY KEY,
	"invoice_id" integer,
	"our_number" text NOT NULL,
	"action" "supplier_invoice_history_action" NOT NULL,
	"from_status" "supplier_invoice_status",
	"to_status" "supplier_invoice_status",
	"reason" text,
	"detail" jsonb,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_lines" (
	"id" serial PRIMARY KEY,
	"invoice_id" integer NOT NULL,
	"line_no" smallint NOT NULL,
	"kind" "supplier_invoice_line_kind" NOT NULL,
	"grn_item_id" integer,
	"charge_type" "supplier_invoice_charge_type",
	"description" text,
	"uom" text,
	"qty" numeric(14,3),
	"rate_paise" bigint,
	"gst_bp" integer NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"po_rate_paise" bigint,
	"po_gst_bp" integer,
	"billable_qty" numeric(14,3),
	"below_po_rate" boolean DEFAULT false NOT NULL,
	CONSTRAINT "chk_sinv_lines_kind_grn_item" CHECK ((kind = 'item') = (grn_item_id is not null))
);
--> statement-breakpoint
CREATE TABLE "supplier_invoice_mismatches" (
	"id" serial PRIMARY KEY,
	"invoice_id" integer NOT NULL,
	"line_id" integer,
	"check" "supplier_invoice_mismatch_check" NOT NULL,
	"expected" bigint NOT NULL,
	"billed" bigint NOT NULL,
	"unit" "supplier_invoice_mismatch_unit" NOT NULL,
	"head" text
);
--> statement-breakpoint
DROP INDEX "idx_supplier_invoices_po_id";--> statement-breakpoint
DROP INDEX "uq_supplier_invoice_number";--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "our_number" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "status" "supplier_invoice_status" DEFAULT 'legacy'::"supplier_invoice_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ALTER COLUMN "status" SET DEFAULT 'draft'::"supplier_invoice_status";--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "printed_taxable_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "printed_cgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "printed_sgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "printed_igst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "taxable_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "cgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "sgst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "igst_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "total_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "tax_type" "supplier_invoice_tax_type";--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "supplier_gstin" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "supplier_state_code" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "plant_state_code" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "reverse_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "itc_ineligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "payment_terms_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "price_tol_bp_used" smallint;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "weight_tol_bp_used" smallint;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "submitted_by" integer;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "released_by" integer;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "released_at" timestamp;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "release_reason" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "cancelled_by" integer;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "last_updated_by" integer;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "last_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "price_tolerance_bp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "weight_tolerance_bp" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" DROP COLUMN "match_status";--> statement-breakpoint
ALTER TABLE "supplier_invoices" ALTER COLUMN "invoice_date" SET DATA TYPE date USING ("invoice_date" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date;--> statement-breakpoint
UPDATE "supplier_invoices" si SET "supplier_id" = po.supplier_id, "payment_terms_days" = COALESCE(po.payment_terms_days, 0), "our_number" = 'LEGACY-' || si.id, "created_by" = COALESCE(po.invoiced_by, po.created_by), "total_paise" = si.billed_amount_paise, "taxable_paise" = si.billed_amount_paise FROM "purchase_orders" po WHERE po.id = si.po_id;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ALTER COLUMN "our_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ALTER COLUMN "po_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "fy" text GENERATED ALWAYS AS (lpad((((extract(year from invoice_date)::int - (case when extract(month from invoice_date) < 4 then 1 else 0 end)) % 100))::text, 2, '0') || '-' || lpad((((extract(year from invoice_date)::int - (case when extract(month from invoice_date) < 4 then 1 else 0 end) + 1) % 100))::text, 2, '0')) STORED;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ALTER COLUMN "payment_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ALTER COLUMN "due_date" SET DATA TYPE date USING ("due_date" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_our_number_key" UNIQUE("our_number");--> statement-breakpoint
CREATE INDEX "idx_sinv_history_invoice_id" ON "supplier_invoice_history" ("invoice_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_sinv_lines_grn_item" ON "supplier_invoice_lines" ("grn_item_id");--> statement-breakpoint
CREATE INDEX "idx_sinv_lines_invoice" ON "supplier_invoice_lines" ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sinv_lines_invoice_grn_item" ON "supplier_invoice_lines" ("invoice_id","grn_item_id") WHERE grn_item_id is not null;--> statement-breakpoint
CREATE INDEX "idx_sinv_mismatches_invoice" ON "supplier_invoice_mismatches" ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_sinv_mismatches_line" ON "supplier_invoice_mismatches" ("line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_supplier_invoice_live_number" ON "supplier_invoices" ("supplier_id","invoice_number","fy") WHERE status in ('draft', 'blocked', 'approved');--> statement-breakpoint
CREATE INDEX "idx_sinv_po_id" ON "supplier_invoices" ("po_id");--> statement-breakpoint
CREATE INDEX "idx_sinv_supplier_id" ON "supplier_invoices" ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_sinv_created" ON "supplier_invoices" ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_sinv_status_date" ON "supplier_invoices" ("status","invoice_date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_sinv_due_open" ON "supplier_invoices" ("due_date") WHERE status = 'approved';--> statement-breakpoint
CREATE INDEX "idx_sinv_our_number_trgm" ON "supplier_invoices" USING gin ("our_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_sinv_invoice_number_trgm" ON "supplier_invoices" USING gin ("invoice_number" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "supplier_invoice_history" ADD CONSTRAINT "supplier_invoice_history_invoice_id_supplier_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoice_history" ADD CONSTRAINT "supplier_invoice_history_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_invoice_id_supplier_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_grn_item_id_grn_items_id_fkey" FOREIGN KEY ("grn_item_id") REFERENCES "grn_items"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoice_mismatches" ADD CONSTRAINT "supplier_invoice_mismatches_6OAtPVW6G27v_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "supplier_invoice_mismatches" ADD CONSTRAINT "supplier_invoice_mismatches_ONjPuEjARvIP_fkey" FOREIGN KEY ("line_id") REFERENCES "supplier_invoice_lines"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_submitted_by_employees_id_fkey" FOREIGN KEY ("submitted_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_released_by_employees_id_fkey" FOREIGN KEY ("released_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "chk_sinv_invoice_number_format" CHECK (status = 'legacy' or invoice_number ~ '^[A-Z0-9/-]{1,16}$');--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_price_tol_range" CHECK ("price_tolerance_bp" between 0 and 1000);--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_weight_tol_range" CHECK ("weight_tolerance_bp" between 0 and 1000);