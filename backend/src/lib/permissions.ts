/**
 * Permission + screen catalog (auth-setup BR-AUTH-06, 21, 24).
 * Code owns the keys and screens; the DB copy is synced from here (see SyncCatalogFn).
 * `PERMISSION_KEYS` feeds the actor load in `auth-middleware.ts` (super-admin holds every key);
 * route guards read keys through `requirePermission` / `can`, not this file.
 */

export type PermissionDef = {
  module: string;
  label: string;
  description: string;
  /** false = the grant API rejects it with 400 KEY_NOT_GRANTABLE (BR-AUTH-07). */
  grantable: boolean;
};

const p = (
  module: string,
  label: string,
  description: string,
  grantable = true,
): PermissionDef => ({ module, label, description, grantable });

export const PERMISSIONS = {
  "setup.roles.manage": p(
    "setup",
    "Manage roles and access",
    "Create, copy, rename and delete roles, edit grants and screens, read the access log",
    false,
  ),
  "setup.employees.manage": p(
    "setup",
    "Manage employees",
    "Create, edit and deactivate employees, assign roles, regenerate QR",
  ),
  "employees.directory.view": p(
    "employees",
    "View employee directory",
    "Open the employee directory screen",
  ),
  "asset.manage": p(
    "asset",
    "Manage assets",
    "Items, services, machines, locations and other /asset routes",
  ),
  "inventory.adjust": p(
    "inventory",
    "Adjust stock",
    "Post stock-take and opening stock",
  ),
  "inventory.view": p(
    "inventory",
    "View inventory",
    "See items, stock and movement list",
  ),
  "stock_transfer.manage": p(
    "inventory",
    "Manage stock transfers",
    "Create, edit, cancel and post a stock transfer between locations",
  ),
  "stock_transfer.reverse": p(
    "inventory",
    "Reverse stock transfers",
    "Reverse a posted stock transfer",
  ),
  "supplier.view": p(
    "supplier",
    "View suppliers",
    "Supplier list, search and details",
  ),
  "supplier.manage": p(
    "supplier",
    "Manage suppliers",
    "Create, edit, deactivate suppliers and price lists",
  ),
  "pr.manage": p(
    "pr",
    "Manage purchase requisitions",
    "All purchase requisition actions",
  ),
  "pr.link_machine": p(
    "pr",
    "Link machine on PR",
    "Fill the PR Machine field and read the machine list for it",
  ),
  "po.manage": p(
    "po",
    "Manage purchase orders",
    "All purchase order actions, tracking and buttons",
  ),
  "grn.view": p("grn", "View GRNs", "GRN list and details"),
  "grn.edit_draft": p(
    "grn",
    "Edit draft GRN",
    "Create, update and delete a draft GRN",
  ),
  "grn.qa_decide": p(
    "grn",
    "Decide GRN QA",
    "Accept or reject on the GRN QA action",
  ),
  "grn.qa_bypass": p("grn", "Bypass GRN QA", "Bypass the QA step on a GRN"),
  "grn.correct": p(
    "grn",
    "Correct a posted GRN line",
    "Post a correction to a received GRN line",
  ),
  "grn.over_receipt_override": p(
    "grn",
    "Override over-receipt",
    "Receive above the PO quantity",
  ),
  "purchase_return.view": p(
    "purchase-return",
    "View purchase returns",
    "Purchase return list, awaiting-return lines, details and prints",
  ),
  "purchase_return.edit_draft": p(
    "purchase-return",
    "Edit draft purchase returns",
    "Create, edit and cancel a draft purchase return",
  ),
  "purchase_return.post": p(
    "purchase-return",
    "Post purchase returns",
    "Post a return: goods leave stock and the debit note is made",
  ),
  "purchase_return.cancel_posted": p(
    "purchase-return",
    "Cancel posted purchase returns",
    "Cancel a posted return with a reason, stock comes back",
  ),
  "invoice.view": p(
    "invoice",
    "View supplier invoices",
    "Supplier invoice list, details and the match tolerances",
  ),
  "invoice.manage": p(
    "invoice",
    "Manage supplier invoices",
    "Enter, edit, submit, send back to draft and cancel a supplier invoice",
  ),
  "invoice.release": p(
    "invoice",
    "Release blocked supplier invoices",
    "Release a bill the 3-way match blocked, with a reason",
  ),
  "rfq.view": p(
    "rfq",
    "View RFQs and quotes",
    "RFQ list and details, supplier quotes, comparison grid, print supplier sheets",
  ),
  "rfq.manage": p(
    "rfq",
    "Manage RFQs and quotes",
    "Create, edit, send, close and cancel an RFQ; enter, edit, submit and cancel draft quotes",
  ),
  "rfq.award": p(
    "rfq",
    "Award RFQ lines",
    "Award quote lines to suppliers (with PO create) and cancel a submitted quote",
  ),
  "contract.view": p(
    "contract",
    "View rate contracts",
    "Rate contract list, details, fulfilment, and contract rates in PO suggestions",
  ),
  "contract.manage": p(
    "contract",
    "Manage rate contracts",
    "Create, edit, activate, terminate and cancel a rate contract",
  ),
  "contract.override_rate": p(
    "contract",
    "Override contract rate on a PO",
    "Put a PO line rate different from its active contract rate, with a reason",
  ),
  "approval.policy.view": p(
    "approval",
    "View approval policies",
    "List and view approval policies",
  ),
  "approval.policy.manage": p(
    "approval",
    "Manage approval policies",
    "Create and update approval policies",
  ),
  "approval.view_all": p(
    "approval",
    "View all approval requests",
    "Read any approval request",
  ),
  "approval.view_others_pending": p(
    "approval",
    "View others' pending approvals",
    "See another employee's pending list",
  ),
  "approval.auto_approve_own": p(
    "approval",
    "Auto-approve own requests",
    "Own requests skip the approval chain",
  ),
  "sco.view": p("sco", "View subcontracting", "Read subcontracting screens"),
  "sco.manage": p(
    "sco",
    "Manage subcontract orders",
    "Create, edit, submit and cancel a subcontract order",
  ),
  "sco.close": p(
    "sco",
    "Close subcontract order",
    "Close an order with nothing left at the vendor",
  ),
  "sco.issue_receive": p(
    "sco",
    "Issue and receive SCO material",
    "Issue material (challan) and enter receipts",
  ),
  "sco.qa_decide": p(
    "sco",
    "Decide SCO receipt QA",
    "Accept or reject SCO receipt lines",
  ),
  "sco.loss_override": p(
    "sco",
    "Close SCO with loss write-off",
    "Close a subcontract order with a loss write-off",
  ),
  "bom.view": p(
    "bom",
    "View BOMs",
    "Read bills of materials and run the needs preview",
  ),
  "bom.manage": p(
    "bom",
    "Manage BOMs",
    "Create, edit and delete draft BOMs, start a new revision",
  ),
  "bom.release": p(
    "bom",
    "Release and retire BOMs",
    "Release a draft BOM to active and retire an active BOM",
  ),
  "so.view": p(
    "sale-order",
    "View sale orders",
    "See customers and sale orders (with prices) and BOM explosions (no prices)",
  ),
  "so.manage": p(
    "sale-order",
    "Manage sale orders",
    "Create, edit, confirm, hold, resume, close and cancel sale orders",
  ),
  "so.explode": p(
    "sale-order",
    "Explode sale orders",
    "Run the BOM explosion and create draft PRs and SCOs from it",
  ),
  "customer.manage": p(
    "sale-order",
    "Manage customers",
    "Create and edit customers, activate and deactivate them",
  ),
  "reorder.manage": p(
    "reorder",
    "Manage automatic reorder",
    "Change the daily check (on or off, run time, draft owner) and press Check now",
  ),
  "company.manage": p(
    "company",
    "Manage company settings",
    "Edit our company name, address, GSTIN and state for the job-work challan",
  ),
} as const satisfies Record<string, PermissionDef>;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export type ScreenDef = {
  path: string;
  /** Key needed to see/open the screen (BR-AUTH-15). null = any signed-in user. */
  permission: PermissionKey | null;
  /** Defaults only: the UI owns label/order/menuGroup after first sync. */
  defaultLabel: string;
  defaultOrder: number;
  defaultMenuGroup: string;
};

