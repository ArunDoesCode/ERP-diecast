DO $$ BEGIN IF (SELECT count(*) FROM "purchase_returns") > 0 OR (SELECT count(*) FROM "purchase_return_items") > 0 THEN RAISE EXCEPTION 'purchase_returns / purchase_return_items must be empty before this migration (BR-PRT data design: no rows to convert)'; END IF; END $$;--> statement-breakpoint
CREATE TYPE "debit_note_status" AS ENUM('issued', 'cancelled');--> statement-breakpoint
CREATE TYPE "purchase_return_event_action" AS ENUM('create', 'edit', 'post', 'cancel_draft', 'cancel_posted');--> statement-breakpoint
CREATE TYPE "purchase_return_source" AS ENUM('rejected', 'accepted');--> statement-breakpoint
CREATE TYPE "purchase_return_status" AS ENUM('draft', 'posted', 'cancelled');--> statement-breakpoint
ALTER TYPE "inventory_ref_type" ADD VALUE 'pro_cancel' BEFORE 'sco_issue';--> statement-breakpoint
CREATE TABLE "purchase_debit_notes" (
	"id" serial PRIMARY KEY,
	"dn_number" text NOT NULL UNIQUE,
	"pro_id" integer NOT NULL UNIQUE,
	"debit_note_date" timestamp NOT NULL,
	"status" "debit_note_status" DEFAULT 'issued'::"debit_note_status" NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	"total_paise" bigint NOT NULL,
	"is_interstate" boolean NOT NULL,
	"supplier_invoice_id" integer,
	"bill_offset_paise" bigint DEFAULT 0 NOT NULL,
	"plant_name" text NOT NULL,
	"plant_address" text NOT NULL,
	"plant_gstin" text NOT NULL,
	"plant_state_code" text NOT NULL,
	"supplier_name" text NOT NULL,
	"supplier_address" text,
	"supplier_gstin" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"cancelled_by" integer,
	"cancelled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "purchase_return_events" (
	"id" serial PRIMARY KEY,
	"pro_id" integer NOT NULL,
	"action" "purchase_return_event_action" NOT NULL,
	"from_status" "purchase_return_status",
	"to_status" "purchase_return_status" NOT NULL,
	"reason" text,
	"actor_id" integer NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grn_items" ADD COLUMN "rejected_returned_qty" numeric(14,3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "grn_items" ADD COLUMN "accepted_returned_qty" numeric(14,3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "returned_qty" numeric(14,3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "grn_item_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "po_item_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "source" "purchase_return_source" NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "uom" text NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "batch_number" text;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "gst_percent" numeric(5,2) NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "hsn_code" text;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "taxable_paise" bigint;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "gst_paise" bigint;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "cgst_paise" bigint;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "sgst_paise" bigint;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "igst_paise" bigint;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "location_id" integer;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "unit_cost_paise" bigint;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "ledger_id" integer;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "cancel_ledger_id" integer;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "grn_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "vendor_return_ref" text;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "transporter" text;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "vehicle_no" text;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "remarks" text;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "challan_number" text;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "replacement_expected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "posted_by" integer;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "posted_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "cancelled_by" integer;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "last_updated_by" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "last_updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_returns" DROP COLUMN "debit_note_amount_paise";--> statement-breakpoint
ALTER TABLE "purchase_return_items" ALTER COLUMN "return_qty" SET DATA TYPE numeric(14,3) USING "return_qty"::numeric(14,3);--> statement-breakpoint
ALTER TABLE "purchase_returns" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "purchase_returns" ALTER COLUMN "status" SET DATA TYPE "purchase_return_status" USING "status"::"purchase_return_status";--> statement-breakpoint
ALTER TABLE "purchase_returns" ALTER COLUMN "status" SET DEFAULT 'draft'::"purchase_return_status";--> statement-breakpoint
ALTER TABLE "purchase_returns" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_challan_number_key" UNIQUE("challan_number");--> statement-breakpoint
CREATE INDEX "idx_grn_items_awaiting_return" ON "grn_items" ("id") WHERE "rejected_qty" > 0;--> statement-breakpoint
CREATE INDEX "idx_purchase_debit_notes_supplier_invoice_id" ON "purchase_debit_notes" ("supplier_invoice_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_return_events_pro_id_id" ON "purchase_return_events" ("pro_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_purchase_return_items_pro_grn_item_source" ON "purchase_return_items" ("pro_id","grn_item_id","source");--> statement-breakpoint
CREATE INDEX "idx_purchase_return_items_grn_item_source" ON "purchase_return_items" ("grn_item_id","source");--> statement-breakpoint
CREATE INDEX "idx_purchase_return_items_po_item_id" ON "purchase_return_items" ("po_item_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_return_items_item_id" ON "purchase_return_items" ("item_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_return_items_location_id" ON "purchase_return_items" ("location_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_returns_grn_id" ON "purchase_returns" ("grn_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_returns_status_id" ON "purchase_returns" ("status","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_purchase_returns_created_at_id" ON "purchase_returns" ("created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "idx_purchase_returns_pro_number_trgm" ON "purchase_returns" USING gin ("pro_number" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_pro_id_purchase_returns_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "purchase_returns"("id");--> statement-breakpoint
ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_zzrk8qA39caF_fkey" FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id");--> statement-breakpoint
ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_return_events" ADD CONSTRAINT "purchase_return_events_pro_id_purchase_returns_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "purchase_returns"("id");--> statement-breakpoint
ALTER TABLE "purchase_return_events" ADD CONSTRAINT "purchase_return_events_actor_id_employees_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_grn_item_id_grn_items_id_fkey" FOREIGN KEY ("grn_item_id") REFERENCES "grn_items"("id");--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_po_item_id_purchase_order_items_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "purchase_order_items"("id");--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_grn_id_grns_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grns"("id");--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_posted_by_employees_id_fkey" FOREIGN KEY ("posted_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");