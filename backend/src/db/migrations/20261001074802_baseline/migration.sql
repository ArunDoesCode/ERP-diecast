CREATE TYPE "approval_action" AS ENUM('submitted', 'approved', 'rejected', 'require_more_info', 'auto_approved', 'cancelled');--> statement-breakpoint
CREATE TYPE "approval_doc_type" AS ENUM('pr', 'po', 'sco');--> statement-breakpoint
CREATE TYPE "approval_status" AS ENUM('pending_approval', 'approved', 'rejected', 'require_more_info', 'partial_ordered', 'fully_ordered', 'auto_approved', 'cancelled');--> statement-breakpoint
CREATE TYPE "procurement_category" AS ENUM('any', 'sale_order', 'stock_reorder', 'maintenance', 'tooling', 'subcontracting', 'misc');--> statement-breakpoint
CREATE TYPE "inventory_ref_type" AS ENUM('grn', 'grn_bypass', 'pro', 'sco_issue', 'sco_receipt', 'job_order_issue', 'scrap_dispatch', 'stock_adjustment', 'grn_correction', 'opening_stock', 'sco_loss');--> statement-breakpoint
CREATE TYPE "inventory_tx_type" AS ENUM('in', 'out', 'adjustment');--> statement-breakpoint
CREATE TYPE "location_type" AS ENUM('main_store', 'vendor_premise', 'finished_goods', 'scrap_yard');--> statement-breakpoint
CREATE TYPE "machine_status" AS ENUM('idle', 'running', 'maintenance', 'breakdown');--> statement-breakpoint
CREATE TYPE "grn_status" AS ENUM('draft', 'pending_qa', 'accepted', 'rejected', 'partial_accepted');--> statement-breakpoint
CREATE TYPE "po_communication_channel" AS ENUM('email', 'whatsapp', 'phone', 'in_person');--> statement-breakpoint
CREATE TYPE "po_communication_status" AS ENUM('logged', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "po_communication_type" AS ENUM('po_sent', 'reminder', 'escalation', 'confirmation');--> statement-breakpoint
CREATE TYPE "po_status" AS ENUM('draft', 'pending_approval', 'approved', 'dispatched', 'partial_received', 'fully_received', 'invoiced', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "pr_item_status" AS ENUM('pending', 'po_draft', 'ordered', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "pr_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'partial_ordered', 'fully_ordered', 'cancelled');--> statement-breakpoint
CREATE TYPE "pr_type" AS ENUM('sale_order', 'stock_reorder', 'maintenance', 'tooling', 'subcontracting', 'misc');--> statement-breakpoint
CREATE TYPE "sco_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'require_more_info', 'material_issued', 'material_received', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "supplier_history_entity" AS ENUM('supplier', 'item', 'service');--> statement-breakpoint
CREATE TYPE "supplier_type" AS ENUM('raw_material', 'consumables', 'service_provider', 'trader', 'both');--> statement-breakpoint
CREATE TABLE "auth_audit_log" (
	"id" serial PRIMARY KEY,
	"actor_id" integer,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_number_counters" (
	"id" serial PRIMARY KEY,
	"doc_type" text NOT NULL,
	"period_key" text NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_number_counters_doc_type_period_key_unique" UNIQUE("doc_type","period_key")
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY,
	"module" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"grantable" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" serial PRIMARY KEY,
	"employee_id" integer NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" integer,
	"permission_key" text,
	"granted_by" integer,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pkey" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL UNIQUE,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screens" (
	"key" text PRIMARY KEY,
	"path" text NOT NULL,
	"permission_key" text,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"menu_group" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_policies" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer NOT NULL,
	"doc_type" "approval_doc_type" NOT NULL,
	"sub_doc_type" "procurement_category" DEFAULT 'any'::"procurement_category" NOT NULL,
	"is_sale_order_linked" boolean,
	"min_amount_paise" bigint,
	"max_amount_paise" bigint,
	"auto_approve" boolean DEFAULT false NOT NULL,
	"approval_levels" integer DEFAULT 1 NOT NULL,
	"approval_chain" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" serial PRIMARY KEY,
	"doc_type" "approval_doc_type" NOT NULL,
	"doc_id" integer NOT NULL,
	"policy_id" integer NOT NULL,
	"status" "approval_status" DEFAULT 'pending_approval'::"approval_status" NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"total_levels" integer NOT NULL,
	"chain_snapshot" jsonb NOT NULL,
	"current_approver_role" text,
	"current_approver_employee_id" integer,
	"requested_by" integer NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "approval_trails" (
	"id" serial PRIMARY KEY,
	"request_id" integer NOT NULL,
	"doc_type" "approval_doc_type" NOT NULL,
	"doc_id" integer NOT NULL,
	"level" integer NOT NULL,
	"action" "approval_action" NOT NULL,
	"action_by" integer NOT NULL,
	"action_at" timestamp DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "inventory_ledger" (
	"id" serial PRIMARY KEY,
	"item_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"batch_number" text,
	"transaction_type" "inventory_tx_type" NOT NULL,
	"reference_type" "inventory_ref_type" NOT NULL,
	"reference_id" integer NOT NULL,
	"reference_line_id" integer,
	"quantity_change" double precision NOT NULL,
	"balance_after" double precision NOT NULL,
	"unit_cost_paise" integer NOT NULL,
	"total_value_change_paise" bigint NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_master" (
	"id" serial PRIMARY KEY,
	"sku" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"uom" text NOT NULL,
	"reorder_level" double precision DEFAULT 0 NOT NULL,
	"current_stock" double precision DEFAULT 0 NOT NULL,
	"average_cost_paise" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"hsn_code" text,
	"standard_rate_paise" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"type" "location_type" NOT NULL,
	"is_virtual" boolean DEFAULT false NOT NULL,
	"linked_vendor_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"type" text,
	"status" "machine_status" DEFAULT 'idle'::"machine_status" NOT NULL,
	"last_maintenance_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_master" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text,
	"sac_code" text,
	"default_uom" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grn_corrections" (
	"id" serial PRIMARY KEY,
	"grn_item_id" integer NOT NULL,
	"qty" double precision NOT NULL,
	"reason" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grn_items" (
	"id" serial PRIMARY KEY,
	"grn_id" integer,
	"po_item_id" integer,
	"received_qty" double precision NOT NULL,
	"accepted_qty" double precision NOT NULL,
	"rejected_qty" double precision DEFAULT 0,
	"qa_status" text DEFAULT 'pending',
	"is_qa_bypassed" boolean DEFAULT false,
	"qa_bypass_reason" text,
	"qa_bypassed_by" integer,
	"challan_photo_url" text,
	"qa_bypassed_at" timestamp,
	"batch_number" text,
	"over_receipt_excess_qty" double precision,
	"over_receipt_reason" text,
	"over_receipt_by" integer
);
--> statement-breakpoint
CREATE TABLE "grns" (
	"id" serial PRIMARY KEY,
	"grn_number" text NOT NULL UNIQUE,
	"po_id" integer,
	"supplier_id" integer NOT NULL,
	"status" "grn_status" DEFAULT 'draft'::"grn_status" NOT NULL,
	"received_date" timestamp DEFAULT now(),
	"created_by" integer,
	"challan_no" text,
	"challan_date" timestamp,
	"vehicle_no" text,
	"driver_name" text,
	"driver_phone" text,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "po_communications" (
	"id" serial PRIMARY KEY,
	"po_id" integer NOT NULL,
	"type" "po_communication_type" NOT NULL,
	"channel" "po_communication_channel" NOT NULL,
	"status" "po_communication_status" DEFAULT 'logged'::"po_communication_status" NOT NULL,
	"to_email" text,
	"note" text,
	"error_message" text,
	"sent_by" integer,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pr_po_item_links" (
	"id" serial PRIMARY KEY,
	"pr_item_id" integer,
	"po_item_id" integer,
	"linked_qty" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" serial PRIMARY KEY,
	"po_id" integer,
	"item_id" integer NOT NULL,
	"qty" double precision NOT NULL,
	"received_qty" double precision DEFAULT 0,
	"unit_price_paise" integer NOT NULL,
	"uom" text NOT NULL,
	"gst_percent" double precision DEFAULT 0 NOT NULL,
	"line_value_paise" integer DEFAULT 0 NOT NULL,
	"line_tax_paise" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY,
	"po_number" text NOT NULL UNIQUE,
	"supplier_id" integer NOT NULL,
	"status" "po_status" DEFAULT 'draft'::"po_status" NOT NULL,
	"subtotal_paise" integer DEFAULT 0 NOT NULL,
	"tax_amount_paise" integer DEFAULT 0 NOT NULL,
	"total_amount_paise" integer DEFAULT 0 NOT NULL,
	"payment_terms_days" integer DEFAULT 0,
	"delivery_terms" text,
	"notes" text,
	"expected_delivery_date" timestamp,
	"approved_by" integer,
	"current_approval_level" integer DEFAULT 0 NOT NULL,
	"total_approval_levels" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"revised_delivery_date" timestamp,
	"delay_reason" text,
	"supplier_confirmed" boolean DEFAULT false NOT NULL,
	"confirmation_method" text,
	"confirmed_at" timestamp,
	"confirmed_by" integer,
	"confirmation_note" text,
	"closed_at" timestamp,
	"closed_by" integer,
	"close_note" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"short_closed" boolean DEFAULT false NOT NULL,
	"invoiced_by" integer,
	"invoiced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "purchase_request_items" (
	"id" serial PRIMARY KEY,
	"pr_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"requested_qty" double precision NOT NULL,
	"issued_qty" double precision DEFAULT 0,
	"uom" text NOT NULL,
	"expected_date" timestamp,
	"status" "pr_item_status" DEFAULT 'pending'::"pr_item_status" NOT NULL,
	"cancel_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" serial PRIMARY KEY,
	"pr_number" text NOT NULL UNIQUE,
	"type" "pr_type" NOT NULL,
	"sale_order_id" integer,
	"asset_id" integer,
	"status" "pr_status" DEFAULT 'draft'::"pr_status" NOT NULL,
	"requested_by" integer NOT NULL,
	"approved_by" integer,
	"current_approval_level" integer DEFAULT 0 NOT NULL,
	"total_approval_levels" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"estimated_amount_paise" integer DEFAULT 0 NOT NULL,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_return_items" (
	"id" serial PRIMARY KEY,
	"pro_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"return_qty" double precision NOT NULL,
	"unit_price_paise" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_returns" (
	"id" serial PRIMARY KEY,
	"pro_number" text NOT NULL UNIQUE,
	"po_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reason" text NOT NULL,
	"debit_note_amount_paise" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_tests" (
	"id" serial PRIMARY KEY,
	"grn_item_id" integer NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"external_lab_name" text,
	"test_report_url" text,
	"tested_by" integer,
	"tested_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sco_challan_lines" (
	"id" serial PRIMARY KEY,
	"challan_id" integer NOT NULL,
	"sco_item_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"qty" integer NOT NULL,
	"unit_issue_cost_paise" integer NOT NULL,
	"heat_number" text,
	"hsn_code" text NOT NULL,
	"settled_qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sco_challans" (
	"id" serial PRIMARY KEY,
	"challan_number" text NOT NULL UNIQUE,
	"sco_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"challan_date" timestamp NOT NULL,
	"eway_bill_no" text,
	"value_paise" integer NOT NULL,
	"return_due_date" timestamp NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sco_receipt_settlements" (
	"id" serial PRIMARY KEY,
	"receipt_item_id" integer NOT NULL,
	"challan_line_id" integer NOT NULL,
	"qty" integer NOT NULL,
	"processed_qty" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontracting_grn_items" (
	"id" serial PRIMARY KEY,
	"sco_grn_id" integer NOT NULL,
	"sco_item_id" integer NOT NULL,
	"processed_qty" integer NOT NULL,
	"unprocessed_qty" integer DEFAULT 0 NOT NULL,
	"accepted_qty" integer,
	"rejected_qty" integer,
	"qa_status" "grn_status" DEFAULT 'pending_qa'::"grn_status" NOT NULL,
	"qa_decided_by" integer,
	"qa_decided_at" timestamp,
	"qa_notes" text,
	"heat_number" text
);
--> statement-breakpoint
CREATE TABLE "subcontracting_grns" (
	"id" serial PRIMARY KEY,
	"grn_number" text NOT NULL UNIQUE,
	"sco_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"vendor_challan_no" text NOT NULL,
	"status" "grn_status" DEFAULT 'pending_qa'::"grn_status" NOT NULL,
	"received_date" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontracting_order_items" (
	"id" serial PRIMARY KEY,
	"sco_id" integer NOT NULL,
	"raw_item_id" integer NOT NULL,
	"raw_item_batch" text,
	"raw_qty_to_issue" integer NOT NULL,
	"service_id" integer NOT NULL,
	"service_description" text NOT NULL,
	"service_hsn_sac_code" text,
	"service_unit_price_paise" integer NOT NULL,
	"service_tax_percentage" double precision DEFAULT 18 NOT NULL,
	"finished_item_id" integer NOT NULL,
	"expected_return_qty" integer NOT NULL,
	"issued_qty" integer DEFAULT 0 NOT NULL,
	"accepted_qty" integer DEFAULT 0 NOT NULL,
	"rejected_qty" integer DEFAULT 0 NOT NULL,
	"unprocessed_qty" integer DEFAULT 0 NOT NULL,
	"loss_qty" integer DEFAULT 0 NOT NULL,
	"pending_qa_qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontracting_orders" (
	"id" serial PRIMARY KEY,
	"sco_number" text NOT NULL UNIQUE,
	"vendor_id" integer NOT NULL,
	"status" "sco_status" DEFAULT 'draft'::"sco_status" NOT NULL,
	"project_ref" text,
	"notes" text,
	"expected_return_date" timestamp NOT NULL,
	"subtotal_paise" integer DEFAULT 0 NOT NULL,
	"tax_amount_paise" integer DEFAULT 0 NOT NULL,
	"total_amount_paise" integer DEFAULT 0 NOT NULL,
	"approved_by" integer,
	"current_approval_level" integer DEFAULT 0 NOT NULL,
	"total_approval_levels" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"closed_by" integer,
	"closed_at" timestamp,
	"close_reason" text
);
--> statement-breakpoint
CREATE TABLE "supplier_bank_details" (
	"id" serial PRIMARY KEY,
	"supplier_id" integer NOT NULL,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"ifsc_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"branch_name" text,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" serial PRIMARY KEY,
	"invoice_number" text NOT NULL,
	"invoice_date" timestamp NOT NULL,
	"po_id" integer,
	"supplier_id" integer NOT NULL,
	"billed_amount_paise" integer NOT NULL,
	"match_status" text DEFAULT 'pending',
	"payment_status" text DEFAULT 'unpaid',
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" serial PRIMARY KEY,
	"invoice_id" integer NOT NULL,
	"amount_paid_paise" integer NOT NULL,
	"payment_date" timestamp NOT NULL,
	"payment_method" text NOT NULL,
	"transaction_ref" text,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_history" (
	"id" serial PRIMARY KEY,
	"supplier_id" integer NOT NULL,
	"entity" "supplier_history_entity" NOT NULL,
	"entity_id" integer NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" integer NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_items" (
	"id" serial PRIMARY KEY,
	"supplier_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"supplier_sku" text,
	"supplier_unit_price_paise" integer NOT NULL,
	"tax_percentage" double precision DEFAULT 0 NOT NULL,
	"lead_time_days" integer DEFAULT 0 NOT NULL,
	"qty" double precision DEFAULT 0 NOT NULL,
	"uom" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_master" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"type" "supplier_type" DEFAULT 'raw_material'::"supplier_type" NOT NULL,
	"gst_number" text UNIQUE,
	"pan_number" text,
	"contact_person" text,
	"email" text,
	"phone" text,
	"address" text,
	"default_payment_terms_days" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_services" (
	"id" serial PRIMARY KEY,
	"supplier_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"service_unit_price_paise" integer NOT NULL,
	"tax_percentage" double precision DEFAULT 0 NOT NULL,
	"lead_time_days" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"email" text UNIQUE,
	"password_hash" text,
	"phone" text,
	"qr_token" text UNIQUE,
	"role_id" integer NOT NULL,
	"daily_rate_paise" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"gstin" text NOT NULL,
	"state_code" text NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_settings_single_row" CHECK ("id" = 1)
);
--> statement-breakpoint
CREATE INDEX "auth_audit_log_at_id_idx" ON "auth_audit_log" ("at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auth_audit_log_actor_id_idx" ON "auth_audit_log" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_policy_priority_doctype_subdoctype" ON "approval_policies" ("priority","doc_type","sub_doc_type") WHERE "is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_open_approval_request_per_doc" ON "approval_requests" ("doc_type","doc_id") WHERE "status" = 'pending_approval';--> statement-breakpoint
CREATE INDEX "idx_approval_requests_doc" ON "approval_requests" ("doc_type","doc_id");--> statement-breakpoint
CREATE INDEX "idx_approval_requests_status_role" ON "approval_requests" ("status","current_approver_role");--> statement-breakpoint
CREATE INDEX "idx_approval_requests_status_employee" ON "approval_requests" ("status","current_approver_employee_id");--> statement-breakpoint
CREATE INDEX "idx_approval_trails_request_id" ON "approval_trails" ("request_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_ledger_item_location" ON "inventory_ledger" ("item_id","location_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_inventory_ledger_reference_line" ON "inventory_ledger" ("reference_line_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_ledger_location" ON "inventory_ledger" ("location_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_inventory_ledger_created_at" ON "inventory_ledger" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_inventory_ledger_sco_loss" ON "inventory_ledger" ("created_at" DESC NULLS LAST,"id") WHERE "reference_type" = 'sco_loss';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_item_master_sku_norm" ON "item_master" (lower(btrim("sku")));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_locations_name_norm" ON "locations" (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_locations_one_main_store" ON "locations" ("type") WHERE "type" = 'main_store';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_locations_one_vendor_premise" ON "locations" ("linked_vendor_id") WHERE "type" = 'vendor_premise';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_machines_name_norm" ON "machines" (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_machines_code_norm" ON "machines" (lower(btrim("code")));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_service_master_code_norm" ON "service_master" (lower(btrim("code")));--> statement-breakpoint
CREATE INDEX "idx_grn_corrections_grn_item_id" ON "grn_corrections" ("grn_item_id");--> statement-breakpoint
CREATE INDEX "idx_grn_items_grn_id" ON "grn_items" ("grn_id");--> statement-breakpoint
CREATE INDEX "idx_grn_items_po_item_id" ON "grn_items" ("po_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_grns_supplier_challan" ON "grns" ("supplier_id","challan_no");--> statement-breakpoint
CREATE INDEX "idx_grns_po_id" ON "grns" ("po_id");--> statement-breakpoint
CREATE INDEX "idx_po_communications_po_id_sent_at" ON "po_communications" ("po_id","sent_at");--> statement-breakpoint
CREATE INDEX "idx_pr_po_links_pr_item_id" ON "pr_po_item_links" ("pr_item_id");--> statement-breakpoint
CREATE INDEX "idx_pr_po_links_po_item_id" ON "pr_po_item_links" ("po_item_id");--> statement-breakpoint
CREATE INDEX "idx_po_items_po_id" ON "purchase_order_items" ("po_id");--> statement-breakpoint
CREATE INDEX "idx_po_items_item_id" ON "purchase_order_items" ("item_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_status" ON "purchase_orders" ("status");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_supplier_id" ON "purchase_orders" ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_pr_items_pr_id" ON "purchase_request_items" ("pr_id");--> statement-breakpoint
CREATE INDEX "idx_pr_items_status" ON "purchase_request_items" ("status");--> statement-breakpoint
CREATE INDEX "idx_pr_items_item_id" ON "purchase_request_items" ("item_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_status" ON "purchase_requests" ("status");--> statement-breakpoint
CREATE INDEX "idx_sco_challan_lines_challan" ON "sco_challan_lines" ("challan_id");--> statement-breakpoint
CREATE INDEX "idx_sco_challan_lines_sco_item" ON "sco_challan_lines" ("sco_item_id");--> statement-breakpoint
CREATE INDEX "idx_sco_challans_sco" ON "sco_challans" ("sco_id");--> statement-breakpoint
CREATE INDEX "idx_sco_challans_due" ON "sco_challans" ("return_due_date");--> statement-breakpoint
CREATE INDEX "idx_sco_challans_vendor" ON "sco_challans" ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sco_settlement_receipt_challan_line" ON "sco_receipt_settlements" ("receipt_item_id","challan_line_id");--> statement-breakpoint
CREATE INDEX "idx_sco_settlements_challan_line" ON "sco_receipt_settlements" ("challan_line_id");--> statement-breakpoint
CREATE INDEX "idx_sco_grn_items_receipt" ON "subcontracting_grn_items" ("sco_grn_id");--> statement-breakpoint
CREATE INDEX "idx_sco_grn_items_sco_item" ON "subcontracting_grn_items" ("sco_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sco_grns_vendor_challan" ON "subcontracting_grns" ("vendor_id","vendor_challan_no");--> statement-breakpoint
CREATE INDEX "idx_sco_grns_sco" ON "subcontracting_grns" ("sco_id");--> statement-breakpoint
CREATE INDEX "idx_sco_vendor_status" ON "subcontracting_orders" ("vendor_id","status");--> statement-breakpoint
CREATE INDEX "idx_sco_created_at" ON "subcontracting_orders" ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_supplier_invoice_number" ON "supplier_invoices" ("supplier_id","invoice_number");--> statement-breakpoint
CREATE INDEX "idx_supplier_history_supplier_changed" ON "supplier_history" ("supplier_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_supplier_item_idx" ON "supplier_items" ("supplier_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_items_item_id" ON "supplier_items" ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_supplier_master_name_norm" ON "supplier_master" (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "unique_supplier_service_idx" ON "supplier_services" ("supplier_id","service_id");--> statement-breakpoint
CREATE INDEX "employees_role_id_idx" ON "employees" ("role_id");--> statement-breakpoint
ALTER TABLE "auth_audit_log" ADD CONSTRAINT "auth_audit_log_actor_id_employees_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "document_number_counters" ADD CONSTRAINT "document_number_counters_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "document_number_counters" ADD CONSTRAINT "document_number_counters_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_employee_id_employees_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_granted_by_employees_id_fkey" FOREIGN KEY ("granted_by") REFERENCES "employees"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "screens" ADD CONSTRAINT "screens_permission_key_permissions_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_policy_id_approval_policies_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "approval_policies"("id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_uKO6vceDB8Uj_fkey" FOREIGN KEY ("current_approver_employee_id") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_employees_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "approval_trails" ADD CONSTRAINT "approval_trails_request_id_approval_requests_id_fkey" FOREIGN KEY ("request_id") REFERENCES "approval_requests"("id");--> statement-breakpoint
ALTER TABLE "approval_trails" ADD CONSTRAINT "approval_trails_action_by_employees_id_fkey" FOREIGN KEY ("action_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "item_master" ADD CONSTRAINT "item_master_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "item_master" ADD CONSTRAINT "item_master_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_linked_vendor_id_supplier_master_id_fkey" FOREIGN KEY ("linked_vendor_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "service_master" ADD CONSTRAINT "service_master_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "service_master" ADD CONSTRAINT "service_master_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "grn_corrections" ADD CONSTRAINT "grn_corrections_grn_item_id_grn_items_id_fkey" FOREIGN KEY ("grn_item_id") REFERENCES "grn_items"("id");--> statement-breakpoint
ALTER TABLE "grn_corrections" ADD CONSTRAINT "grn_corrections_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_grn_id_grns_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grns"("id");--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_po_item_id_purchase_order_items_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "purchase_order_items"("id");--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_qa_bypassed_by_employees_id_fkey" FOREIGN KEY ("qa_bypassed_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_over_receipt_by_employees_id_fkey" FOREIGN KEY ("over_receipt_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_po_id_purchase_orders_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id");--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_supplier_id_supplier_master_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "grns" ADD CONSTRAINT "grns_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "po_communications" ADD CONSTRAINT "po_communications_po_id_purchase_orders_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id");--> statement-breakpoint
ALTER TABLE "po_communications" ADD CONSTRAINT "po_communications_sent_by_employees_id_fkey" FOREIGN KEY ("sent_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "pr_po_item_links" ADD CONSTRAINT "pr_po_item_links_pr_item_id_purchase_request_items_id_fkey" FOREIGN KEY ("pr_item_id") REFERENCES "purchase_request_items"("id");--> statement-breakpoint
ALTER TABLE "pr_po_item_links" ADD CONSTRAINT "pr_po_item_links_po_item_id_purchase_order_items_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "purchase_order_items"("id");--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_purchase_orders_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id");--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_supplier_master_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_employees_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_confirmed_by_employees_id_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_closed_by_employees_id_fkey" FOREIGN KEY ("closed_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_invoiced_by_employees_id_fkey" FOREIGN KEY ("invoiced_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_pr_id_purchase_requests_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "purchase_requests"("id");--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requested_by_employees_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_approved_by_employees_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_pro_id_purchase_returns_id_fkey" FOREIGN KEY ("pro_id") REFERENCES "purchase_returns"("id");--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_po_id_purchase_orders_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id");--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_id_supplier_master_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "qa_tests" ADD CONSTRAINT "qa_tests_grn_item_id_grn_items_id_fkey" FOREIGN KEY ("grn_item_id") REFERENCES "grn_items"("id");--> statement-breakpoint
ALTER TABLE "qa_tests" ADD CONSTRAINT "qa_tests_tested_by_employees_id_fkey" FOREIGN KEY ("tested_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sco_challan_lines" ADD CONSTRAINT "sco_challan_lines_challan_id_sco_challans_id_fkey" FOREIGN KEY ("challan_id") REFERENCES "sco_challans"("id");--> statement-breakpoint
ALTER TABLE "sco_challan_lines" ADD CONSTRAINT "sco_challan_lines_PHuacvPJsUXk_fkey" FOREIGN KEY ("sco_item_id") REFERENCES "subcontracting_order_items"("id");--> statement-breakpoint
ALTER TABLE "sco_challan_lines" ADD CONSTRAINT "sco_challan_lines_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "sco_challans" ADD CONSTRAINT "sco_challans_sco_id_subcontracting_orders_id_fkey" FOREIGN KEY ("sco_id") REFERENCES "subcontracting_orders"("id");--> statement-breakpoint
ALTER TABLE "sco_challans" ADD CONSTRAINT "sco_challans_vendor_id_supplier_master_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "sco_challans" ADD CONSTRAINT "sco_challans_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sco_receipt_settlements" ADD CONSTRAINT "sco_receipt_settlements_ZPgqSzuGQ2Xw_fkey" FOREIGN KEY ("receipt_item_id") REFERENCES "subcontracting_grn_items"("id");--> statement-breakpoint
ALTER TABLE "sco_receipt_settlements" ADD CONSTRAINT "sco_receipt_settlements_AkjxnsE9VUl4_fkey" FOREIGN KEY ("challan_line_id") REFERENCES "sco_challan_lines"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_grn_items" ADD CONSTRAINT "subcontracting_grn_items_sco_grn_id_subcontracting_grns_id_fkey" FOREIGN KEY ("sco_grn_id") REFERENCES "subcontracting_grns"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_grn_items" ADD CONSTRAINT "subcontracting_grn_items_KZSsINHwVI4O_fkey" FOREIGN KEY ("sco_item_id") REFERENCES "subcontracting_order_items"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_grn_items" ADD CONSTRAINT "subcontracting_grn_items_qa_decided_by_employees_id_fkey" FOREIGN KEY ("qa_decided_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_grns" ADD CONSTRAINT "subcontracting_grns_sco_id_subcontracting_orders_id_fkey" FOREIGN KEY ("sco_id") REFERENCES "subcontracting_orders"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_grns" ADD CONSTRAINT "subcontracting_grns_vendor_id_supplier_master_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_grns" ADD CONSTRAINT "subcontracting_grns_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_order_items" ADD CONSTRAINT "subcontracting_order_items_sco_id_subcontracting_orders_id_fkey" FOREIGN KEY ("sco_id") REFERENCES "subcontracting_orders"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_order_items" ADD CONSTRAINT "subcontracting_order_items_raw_item_id_item_master_id_fkey" FOREIGN KEY ("raw_item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_order_items" ADD CONSTRAINT "subcontracting_order_items_service_id_service_master_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_master"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_order_items" ADD CONSTRAINT "subcontracting_order_items_finished_item_id_item_master_id_fkey" FOREIGN KEY ("finished_item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_orders" ADD CONSTRAINT "subcontracting_orders_vendor_id_supplier_master_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_orders" ADD CONSTRAINT "subcontracting_orders_approved_by_employees_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_orders" ADD CONSTRAINT "subcontracting_orders_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_orders" ADD CONSTRAINT "subcontracting_orders_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_orders" ADD CONSTRAINT "subcontracting_orders_cancelled_by_employees_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "subcontracting_orders" ADD CONSTRAINT "subcontracting_orders_closed_by_employees_id_fkey" FOREIGN KEY ("closed_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_bank_details" ADD CONSTRAINT "supplier_bank_details_supplier_id_supplier_master_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_po_id_purchase_orders_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id");--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_supplier_master_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_invoice_id_supplier_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id");--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_history" ADD CONSTRAINT "supplier_history_supplier_id_supplier_master_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "supplier_history" ADD CONSTRAINT "supplier_history_changed_by_employees_id_fkey" FOREIGN KEY ("changed_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_supplier_id_supplier_master_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_item_id_item_master_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_master"("id");--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_master" ADD CONSTRAINT "supplier_master_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_services" ADD CONSTRAINT "supplier_services_supplier_id_supplier_master_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier_master"("id");--> statement-breakpoint
ALTER TABLE "supplier_services" ADD CONSTRAINT "supplier_services_service_id_service_master_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_master"("id");--> statement-breakpoint
ALTER TABLE "supplier_services" ADD CONSTRAINT "supplier_services_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "supplier_services" ADD CONSTRAINT "supplier_services_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_employees_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "employees"("id");