const s = (
  path: string,
  permission: PermissionKey | null,
  defaultLabel: string,
  defaultOrder: number,
  defaultMenuGroup: string,
): ScreenDef => ({
  path,
  permission,
  defaultLabel,
  defaultOrder,
  defaultMenuGroup,
});

/** Built pages only (frontend/src/app/(protected)); keys/paths/labels/order from permissions-sync.ts. */
export const SCREENS = {
  landing: s("/landing", null, "Landing", 10, "General"),
  setup: s("/setup", "setup.roles.manage", "Setup", 15, "Admin"),
  "employee-directory": s(
    "/employee-directory",
    "employees.directory.view",
    "Employee Directory",
    230,
    "Admin",
  ),
  suppliers: s("/suppliers", "supplier.view", "Suppliers", 140, "Procurement"),
  "purchase-orders": s(
    "/purchase-orders",
    "po.manage",
    "POs (Purchase Orders)",
    150,
    "Procurement",
  ),
  "purchase-requisitions": s(
    "/purchase-requisitions",
    "pr.manage",
    "PRs (Purchase Requisitions)",
    160,
    "Procurement",
  ),
  grn: s("/grn", "grn.view", "GRN (Goods Receipt Note)", 170, "Procurement"),
  "purchase-returns": s(
    "/purchase-returns",
    "purchase_return.view",
    "Purchase Returns",
    175,
    "Procurement",
  ),
  "supplier-invoices": s(
    "/supplier-invoices",
    "invoice.view",
    "Supplier Invoices",
    177,
    "Procurement",
  ),
  rfq: s(
    "/rfq",
    "rfq.view",
    "RFQs (Requests for Quotation)",
    172,
    "Procurement",
  ),
  "rate-contracts": s(
    "/rate-contracts",
    "contract.view",
    "Rate Contracts",
    173,
    "Procurement",
  ),
  inventory: s("/inventory", "inventory.view", "Inventory", 180, "Inventory"),
  approvals: s("/approvals", null, "Approvals", 185, "Procurement"),
  subcontracting: s(
    "/subcontracting",
    "sco.view",
    "Subcontracting",
    165,
    "Procurement",
  ),
  bom: s("/bom", "bom.view", "BOM (Bill of Materials)", 175, "Inventory"),
  reorder: s(
    "/inventory/reorder",
    "inventory.view",
    "Reorder",
    182,
    "Inventory",
  ),
  "stock-transfers": s(
    "/inventory/stock-transfers",
    "inventory.view",
    "Stock Transfers",
    183,
    "Inventory",
  ),
  "sale-orders": s("/sale-orders", "so.view", "Sale Orders", 120, "Sales"),
  customers: s("/customers", "so.view", "Customers", 125, "Sales"),
} as const satisfies Record<string, ScreenDef>;

