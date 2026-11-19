-- pg_trgm powers the GIN indexes for list `q` search (ilike %q%): #21, #38, #54, #62
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "company_settings_history" (
	"id" serial PRIMARY KEY,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_item_master_sku_trgm" ON "item_master" USING gin ("sku" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_item_master_name_trgm" ON "item_master" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_grns_grn_number_trgm" ON "grns" USING gin ("grn_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_po_number_trgm" ON "purchase_orders" USING gin ("po_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_notes_trgm" ON "purchase_orders" USING gin ("notes" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_pr_number_trgm" ON "purchase_requests" USING gin ("pr_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_notes_trgm" ON "purchase_requests" USING gin ("notes" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_sco_sco_number_trgm" ON "subcontracting_orders" USING gin ("sco_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_supplier_master_name_trgm" ON "supplier_master" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_supplier_master_contact_person_trgm" ON "supplier_master" USING gin ("contact_person" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_supplier_master_email_trgm" ON "supplier_master" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_supplier_master_phone_trgm" ON "supplier_master" USING gin ("phone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_supplier_master_gst_number_trgm" ON "supplier_master" USING gin ("gst_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_supplier_services_service_id" ON "supplier_services" ("service_id");--> statement-breakpoint
CREATE INDEX "idx_company_settings_history_created_at" ON "company_settings_history" ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "company_settings_history" ADD CONSTRAINT "company_settings_history_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");