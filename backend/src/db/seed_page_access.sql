-- Run after drizzle-kit push to seed roles and page_access
-- Adjust sort_order and icon names to match your sidebar order

-- 1. Roles
INSERT INTO roles (name) VALUES
  ('owner'),
  ('back_office'),
  ('floor_supervisor'),
  ('qa_inspector'),
  ('die_designer'),
  ('operator')
ON CONFLICT DO NOTHING;

-- 2. Page access (page_key must match your Next.js route segment)

-- OWNER
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'shop-floor',   'Shop Floor',         'Activity',     1 FROM roles WHERE name = 'owner';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'job-board',    'Job Board & P&L',    'LayoutList',   2 FROM roles WHERE name = 'owner';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'ar-ap',        'AR / AP',            'ArrowLeftRight',3 FROM roles WHERE name = 'owner';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'payroll',      'Payroll & Attendance','Users',        4 FROM roles WHERE name = 'owner';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'employees',    'Employee Directory', 'IdCard',       5 FROM roles WHERE name = 'owner';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'machine-health','Machine Health',    'Gauge',        6 FROM roles WHERE name = 'owner';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'spare-parts',  'Spare Parts',        'Wrench',       7 FROM roles WHERE name = 'owner';

-- BACK OFFICE
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'customers',    'Customers',          'Building2',    1 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'enquiries',    'Enquiries',          'Mail',         2 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'quotations',   'Quotations',         'FileText',     3 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'sales-orders', 'Sales Orders',       'ShoppingCart', 4 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'jobs',         'Jobs',               'Briefcase',    5 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'dispatch',     'Dispatch Challans',  'Truck',        6 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'suppliers',    'Suppliers',          'Package',      7 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'purchase-orders','Purchase Orders',  'ClipboardList',8 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'grn',          'GRN',                'PackageCheck', 9 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'inventory',    'Inventory',          'Boxes',        10 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'vendor-bills', 'Vendor Bills',       'Receipt',      11 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'invoices',     'Customer Invoices',  'FileCheck',    12 FROM roles WHERE name = 'back_office';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'expenses',     'Expenses',           'Wallet',       13 FROM roles WHERE name = 'back_office';

-- FLOOR SUPERVISOR
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'active-jobs',  'Active Jobs',        'Flame',        1 FROM roles WHERE name = 'floor_supervisor';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'step-assign',  'Step Assignment',    'UserCheck',    2 FROM roles WHERE name = 'floor_supervisor';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'machine-config','Machine Config',    'Settings2',    3 FROM roles WHERE name = 'floor_supervisor';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'die-loading',  'Die Loading',        'Layers',       4 FROM roles WHERE name = 'floor_supervisor';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'scrap-rework', 'Scrap & Rework',     'RefreshCcw',   5 FROM roles WHERE name = 'floor_supervisor';

-- QA INSPECTOR
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'inward-inspection',  'Inward Inspection',   'PackageSearch', 1 FROM roles WHERE name = 'qa_inspector';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'inprocess-inspection','In-Process Inspection','ScanLine',    2 FROM roles WHERE name = 'qa_inspector';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'trial-logs',         'Trial Run Logs',      'FlaskConical',  3 FROM roles WHERE name = 'qa_inspector';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'final-inspection',   'Final Inspection',    'ShieldCheck',   4 FROM roles WHERE name = 'qa_inspector';

-- DIE DESIGNER
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'die-library',   'Die Library',          'Archive',      1 FROM roles WHERE name = 'die_designer';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'design-tasks',  'Die Design Tasks',     'PenTool',      2 FROM roles WHERE name = 'die_designer';
INSERT INTO page_access (role_id, page_key, label, icon, sort_order)
SELECT id, 'cnc-programs',  'CNC Programming',      'Cpu',          3 FROM roles WHERE name = 'die_designer';

-- OPERATOR: no page_access rows — they get PWA only, no sidebar
