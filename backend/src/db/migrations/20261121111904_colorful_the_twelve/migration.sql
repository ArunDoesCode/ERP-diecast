CREATE TYPE "delivery_note_status" AS ENUM('draft', 'posted', 'cancelled');--> statement-breakpoint
CREATE TABLE "delivery_note_lines" (
	"id" serial PRIMARY KEY,
	"note_id" integer NOT NULL,
	"so_line_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"qty" numeric(14,3) NOT NULL,
	"uom" text NOT NULL,
	"delivery_date" date NOT NULL,
	"lot_no" text,
	"hsn_code" text,
	"unit_price_paise" bigint NOT NULL,
	"gst_percent" numeric(5,2) NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"gst_paise" bigint NOT NULL,
	"ledger_out_id" integer,
	"ledger_in_id" integer,
	CONSTRAINT "delivery_note_lines_qty_ck" CHECK ("qty" > 0),
	CONSTRAINT "delivery_note_lines_gst_ck" CHECK ("gst_percent" in (0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40))
);
--> statement-breakpoint
CREATE TABLE "delivery_note_packages" (
	"id" serial PRIMARY KEY,
	"note_id" integer NOT NULL,
	"line_id" integer NOT NULL,
	"package_no" text NOT NULL,
	"qty" numeric(14,3) NOT NULL,
	"net_kg" numeric(10,3) NOT NULL,
	"gross_kg" numeric(10,3) NOT NULL,
	"lot_no" text,
	CONSTRAINT "delivery_note_packages_qty_ck" CHECK ("qty" > 0),
	CONSTRAINT "delivery_note_packages_weight_ck" CHECK ("net_kg" > 0 and "gross_kg" >= "net_kg")
);
--> statement-breakpoint
CREATE TABLE "delivery_note_transport_history" (
	"id" serial PRIMARY KEY,
	"note_id" integer NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"changed_by" integer NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_notes" (
	"id" serial PRIMARY KEY,
	"dn_number" text,
	"status" "delivery_note_status" DEFAULT 'draft'::"delivery_note_status" NOT NULL,
	"so_id" integer NOT NULL,
	"so_number" text NOT NULL,
	"customer_po_number" text,
	"customer_id" integer NOT NULL,
	"customer_name" text NOT NULL,
	"customer_address" text NOT NULL,
	"customer_gstin" text,
	"customer_state_code" text NOT NULL,
	"ship_to_address" text NOT NULL,
	"ship_to_state_code" text NOT NULL,
	"company_name" text,
	"company_address" text,
	"company_gstin" text,
	"company_state_code" text,
	"same_state" boolean NOT NULL,
	"source_location_id" integer NOT NULL,
	"note_date" date NOT NULL,
	"taxable_paise" bigint DEFAULT 0 NOT NULL,
	"gst_paise" bigint DEFAULT 0 NOT NULL,
	"value_paise" bigint DEFAULT 0 NOT NULL,
	"eway_required" boolean DEFAULT false NOT NULL,
	"transport_mode" text,
	"vehicle_no" text,
	"transporter_id" text,
	"transporter_name" text,
	"transport_doc_no" text,
	"transport_doc_date" date,
	"distance_km" integer,
	"eway_bill_no" text,
	"eway_bill_date" date,
	"remarks" text,
	"posted_by" integer,
	"posted_at" timestamp,
	"cancel_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_notes_transport_mode_ck" CHECK ("transport_mode" is null or "transport_mode" in ('road', 'rail', 'air', 'ship')),
	CONSTRAINT "delivery_notes_distance_ck" CHECK ("distance_km" is null or "distance_km" between 1 and 4000),
	CONSTRAINT "delivery_notes_eway_bill_no_ck" CHECK ("eway_bill_no" is null or "eway_bill_no" ~ '^\d{12}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_note_lines_note_so_line" ON "delivery_note_lines" ("note_id","so_line_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_note_lines_so_line" ON "delivery_note_lines" ("so_line_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_note_lines_item" ON "delivery_note_lines" ("item_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_note_lines_ledger_out" ON "delivery_note_lines" ("ledger_out_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_note_lines_ledger_in" ON "delivery_note_lines" ("ledger_in_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_note_packages_note_no" ON "delivery_note_packages" ("note_id","package_no");--> statement-breakpoint
CREATE INDEX "idx_delivery_note_packages_line" ON "delivery_note_packages" ("line_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_note_transport_history_note" ON "delivery_note_transport_history" ("note_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_notes_dn_number" ON "delivery_notes" ("dn_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_notes_eway_bill_no" ON "delivery_notes" ("eway_bill_no") WHERE "status" <> 'cancelled' and "eway_bill_no" is not null;--> statement-breakpoint
CREATE INDEX "idx_delivery_notes_so_id" ON "delivery_notes" ("so_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_notes_customer_date" ON "delivery_notes" ("customer_id","note_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_delivery_notes_note_date" ON "delivery_notes" ("note_date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_delivery_notes_status_date" ON "delivery_notes" ("status","note_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_delivery_notes_eway_missing" ON "delivery_notes" ("note_date") WHERE "status" = 'draft' and "eway_required" and "eway_bill_no" is null;--> statement-breakpoint
CREATE INDEX "idx_delivery_notes_source_location" ON "delivery_notes" ("source_location_id");--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_note_id_delivery_notes_id_fkey" FOREIGN KEY ("note_id") REFERENCES "delivery_notes"("id");--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_so_line_id_sale_order_lines_id_fkey" FOREIGN KEY ("so_line_id") REFERENCES "sale_order_lines"("id");--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_ledger_out_id_inventory_ledger_id_fkey" FOREIGN KEY ("ledger_out_id") REFERENCES "inventory_ledger"("id");--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_ledger_in_id_inventory_ledger_id_fkey" FOREIGN KEY ("ledger_in_id") REFERENCES "inventory_ledger"("id");--> statement-breakpoint
ALTER TABLE "delivery_note_packages" ADD CONSTRAINT "delivery_note_packages_note_id_delivery_notes_id_fkey" FOREIGN KEY ("note_id") REFERENCES "delivery_notes"("id");--> statement-breakpoint
ALTER TABLE "delivery_note_packages" ADD CONSTRAINT "delivery_note_packages_line_id_delivery_note_lines_id_fkey" FOREIGN KEY ("line_id") REFERENCES "delivery_note_lines"("id");--> statement-breakpoint
ALTER TABLE "delivery_note_transport_history" ADD CONSTRAINT "delivery_note_transport_history_note_id_delivery_notes_id_fkey" FOREIGN KEY ("note_id") REFERENCES "delivery_notes"("id");--> statement-breakpoint
ALTER TABLE "delivery_note_transport_history" ADD CONSTRAINT "delivery_note_transport_history_changed_by_employees_id_fkey" FOREIGN KEY ("changed_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_so_id_sale_orders_id_fkey" FOREIGN KEY ("so_id") REFERENCES "sale_orders"("id");--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_source_location_id_locations_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_posted_by_employees_id_fkey" FOREIGN KEY ("posted_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");