export type ScreenKey = keyof typeof SCREENS;

export type RoleSeedName =
  | "super-admin"
  | "owner"
  | "back_office"
  | "floor_supervisor"
  | "qa_inspector"
  | "die_designer"
  | "operator";

/** Seed grants per spec table (BR-AUTH-21). super-admin has none: bypass (BR-AUTH-18). */
export const SEED_GRANTS: Record<RoleSeedName, PermissionKey[]> = {
  "super-admin": [],
  owner: [
    "pr.link_machine",
    "employees.directory.view",
    "inventory.adjust",
    "inventory.view",
    "stock_transfer.manage",
    "stock_transfer.reverse",
    "supplier.view",
    "pr.manage",
    "po.manage",
    "grn.view",
    "grn.edit_draft",
    "purchase_return.view",
    "purchase_return.edit_draft",
    "purchase_return.post",
    "purchase_return.cancel_posted",
    "invoice.view",
    "invoice.manage",
    "invoice.release",
    "rfq.view",
    "rfq.manage",
    "rfq.award",
    "contract.view",
    "contract.manage",
    "contract.override_rate",
    "grn.qa_decide",
    "grn.qa_bypass",
    "grn.correct",
    "grn.over_receipt_override",
    "approval.policy.view",
    "approval.view_all",
    "approval.auto_approve_own",
    "sco.view",
    "sco.manage",
    "sco.close",
    "sco.issue_receive",
    "sco.qa_decide",
    "sco.loss_override",
    "bom.view",
    "bom.manage",
    "bom.release",
    "so.view",
    "so.manage",
    "so.explode",
    "customer.manage",
    "reorder.manage",
    "company.manage",
  ],
  back_office: [
    "pr.link_machine",
    "asset.manage",
    "inventory.adjust",
    "inventory.view",
    "stock_transfer.manage",
    "stock_transfer.reverse",
    "supplier.view",
    "supplier.manage",
    "pr.manage",
    "po.manage",
    "grn.view",
    "grn.edit_draft",
    "purchase_return.view",
    "purchase_return.edit_draft",
    "purchase_return.post",
    "purchase_return.cancel_posted",
    "invoice.view",
    "invoice.manage",
    "rfq.view",
    "rfq.manage",
    "rfq.award",
    "contract.view",
    "grn.qa_decide",
    "grn.qa_bypass",
    "grn.correct",
    "grn.over_receipt_override",
    "approval.policy.view",
    "approval.view_all",
    "sco.view",
    "sco.manage",
    "sco.close",
    "sco.issue_receive",
    "sco.qa_decide",
    "bom.view",
    "bom.manage",
    "so.view",
    "so.manage",
    "so.explode",
    "customer.manage",
    "reorder.manage",
  ],
  floor_supervisor: [
    "inventory.view",
    "supplier.view",
    "pr.manage",
    "pr.link_machine",
    "grn.view",
    "grn.edit_draft",
    "purchase_return.view",
    "purchase_return.edit_draft",
    "sco.view",
    "sco.issue_receive",
    "bom.view",
  ],
  qa_inspector: [
    "grn.view",
    "grn.qa_decide",
    "purchase_return.view",
    "sco.view",
    "sco.qa_decide",
  ],
  die_designer: ["grn.view"],
  operator: [],
};

export type SyncCatalogResult = {
  permissions: { inserted: number; updated: number; deleted: number };
  screens: { inserted: number; updated: number; deleted: number };
};

/**
 * Catalog -> DB, idempotent. Permissions: insert new, update label/description/module/grantable,
 * delete removed (cascades role_permissions) + audit row. Screens: insert new with defaults;
 * update only path/permissionKey of existing (never label/sortOrder/menuGroup); delete removed + audit row.
 * Not implemented in S2 (signature only).
 */
export type SyncCatalogFn = () => Promise<SyncCatalogResult>;

/** Grants the seed for roles that exist; only inserts missing rows (never removes admin edits). Signature only. */
export type SeedGrantsFn = () => Promise<{ inserted: number }>;
