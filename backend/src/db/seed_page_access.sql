-- 1. Create Roles 
BEGIN;

WITH role_seed(name) AS (
  VALUES
    ('super-admin'),
    ('owner'),
    ('back_office'),
    ('floor_supervisor'),
    ('operator'),
    ('qa_inspector'),
    ('die_designer')
)
INSERT INTO roles (name)
SELECT name
FROM role_seed
ON CONFLICT (name) DO NOTHING;

COMMIT;

insert into pages (key, label, path, sort_order) values ('setup', 'Setup', '/setup', 15) on conflict (key) do update set label = excluded.label, path = excluded.path, sort_order = excluded.sort_order;

--2.create all pages in ui
BEGIN;

WITH page_seed(key, label, path, sort_order) AS (
  VALUES
    ('landing','Landing','/landing',10),
    ('setup','Setup','/setup',15),
    ('shop-floor-live-view','Shop Floor Live View','/shop-floor-live-view',20),
    ('job-board','Job Board','/job-board',30),
    ('pnl-statement','P&L Statement','/pnl-statement',40),
    ('customers','Customers','/customers',50),
    ('enquiries','Enquiries','/enquiries',60),
    ('quotations','Quotations','/quotations',70),
    ('sales-orders','Sales Orders','/sales-orders',80),
    ('jobs','Jobs / Work Orders','/jobs',90),
    ('step-assignment','Step Assignment','/step-assignment',100),
    ('scrap-rework','Scrap & Rework','/scrap-rework',110),
    ('dispatch-challans','Dispatch Challans','/dispatch-challans',120),
    ('operator','Operator PWA','/operator',130),
    ('suppliers','Suppliers','/suppliers',140),
    ('purchase-orders','POs (Purchase Orders)','/purchase-orders',150),
    ('purchase-requisitions','PRs (Purchase Requisitions)','/purchase-requisitions',160),
    ('grn','GRN (Goods Receipt Note)','/grn',170),
    ('inventory','Inventory','/inventory',180),
    ('ar-ap','AR/AP','/ar-ap',190),
    ('vendor-bills','Vendor Bills','/vendor-bills',200),
    ('customer-invoices','Customer Invoices','/customer-invoices',210),
    ('expenses','Expenses','/expenses',220),
    ('employee-directory','Employee Directory','/employee-directory',230),
    ('payroll-attendance','Payroll & Attendance','/payroll-attendance',240),
    ('machine-health','Machine Health','/machine-health',250),
    ('spare-parts','Spare Parts','/spare-parts',260),
    ('machine-config','Machine Config','/machine-config',270),
    ('die-loading','Die Loading','/die-loading',280),
    ('inward-inspection','Inward Inspection','/inward-inspection',290),
    ('in-process-inspection','In-process Inspection','/in-process-inspection',300),
    ('trial-run-logs','Trial Run Logs','/trial-run-logs',310),
    ('final-inspection','Final Inspection','/final-inspection',320),
    ('die-library','Die Library','/die-library',330),
    ('die-design-tasks','Die Design Tasks','/die-design-tasks',340),
    ('cnc-machine-programming','CNC Machine Programming','/cnc-machine-programming',350)
)
INSERT INTO pages (key, label, path, sort_order)
SELECT key, label, path, sort_order
FROM page_seed
ON CONFLICT (key) DO UPDATE
SET
  label = EXCLUDED.label,
  path = EXCLUDED.path,
  sort_order = EXCLUDED.sort_order;

COMMIT;

-- 3. Standard Role -> Page permissions
BEGIN;
WITH role_page_seed(role_name, page_key) AS (
  VALUES
    ('owner','landing'),
    ('owner','shop-floor-live-view'),
    ('owner','job-board'),
    ('owner','pnl-statement'),
    ('owner','ar-ap'),
    ('owner','employee-directory'),
    ('owner','payroll-attendance'),
    ('owner','machine-health'),
    ('owner','spare-parts'),

    ('back-office','landing'),
    ('back-office','customers'),
    ('back-office','enquiries'),
    ('back-office','quotations'),
    ('back-office','sales-orders'),
    ('back-office','jobs'),
    ('back-office','dispatch-challans'),
    ('back-office','suppliers'),
    ('back-office','purchase-orders'),
    ('back-office','purchase-requisitions'),
    ('back-office','grn'),
    ('back-office','inventory'),
    ('back-office','vendor-bills'),
    ('back-office','customer-invoices'),
    ('back-office','expenses'),

    ('floor_supervisor','landing'),
    ('floor_supervisor','jobs'),
    ('floor_supervisor','step-assignment'),
    ('floor_supervisor','scrap-rework'),
    ('floor_supervisor','machine-config'),
    ('floor_supervisor','die-loading'),

    ('operator','operator'),

    ('qa_inspector','landing'),
    ('qa_inspector','inward-inspection'),
    ('qa_inspector','in-process-inspection'),
    ('qa_inspector','trial-run-logs'),
    ('qa_inspector','final-inspection'),

    ('die_designer','landing'),
    ('die_designer','die-library'),
    ('die_designer','die-design-tasks'),
    ('die_designer','cnc-machine-programming')
)
INSERT INTO role_pages (role_id, page_id)
SELECT r.id, p.id
FROM role_page_seed s
JOIN roles r ON r.name = s.role_name
JOIN pages p ON p.key = s.page_key
WHERE NOT EXISTS (
  SELECT 1
  FROM role_pages rp
  WHERE rp.role_id = r.id
    AND rp.page_id = p.id
);

-- 3. Assign ALL existing pages to the 'super-admin' role automatically
INSERT INTO role_pages (role_id, page_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN pages p
WHERE r.name = 'super-admin'
AND NOT EXISTS (
  SELECT 1
  FROM role_pages rp
  WHERE rp.role_id = r.id
    AND rp.page_id = p.id
);

COMMIT;
