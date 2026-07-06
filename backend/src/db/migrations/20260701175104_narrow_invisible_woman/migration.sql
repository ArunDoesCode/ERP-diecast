CREATE TYPE "pr_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'ordered', 'cancelled');--> statement-breakpoint
CREATE TABLE "purchase_requisition_items" (
	"id" serial PRIMARY KEY,
	"pr_id" integer NOT NULL,
	"inventory_id" integer,
	"item_name" text NOT NULL,
	"qty" numeric NOT NULL,
	"uom" text NOT NULL,
	"remarks" text,
	"po_item_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requisitions" (
	"id" serial PRIMARY KEY,
	"status" "pr_status" DEFAULT 'draft'::"pr_status" NOT NULL,
	"requested_by" integer NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"last_updated_by" integer,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grn_items" RENAME COLUMN "unit" TO "uom";--> statement-breakpoint
ALTER TABLE "inventory" RENAME COLUMN "unit" TO "uom";--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
DROP TYPE "po_status";--> statement-breakpoint
CREATE TYPE "po_status" AS ENUM('draft', 'pending_approval', 'approved', 'partial', 'rejected', 'cancelled');--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DATA TYPE "po_status" USING "status"::"po_status";--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'draft'::"po_status";--> statement-breakpoint
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_pr_id_purchase_requisitions_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "purchase_requisitions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_inventory_id_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id");--> statement-breakpoint
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_requisition_items" ADD CONSTRAINT "purchase_requisition_items_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_requested_by_employees_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_approved_by_employees_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_created_by_employees_id_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id");--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_last_updated_by_employees_id_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "employees"("id");