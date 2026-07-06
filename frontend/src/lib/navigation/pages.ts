export type AppModule =
  | "Dashboards & Analytics"
  | "Sales & CRM"
  | "Production & Shop Floor"
  | "Procurement & Inventory"
  | "Finance & Accounting"
  | "HR & Administration"
  | "Equipment, Maintenance & Tooling"
  | "Quality Assurance"
  | "Die Design & Engineering";

export type AppRole =
  | "Owner"
  | "Back-office"
  | "Floor Supervisor"
  | "Operator"
  | "QA"
  | "Die Designer"
  | "super-admin";

export type AppPageDefinition = {
  path: string;
  title: string;
  module: AppModule;
  roles: AppRole[];
  description: string;
  shellless?: boolean;
};

export const APP_PAGE_DEFINITIONS: AppPageDefinition[] = [
  {
    path: "/setup",
    title: "Setup",
    module: "Dashboards & Analytics",
    roles: ["super-admin"],
    description: "Initial setup and configuration of the ERP system.",
  },
  {
    path: "/landing",
    title: "Landing",
    module: "Dashboards & Analytics",
    roles: ["Owner", "Back-office", "Floor Supervisor", "QA", "Die Designer", "super-admin"],
    description: "Legacy protected landing page during migration.",
  },
  {
    path: "/shop-floor-live-view",
    title: "Shop Floor Live View",
    module: "Dashboards & Analytics",
    roles: ["Owner", "super-admin"],
    description: "Real-time visual dashboard of machine and job status.",
  },
  {
    path: "/job-board",
    title: "Job Board",
    module: "Dashboards & Analytics",
    roles: ["Owner", "super-admin"],
    description: "High-level Kanban or Gantt view of factory jobs.",
  },
  {
    path: "/pnl-statement",
    title: "P&L Statement",
    module: "Dashboards & Analytics",
    roles: ["Owner", "super-admin"],
    description: "Profit and loss financial dashboard.",
  },
  {
    path: "/customers",
    title: "Customers",
    module: "Sales & CRM",
    roles: ["Back-office", "super-admin"],
    description: "Master list and profiles of customers.",
  },
  {
    path: "/enquiries",
    title: "Enquiries",
    module: "Sales & CRM",
    roles: ["Back-office", "super-admin"],
    description: "Lead and inquiry tracking pipeline.",
  },
  {
    path: "/quotations",
    title: "Quotations",
    module: "Sales & CRM",
    roles: ["Back-office", "super-admin"],
    description: "Pricing and estimation management.",
  },
  {
    path: "/sales-orders",
    title: "Sales Orders",
    module: "Sales & CRM",
    roles: ["Back-office", "super-admin"],
    description: "Confirmed orders ready for production.",
  },
  {
    path: "/jobs",
    title: "Jobs / Work Orders",
    module: "Production & Shop Floor",
    roles: ["Back-office", "Floor Supervisor", "super-admin"],
    description:
      "Back-office sees all jobs; supervisors use an active-jobs focused view.",
  },
  {
    path: "/step-assignment",
    title: "Step Assignment",
    module: "Production & Shop Floor",
    roles: ["Floor Supervisor", "super-admin"],
    description: "Assign routing steps to operators and machines.",
  },
  {
    path: "/scrap-rework",
    title: "Scrap & Rework",
    module: "Production & Shop Floor",
    roles: ["Floor Supervisor", "super-admin"],
    description: "Track defective parts and rework actions.",
  },
  {
    path: "/dispatch-challans",
    title: "Dispatch Challans",
    module: "Production & Shop Floor",
    roles: ["Back-office", "super-admin"],
    description: "Delivery notes and shipping documentation.",
  },
  {
    path: "/operator",
    title: "Operator PWA",
    module: "Production & Shop Floor",
    roles: ["Operator", "super-admin"],
    description:
      "Shell-less operator workstation for touch-first production updates.",
    shellless: true,
  },
  {
    path: "/suppliers",
    title: "Suppliers",
    module: "Procurement & Inventory",
    roles: ["Back-office", "super-admin"],
    description: "Vendor master data and profile management.",
  },
  {
    path: "/purchase-orders",
    title: "POs (Purchase Orders)",
    module: "Procurement & Inventory",
    roles: ["Back-office", "super-admin"],
    description: "Outbound purchase orders to suppliers.",
  },
  {
    path: "/purchase-requisitions",
    title: "PRs (Purchase Requisitions)",
    module: "Procurement & Inventory",
    roles: ["Back-office", "super-admin"],
    description: "Outbound purchase requisitions to suppliers.",
  },
  {
    path: "/grn",
    title: "GRN (Goods Receipt Note)",
    module: "Procurement & Inventory",
    roles: ["Back-office", "super-admin"],
    description: "Inbound material receipt and verification.",
  },
  {
    path: "/inventory",
    title: "Inventory",
    module: "Procurement & Inventory",
    roles: ["Back-office", "super-admin"],
    description: "Track raw material, WIP, and finished goods stock.",
  },
  {
    path: "/ar-ap",
    title: "AR/AP",
    module: "Finance & Accounting",
    roles: ["Owner", "super-admin"],
    description: "Cash flow, outstanding payments, and collections overview.",
  },
  {
    path: "/vendor-bills",
    title: "Vendor Bills",
    module: "Finance & Accounting",
    roles: ["Back-office", "super-admin"],
    description: "Inbound supplier invoice processing.",
  },
  {
    path: "/customer-invoices",
    title: "Customer Invoices",
    module: "Finance & Accounting",
    roles: ["Back-office", "super-admin"],
    description: "Outbound invoice generation and tracking.",
  },
  {
    path: "/expenses",
    title: "Expenses",
    module: "Finance & Accounting",
    roles: ["Back-office", "super-admin"],
    description: "Factory and operational expense tracking.",
  },
  {
    path: "/employee-directory",
    title: "Employee Directory",
    module: "HR & Administration",
    roles: ["Owner", "super-admin"],
    description: "Staff directory with core profile details.",
  },
  {
    path: "/payroll-attendance",
    title: "Payroll & Attendance",
    module: "HR & Administration",
    roles: ["Owner", "super-admin"],
    description: "Shift logs, hours worked, and payroll processing shell.",
  },
  {
    path: "/machine-health",
    title: "Machine Health",
    module: "Equipment, Maintenance & Tooling",
    roles: ["Owner", "super-admin"],
    description: "Downtime, maintenance schedules, and OEE indicators.",
  },
  {
    path: "/spare-parts",
    title: "Spare Parts",
    module: "Equipment, Maintenance & Tooling",
    roles: ["Owner", "super-admin"],
    description: "Spare inventory and requisition workflow shell.",
  },
  {
    path: "/machine-config",
    title: "Machine Config",
    module: "Equipment, Maintenance & Tooling",
    roles: ["Floor Supervisor", "super-admin"],
    description: "Machine parameter setup and capability mapping.",
  },
  {
    path: "/die-loading",
    title: "Die Loading",
    module: "Equipment, Maintenance & Tooling",
    roles: ["Floor Supervisor", "super-admin"],
    description: "Assign and track dies on machines.",
  },
  {
    path: "/inward-inspection",
    title: "Inward Inspection",
    module: "Quality Assurance",
    roles: ["QA", "super-admin"],
    description: "Incoming quality checks for purchased materials.",
  },
  {
    path: "/in-process-inspection",
    title: "In-process Inspection",
    module: "Quality Assurance",
    roles: ["QA", "super-admin"],
    description: "Quality checks during production steps.",
  },
  {
    path: "/trial-run-logs",
    title: "Trial Run Logs",
    module: "Quality Assurance",
    roles: ["QA", "super-admin"],
    description: "Die trial logs and sample approvals.",
  },
  {
    path: "/final-inspection",
    title: "Final Inspection",
    module: "Quality Assurance",
    roles: ["QA", "super-admin"],
    description: "Final quality sign-off before dispatch.",
  },
  {
    path: "/die-library",
    title: "Die Library",
    module: "Die Design & Engineering",
    roles: ["Die Designer", "super-admin"],
    description: "Repository of die designs, CAD files, and specs.",
  },
  {
    path: "/die-design-tasks",
    title: "Die Design Tasks",
    module: "Die Design & Engineering",
    roles: ["Die Designer", "super-admin"],
    description: "Task board for design requests and modifications.",
  },
  {
    path: "/cnc-machine-programming",
    title: "CNC Machine Programming",
    module: "Die Design & Engineering",
    roles: ["Die Designer", "super-admin"],
    description: "Toolpath and CNC code management shell.",
  },
];

const APP_PAGE_MAP = new Map(
  APP_PAGE_DEFINITIONS.map((page) => [page.path, page]),
);

export function normalizeAllowedPath(path: string) {
  if (!path) {
    return "";
  }

  if (path === "/") {
    return "/";
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function getPageDefinition(path: string) {
  return APP_PAGE_MAP.get(normalizeAllowedPath(path));
}

export function getSidebarSections(allowedPages: string[]) {
  const grouped = new Map<AppModule, AppPageDefinition[]>();

  for (const allowedPath of allowedPages) {
    const page = getPageDefinition(allowedPath);
    if (!page || page.shellless) {
      continue;
    }

    const existingGroup = grouped.get(page.module) ?? [];
    existingGroup.push(page);
    grouped.set(page.module, existingGroup);
  }

  return Array.from(grouped.entries()).map(([module, pages]) => ({
    module,
    pages,
  }));
}

export function getDefaultShellPagePaths() {
  return APP_PAGE_DEFINITIONS.filter((page) => !page.shellless).map(
    (page) => page.path,
  );
}
