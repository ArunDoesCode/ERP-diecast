CREATE TYPE "stock_transfer_status" AS ENUM('draft', 'posted', 'cancelled', 'reversed');--> statement-breakpoint
CREATE TABLE "stock_transfer_items" (
	"id" serial PRIMARY KEY,
	"transfer_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"qty" numeric(13,3) NOT NULL,
	"posted_unit_cost_paise" bigint,
	"posted_value_paise" bigint,
	CONSTRAINT "stock_transfer_items_qty_ck" CHECK ("qty" > 0 and "qty" <= 1000000000)
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" serial PRIMARY KEY,
	"transfer_number" text NOT NULL UNIQUE,
	"status" "stock_transfer_status" DEFAULT 'draft'::"stock_transfer_status" NOT NULL,
	"source_location_id" integer NOT NULL,
	"destination_location_id" integer NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer NOT NULL,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"posted_by" integer,
	"posted_at" timestamp,
	"reversed_by" integer,
	"reversed_at" timestamp,
	"reverse_reason" text,
	CONSTRAINT "stock_transfers_locations_differ_ck" CHECK ("source_location_id" <> "destination_location_id"),
	CONSTRAINT "stock_transfers_reverse_reason_ck" CHECK ("reversed_at" is null or "reverse_reason" is not null),
	CONSTRAINT "stock_transfers_posted_at_ck" CHECK ("status" <> 'posted' or "posted_at" is not null),
	CONSTRAINT "stock_transfers_cancelled_at_ck" CHECK ("status" <> 'cancelled' or "cancelled_at" is not null),
	CONSTRAINT "stock_transfers_reversed_at_ck" CHECK ("status" <> 'reversed' or "reversed_at" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_stock_transfer_items_transfer_item" ON "stock_transfer_items" ("transfer_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_stock_transfer_items_item" ON "stock_transfer_items" ("item_id");--> statement-breakpoint
CREATE INDEX "idx_stock_transfers_status_id" ON "stock_transfers" ("status","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_stock_transfers_source" ON "stock_transfers" ("source_location_id");--> statement-breakpoint
CREATE INDEX "idx_stock_transfers_destination" ON "stock_transfers" ("destination_location_id");--> statement-breakpoint
CREATE INDEX "idx_stock_transfers_created_at" ON "stock_transfers" ("created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_stock_transfers_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id");--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_location_id_locations_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_location_id_locations_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_posted_by_employees_id_fkey" FOREIGN KEY ("posted_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_reversed_by_employees_id_fkey" FOREIGN KEY ("reversed_by") REFERENCES "employees"("id");