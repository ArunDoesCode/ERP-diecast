CREATE TABLE "modules" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL UNIQUE
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "module_id" integer;--> statement-breakpoint
ALTER TABLE "role_pages" ADD COLUMN "id" serial;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "role_pages" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "name" SET DATA TYPE text USING "name"::text;--> statement-breakpoint
ALTER TABLE "role_pages" ADD CONSTRAINT "role_pages_role_id_page_id_unique" UNIQUE("role_id","page_id");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_module_id_modules_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id");--> statement-breakpoint
DROP TYPE "role";