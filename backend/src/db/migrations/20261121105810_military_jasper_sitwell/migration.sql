CREATE INDEX "idx_grns_received_date" ON "grns" ("received_date");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_supplier_created" ON "purchase_orders" ("supplier_id","created_at");