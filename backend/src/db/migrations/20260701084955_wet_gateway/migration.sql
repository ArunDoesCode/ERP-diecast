CREATE TYPE "die_status" AS ENUM('active', 'retired', 'in_design');--> statement-breakpoint
CREATE TYPE "inspection_type" AS ENUM('inward', 'in_process', 'trial', 'final');--> statement-breakpoint
CREATE TYPE "invoice_status" AS ENUM('draft', 'sent', 'partial', 'paid', 'overdue');--> statement-breakpoint
CREATE TYPE "job_status" AS ENUM('enquiry', 'quoted', 'order_received', 'in_production', 'dispatched', 'invoiced', 'complete');--> statement-breakpoint
CREATE TYPE "machine_status" AS ENUM('idle', 'running', 'maintenance', 'breakdown');--> statement-breakpoint
CREATE TYPE "po_status" AS ENUM('draft', 'sent', 'partial', 'complete', 'cancelled');--> statement-breakpoint
CREATE TYPE "role" AS ENUM('owner', 'back_office', 'floor_supervisor', 'qa_inspector', 'die_designer', 'operator');--> statement-breakpoint
CREATE TYPE "step_status" AS ENUM('pending', 'active', 'done', 'blocked', 'rework');--> statement-breakpoint
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
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"label" text NOT NULL,
	"path" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "role_pages" (
	"role_id" integer NOT NULL,
	"page_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY,
	"name" "role" NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"gst_number" text,
	"address" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" serial PRIMARY KEY,
	"customer_id" integer NOT NULL,
	"description" text,
	"files_json" jsonb DEFAULT '[]',
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" serial PRIMARY KEY,
	"enquiry_id" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"amount_paise" integer NOT NULL,
	"delivery_date" timestamp,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" serial PRIMARY KEY,
	"quotation_id" integer,
	"customer_id" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dies" (
	"id" serial PRIMARY KEY,
	"customer_id" integer,
	"part_name" text NOT NULL,
	"material" text,
	"drawings" json DEFAULT '[]',
	"status" "die_status" DEFAULT 'active'::"die_status" NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_challans" (
	"id" serial PRIMARY KEY,
	"job_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"qty" integer NOT NULL,
	"vehicle_number" text,
	"dispatched_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_steps" (
	"id" serial PRIMARY KEY,
	"job_id" integer NOT NULL,
	"step_number" integer NOT NULL,
	"step_name" text NOT NULL,
	"status" "step_status" DEFAULT 'pending'::"step_status" NOT NULL,
	"assigned_to" integer,
	"machine_id" integer,
	"started_at" timestamp,
	"completed_at" timestamp,
	"actual_qty" integer,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY,
	"sales_order_id" integer,
	"die_id" integer,
	"target_qty" integer NOT NULL,
	"status" "job_status" DEFAULT 'in_production'::"job_status" NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machine_logs" (
	"id" serial PRIMARY KEY,
	"machine_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"notes" text,
	"recorded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"type" text,
	"status" "machine_status" DEFAULT 'idle'::"machine_status" NOT NULL,
	"last_maintenance_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spare_parts" (
	"id" serial PRIMARY KEY,
	"machine_id" integer,
	"part_name" text NOT NULL,
	"qty_on_hand" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grn" (
	"id" serial PRIMARY KEY,
	"po_id" integer,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"received_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grn_items" (
	"id" serial PRIMARY KEY,
	"grn_id" integer NOT NULL,
	"item_name" text NOT NULL,
	"qty" numeric NOT NULL,
	"unit" text NOT NULL,
	"unit_cost_paise" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" serial PRIMARY KEY,
	"item_name" text NOT NULL UNIQUE,
	"unit" text NOT NULL,
	"qty_on_hand" numeric DEFAULT '0' NOT NULL,
	"reorder_level" numeric DEFAULT '0' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY,
	"supplier_id" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"status" "po_status" DEFAULT 'draft'::"po_status" NOT NULL,
	"expected_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"gst_number" text,
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_invoices" (
	"id" serial PRIMARY KEY,
	"sales_order_id" integer,
	"customer_id" integer NOT NULL,
	"amount_paise" integer NOT NULL,
	"gst_paise" integer DEFAULT 0 NOT NULL,
	"due_date" timestamp,
	"status" "invoice_status" DEFAULT 'draft'::"invoice_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_payments" (
	"id" serial PRIMARY KEY,
	"invoice_id" integer NOT NULL,
	"amount_paise" integer NOT NULL,
	"method" text,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"recorded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY,
	"category" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"paid_by" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_bills" (
	"id" serial PRIMARY KEY,
	"supplier_id" integer NOT NULL,
	"po_id" integer,
	"amount_paise" integer NOT NULL,
	"gst_paise" integer DEFAULT 0 NOT NULL,
	"due_date" timestamp,
	"status" "invoice_status" DEFAULT 'draft'::"invoice_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_payments" (
	"id" serial PRIMARY KEY,
	"bill_id" integer NOT NULL,
	"amount_paise" integer NOT NULL,
	"method" text,
	"paid_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"recorded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_logs" (
	"id" serial PRIMARY KEY,
	"job_step_id" integer NOT NULL,
	"inspection_type" "inspection_type" NOT NULL,
	"trial_number" integer,
	"pass_qty" integer DEFAULT 0 NOT NULL,
	"fail_qty" integer DEFAULT 0 NOT NULL,
	"defect_notes" text,
	"photos_json" jsonb DEFAULT '[]',
	"inspector_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY,
	"employee_id" integer NOT NULL,
	"date" date NOT NULL,
	"check_in" timestamp,
	"check_out" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" serial PRIMARY KEY,
	"payroll_run_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"days_present" integer DEFAULT 0 NOT NULL,
	"daily_rate_paise" integer NOT NULL,
	"gross_paise" integer NOT NULL,
	"deductions_paise" integer DEFAULT 0 NOT NULL,
	"net_paise" integer NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" serial PRIMARY KEY,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"status" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cnc_programs" (
	"id" serial PRIMARY KEY,
	"die_id" integer NOT NULL,
	"program_file_url" text,
	"machine_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "die_design_tasks" (
	"id" serial PRIMARY KEY,
	"die_id" integer NOT NULL,
	"assigned_to" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_employee_id_employees_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "role_pages" ADD CONSTRAINT "role_pages_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "role_pages" ADD CONSTRAINT "role_pages_page_id_pages_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_enquiry_id_enquiries_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id");--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quotation_id_quotations_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "dies" ADD CONSTRAINT "dies_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "dies" ADD CONSTRAINT "dies_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "dies" ADD CONSTRAINT "dies_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "dispatch_challans" ADD CONSTRAINT "dispatch_challans_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id");--> statement-breakpoint
ALTER TABLE "dispatch_challans" ADD CONSTRAINT "dispatch_challans_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "dispatch_challans" ADD CONSTRAINT "dispatch_challans_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "dispatch_challans" ADD CONSTRAINT "dispatch_challans_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "job_steps" ADD CONSTRAINT "job_steps_job_id_jobs_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "job_steps" ADD CONSTRAINT "job_steps_assigned_to_employees_id_fkey" FOREIGN KEY ("assigned_to") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "job_steps" ADD CONSTRAINT "job_steps_machine_id_machines_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id");--> statement-breakpoint
ALTER TABLE "job_steps" ADD CONSTRAINT "job_steps_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "job_steps" ADD CONSTRAINT "job_steps_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_die_id_dies_id_fkey" FOREIGN KEY ("die_id") REFERENCES "dies"("id");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "machine_logs" ADD CONSTRAINT "machine_logs_machine_id_machines_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id");--> statement-breakpoint
ALTER TABLE "machine_logs" ADD CONSTRAINT "machine_logs_recorded_by_employees_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "machine_logs" ADD CONSTRAINT "machine_logs_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "spare_parts" ADD CONSTRAINT "spare_parts_machine_id_machines_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id");--> statement-breakpoint
ALTER TABLE "spare_parts" ADD CONSTRAINT "spare_parts_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "spare_parts" ADD CONSTRAINT "spare_parts_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "grn" ADD CONSTRAINT "grn_po_id_purchase_orders_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id");--> statement-breakpoint
ALTER TABLE "grn" ADD CONSTRAINT "grn_received_by_employees_id_fkey" FOREIGN KEY ("received_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "grn" ADD CONSTRAINT "grn_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "grn" ADD CONSTRAINT "grn_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_grn_id_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grn"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "grn_items" ADD CONSTRAINT "grn_items_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_sales_order_id_sales_orders_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id");--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_invoice_id_customer_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "customer_invoices"("id");--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_recorded_by_employees_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_employees_id_fkey" FOREIGN KEY ("paid_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_supplier_id_suppliers_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_po_id_purchase_orders_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id");--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_bill_id_vendor_bills_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "vendor_bills"("id");--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_recorded_by_employees_id_fkey" FOREIGN KEY ("recorded_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "qa_logs" ADD CONSTRAINT "qa_logs_job_step_id_job_steps_id_fkey" FOREIGN KEY ("job_step_id") REFERENCES "job_steps"("id");--> statement-breakpoint
ALTER TABLE "qa_logs" ADD CONSTRAINT "qa_logs_inspector_id_employees_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "qa_logs" ADD CONSTRAINT "qa_logs_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "qa_logs" ADD CONSTRAINT "qa_logs_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employees_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_run_id_payroll_runs_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_employees_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "cnc_programs" ADD CONSTRAINT "cnc_programs_die_id_dies_id_fkey" FOREIGN KEY ("die_id") REFERENCES "dies"("id");--> statement-breakpoint
ALTER TABLE "cnc_programs" ADD CONSTRAINT "cnc_programs_machine_id_machines_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id");--> statement-breakpoint
ALTER TABLE "cnc_programs" ADD CONSTRAINT "cnc_programs_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "cnc_programs" ADD CONSTRAINT "cnc_programs_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "die_design_tasks" ADD CONSTRAINT "die_design_tasks_die_id_dies_id_fkey" FOREIGN KEY ("die_id") REFERENCES "dies"("id");--> statement-breakpoint
ALTER TABLE "die_design_tasks" ADD CONSTRAINT "die_design_tasks_assigned_to_employees_id_fkey" FOREIGN KEY ("assigned_to") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "die_design_tasks" ADD CONSTRAINT "die_design_tasks_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "die_design_tasks" ADD CONSTRAINT "die_design_tasks_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");