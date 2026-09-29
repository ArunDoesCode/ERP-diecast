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

/** Built pages only (frontend/src/app/(protected)); keys/paths/labels/order from seed_page_access.sql. */
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
  inventory: s("/inventory", "inventory.view", "Inventory", 180, "Inventory"),
  approvals: s("/approvals", null, "Approvals", 185, "Procurement"),
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
    "supplier.view",
    "pr.manage",
    "po.manage",
    "grn.view",
    "grn.edit_draft",
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
  ],
  back_office: [
    "pr.link_machine",
    "asset.manage",
    "inventory.adjust",
    "inventory.view",
    "supplier.view",
    "supplier.manage",
    "pr.manage",
    "po.manage",
    "grn.view",
    "grn.edit_draft",
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
  ],
  floor_supervisor: [
    "inventory.view",
    "supplier.view",
    "pr.manage",
    "pr.link_machine",
    "grn.view",
    "grn.edit_draft",
    "sco.view",
    "sco.issue_receive",
  ],
  qa_inspector: ["grn.view", "grn.qa_decide", "sco.view", "sco.qa_decide"],
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
