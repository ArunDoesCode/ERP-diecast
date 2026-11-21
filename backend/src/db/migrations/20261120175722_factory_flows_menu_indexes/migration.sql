CREATE INDEX "idx_grn_items_pending_grn" ON "grn_items" ("grn_id") WHERE "qa_status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_grns_received_date" ON "grns" ("received_date","id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_created_by_status" ON "purchase_orders" ("created_by","status");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_requested_by_status" ON "purchase_requests" ("requested_by","status");--> statement-breakpoint
-- BR-FF-101 menu defaults: move a row only while label, sort_order and menu_group all still equal the old seed.
-- Down: drop the four indexes above; re-insert landing ('/landing', null, 'Landing', 10, 'General');
-- restore old values: setup 'Setup' 15 Admin, employee-directory 'Employee Directory' 230 Admin,
-- suppliers 'Suppliers' 140 Procurement, purchase-orders 'POs (Purchase Orders)' 150 Procurement,
-- purchase-requisitions 'PRs (Purchase Requisitions)' 160 Procurement, grn 'GRN (Goods Receipt Note)' 170 Procurement,
-- inventory 'Inventory' 180 Inventory, approvals 'Approvals' 185 Procurement, subcontracting 'Subcontracting' 165 Procurement.
UPDATE "screens" AS s SET "label" = n.label, "sort_order" = n.sort_order, "menu_group" = n.menu_group
FROM (VALUES
  ('setup', 'Setup', 15, 'Admin', 'Setup', 100, 'Admin'),
  ('employee-directory', 'Employee Directory', 230, 'Admin', 'Employee directory', 90, 'Admin'),
  ('suppliers', 'Suppliers', 140, 'Procurement', 'Suppliers', 80, 'General'),
  ('purchase-orders', 'POs (Purchase Orders)', 150, 'Procurement', 'Purchase orders', 40, 'General'),
  ('purchase-requisitions', 'PRs (Purchase Requisitions)', 160, 'Procurement', 'Requisitions', 30, 'General'),
  ('grn', 'GRN (Goods Receipt Note)', 170, 'Procurement', 'Goods receipts', 50, 'General'),
  ('inventory', 'Inventory', 180, 'Inventory', 'Inventory', 70, 'General'),
  ('approvals', 'Approvals', 185, 'Procurement', 'Approvals', 20, 'General'),
  ('subcontracting', 'Subcontracting', 165, 'Procurement', 'Subcontracting', 60, 'General')
) AS n(key, old_label, old_order, old_group, label, sort_order, menu_group)
WHERE s."key" = n.key AND s."label" = n.old_label AND s."sort_order" = n.old_order AND s."menu_group" = n.old_group;
--> statement-breakpoint
INSERT INTO "screens" ("key", "path", "permission_key", "label", "sort_order", "menu_group")
VALUES ('home', '/home', NULL, 'Home', 10, 'General') ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
DELETE FROM "screens" WHERE "key" = 'landing';
