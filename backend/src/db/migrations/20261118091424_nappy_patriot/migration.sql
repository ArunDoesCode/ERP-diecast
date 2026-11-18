ALTER TABLE "inventory_ledger" ALTER COLUMN "unit_cost_paise" SET DATA TYPE bigint USING "unit_cost_paise"::bigint;--> statement-breakpoint
ALTER TABLE "item_master" ALTER COLUMN "average_cost_paise" SET DATA TYPE bigint USING "average_cost_paise"::bigint;--> statement-breakpoint
ALTER TABLE "item_master" ALTER COLUMN "standard_rate_paise" SET DATA TYPE bigint USING "standard_rate_paise"::bigint;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ALTER COLUMN "unit_price_paise" SET DATA TYPE bigint USING "unit_price_paise"::bigint;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ALTER COLUMN "line_value_paise" SET DATA TYPE bigint USING "line_value_paise"::bigint;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ALTER COLUMN "line_tax_paise" SET DATA TYPE bigint USING "line_tax_paise"::bigint;--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "subtotal_paise" SET DATA TYPE bigint USING "subtotal_paise"::bigint;--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "tax_amount_paise" SET DATA TYPE bigint USING "tax_amount_paise"::bigint;--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "total_amount_paise" SET DATA TYPE bigint USING "total_amount_paise"::bigint;--> statement-breakpoint
ALTER TABLE "purchase_requests" ALTER COLUMN "estimated_amount_paise" SET DATA TYPE bigint USING "estimated_amount_paise"::bigint;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ALTER COLUMN "unit_price_paise" SET DATA TYPE bigint USING "unit_price_paise"::bigint;--> statement-breakpoint
ALTER TABLE "purchase_returns" ALTER COLUMN "debit_note_amount_paise" SET DATA TYPE bigint USING "debit_note_amount_paise"::bigint;--> statement-breakpoint
ALTER TABLE "sco_challan_lines" ALTER COLUMN "unit_issue_cost_paise" SET DATA TYPE bigint USING "unit_issue_cost_paise"::bigint;--> statement-breakpoint
ALTER TABLE "sco_challans" ALTER COLUMN "value_paise" SET DATA TYPE bigint USING "value_paise"::bigint;--> statement-breakpoint
ALTER TABLE "subcontracting_order_items" ALTER COLUMN "service_unit_price_paise" SET DATA TYPE bigint USING "service_unit_price_paise"::bigint;--> statement-breakpoint
ALTER TABLE "subcontracting_orders" ALTER COLUMN "subtotal_paise" SET DATA TYPE bigint USING "subtotal_paise"::bigint;--> statement-breakpoint
ALTER TABLE "subcontracting_orders" ALTER COLUMN "tax_amount_paise" SET DATA TYPE bigint USING "tax_amount_paise"::bigint;--> statement-breakpoint
ALTER TABLE "subcontracting_orders" ALTER COLUMN "total_amount_paise" SET DATA TYPE bigint USING "total_amount_paise"::bigint;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ALTER COLUMN "billed_amount_paise" SET DATA TYPE bigint USING "billed_amount_paise"::bigint;--> statement-breakpoint
ALTER TABLE "supplier_payments" ALTER COLUMN "amount_paid_paise" SET DATA TYPE bigint USING "amount_paid_paise"::bigint;--> statement-breakpoint
ALTER TABLE "supplier_items" ALTER COLUMN "supplier_unit_price_paise" SET DATA TYPE bigint USING "supplier_unit_price_paise"::bigint;--> statement-breakpoint
ALTER TABLE "supplier_services" ALTER COLUMN "service_unit_price_paise" SET DATA TYPE bigint USING "service_unit_price_paise"::bigint;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "daily_rate_paise" SET DATA TYPE bigint USING "daily_rate_paise"::bigint;--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_employee_id" ON "refresh_tokens" ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_role_permissions_permission_key" ON "role_permissions" ("permission_key");--> statement-breakpoint
CREATE INDEX "idx_approval_requests_policy_id" ON "approval_requests" ("policy_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_ledger_reftype_id" ON "inventory_ledger" ("reference_type","id");--> statement-breakpoint
CREATE INDEX "idx_grns_status_id" ON "grns" ("status","id");--> statement-breakpoint
CREATE INDEX "idx_purchase_return_items_pro_id" ON "purchase_return_items" ("pro_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_returns_po_id" ON "purchase_returns" ("po_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_returns_supplier_id" ON "purchase_returns" ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_qa_tests_grn_item_id" ON "qa_tests" ("grn_item_id");--> statement-breakpoint
CREATE INDEX "idx_sco_challan_lines_item_id" ON "sco_challan_lines" ("item_id");--> statement-breakpoint
CREATE INDEX "idx_sco_items_sco_id" ON "subcontracting_order_items" ("sco_id");--> statement-breakpoint
CREATE INDEX "idx_sco_items_raw_item_id" ON "subcontracting_order_items" ("raw_item_id");--> statement-breakpoint
CREATE INDEX "idx_sco_items_service_id" ON "subcontracting_order_items" ("service_id");--> statement-breakpoint
CREATE INDEX "idx_sco_items_finished_item_id" ON "subcontracting_order_items" ("finished_item_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_bank_details_supplier_id" ON "supplier_bank_details" ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_invoices_po_id" ON "supplier_invoices" ("po_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_payments_invoice_id" ON "supplier_payments" ("invoice_id");