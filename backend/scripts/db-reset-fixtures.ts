/**
 * Demo data for `db:reset` (known-defects BR-KD-44, BR-KD-46).
 * Everything goes through the real services as named fixture users, so document numbers,
 * approval trails and ledger rows are real. Stock arrives only through GRN postings; nothing
 * here sets stock or average cost. All money is integer paise. Dates are relative to the run.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { roles } from "../src/db/schemas/01_auth";
import { approvalRequests } from "../src/db/schemas/02_procurement-approval";
import { purchaseOrders } from "../src/db/schemas/02_procurement-purchasing";
import { employees } from "../src/db/schemas/03_hcm";
import { type Actor, loadActor } from "../src/lib/auth-middleware";
import { approvalService } from "../src/service/approvalService";
import { assetService } from "../src/service/assetService";
import { employeeService } from "../src/service/employeeService";
import { grnService } from "../src/service/grnService";
import { poService } from "../src/service/poService";
import { prService } from "../src/service/prService";
import { supplierService } from "../src/service/supplierService";

const DESK_ROLES = [
  "owner",
  "back_office",
  "floor_supervisor",
  "qa_inspector",
  "die_designer",
] as const;
type DeskRole = (typeof DESK_ROLES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY_MS);

// name, sku, category, uom, standard rate (paise; the column does not exist yet, see report)
const ITEMS = [
  {
    sku: "RM-ADC12",
    name: "ADC12 Aluminium Ingot",
    category: "Raw Material",
    uom: "kg",
    ratePaise: 24_500,
  },
  {
    sku: "RM-LM24",
    name: "LM24 Aluminium Ingot",
    category: "Raw Material",
    uom: "kg",
    ratePaise: 26_000,
  },
  {
    sku: "CN-RELEASE",
    name: "Die Release Agent",
    category: "Consumable",
    uom: "ltr",
    ratePaise: 45_000,
  },
  {
    sku: "CN-FLUX",
    name: "Cover Flux",
    category: "Consumable",
    uom: "kg",
    ratePaise: 18_000,
  },
  {
    sku: "RM-H13",
    name: "H13 Die Steel Block",
    category: "Raw Material",
    uom: "kg",
    ratePaise: 42_000,
  },
  {
    sku: "SP-PLUNGER",
    name: "Plunger Tip",
    category: "Spare Part",
    uom: "pcs",
    ratePaise: 850_000,
  },
  {
    sku: "SP-SLEEVE",
    name: "Shot Sleeve",
    category: "Spare Part",
    uom: "pcs",
    ratePaise: 1_200_000,
  },
  {
    sku: "CN-GLOVES",
    name: "Safety Gloves",
    category: "Consumable",
    uom: "pair",
    ratePaise: 6_500,
  },
] as const;
type Sku = (typeof ITEMS)[number]["sku"];

const SUPPLIERS = [
  {
    key: "hindalco",
    name: "Hindalco Ingot Traders",
    type: "raw_material",
    gst: "27AABCH1234A1Z5",
    pan: "AABCH1234A",
    skus: ["RM-ADC12", "RM-LM24"],
  },
  {
    key: "foseco",
    name: "Foseco Foundry Supplies",
    type: "consumables",
    gst: "29AAACF5678B1Z2",
    pan: "AAACF5678B",
    skus: ["CN-RELEASE", "CN-FLUX"],
  },
  {
    key: "bharat",
    name: "Bharat Tool Steels",
    type: "raw_material",
    gst: "24AADCB2345C1Z8",
    pan: "AADCB2345C",
    skus: ["RM-H13", "SP-PLUNGER", "SP-SLEEVE"],
  },
  {
    key: "safetymart",
    name: "Safety Mart Industrial",
    type: "trader",
    gst: "33AAGCS9012D1Z4",
    pan: "AAGCS9012D",
    skus: ["CN-GLOVES"],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  name: string;
  type: "raw_material" | "consumables" | "trader";
  gst: string;
  pan: string;
  skus: readonly Sku[];
}>;
type SupplierKey = (typeof SUPPLIERS)[number]["key"];

export async function runFixtures(opts: {
  adminEmail: string;
  password: string;
}): Promise<string[]> {
  const log = (msg: string) => console.log(`  ${msg}`);

  // ---- people (BR-KD-44) ----
  const [adminRow] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.email, opts.adminEmail));
  if (!adminRow) throw new Error("admin employee not found");
  const adminId = adminRow.id;
  const admin = await mustLoad(adminId);

  const roleRows = await db.select().from(roles);
  const roleId = (name: string) => {
    const r = roleRows.find((x) => x.name === name);
    if (!r) throw new Error(`role '${name}' is not seeded`);
    return r.id;
  };

  const userId = {} as Record<DeskRole, number>;
  const actors = {} as Record<DeskRole, Actor>;
  for (const role of DESK_ROLES) {
    const created = await employeeService.create(
      {
        name: `Fixture ${role}`,
        roleId: roleId(role),
        loginMethod: "password",
        email: `${role}@diecast.local`,
        password: opts.password,
      },
      admin,
    );
    userId[role] = created.id;
    actors[role] = await mustLoad(created.id);
  }
  await employeeService.create(
    { name: "Fixture Operator", roleId: roleId("operator"), loginMethod: "qr" },
    admin,
  );
  log("users: 5 desk logins + 1 QR-only operator");

  // ---- locations, machines ----
  await assetService.createLocation({
    name: "Main Store",
    type: "main_store",
    isVirtual: false,
  });
  await assetService.createLocation({
    name: "Scrap Yard",
    type: "scrap_yard",
    isVirtual: false,
  });
  await assetService.createMachine(
    { name: "HPDC 250T", type: "HPDC", status: "idle" },
    adminId,
  );
  await assetService.createMachine(
    { name: "HPDC 400T", type: "HPDC", status: "idle" },
    adminId,
  );

  // ---- items ----
  const itemId = {} as Record<Sku, number>;
  for (const item of ITEMS) {
    const created = await assetService.createItem(
      {
        sku: item.sku,
        name: item.name,
        category: item.category,
        uom: item.uom,
      },
      adminId,
    );
    itemId[item.sku] = created.id;
  }

  // ---- suppliers with priced items ----
  const supplierId = {} as Record<SupplierKey, number>;
  for (const s of SUPPLIERS) {
    const created = await supplierService.create(
      {
        name: s.name,
        type: s.type,
        gstNumber: s.gst,
        panNumber: s.pan,
        defaultPaymentTermsDays: 30,
        supplierItems: s.skus.map((sku) => {
          const item = ITEMS.find((i) => i.sku === sku);
          if (!item) throw new Error(`unknown sku ${sku}`);
          return {
            itemId: itemId[sku],
            supplierUnitPricePaise: item.ratePaise,
            taxPercentage: 18,
            leadTimeDays: 7,
            uom: item.uom,
          };
        }),
      },
      adminId,
    );
    supplierId[s.key] = created.supplier.id;
  }
  log("master data: 2 locations, 2 machines, 8 items, 4 suppliers");

  // ---- helpers ----
  const rate = (sku: Sku) => {
    const item = ITEMS.find((i) => i.sku === sku);
    if (!item) throw new Error(`unknown sku ${sku}`);
    return item.ratePaise;
  };

  /** Act on an approval request as whoever holds the current step's role; never the requester. */
  async function decide(
    requestId: number,
    action: "approve" | "reject",
    notes: string,
    requesterId: number,
  ) {
    for (;;) {
      const [req] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, requestId));
      if (!req) throw new Error(`approval request ${requestId} not found`);
      if (req.status !== "pending_approval") return req;
      const role = req.currentApproverRole as DeskRole | null;
      if (!role || !(role in userId)) {
        throw new Error(`no fixture user for approver role '${role}'`);
      }
      const approverId = userId[role];
      if (approverId === requesterId) {
        throw new Error(`fixture approver ${role} is also the requester`);
      }
      await approvalService.actOnRequest(
        requestId,
        { action, notes },
        approverId,
      );
    }
  }

  type PrLine = { sku: Sku; qty: number };
  async function makePr(
    requester: DeskRole,
    type: "stock_reorder" | "tooling" | "misc",
    lines: PrLine[],
    notes: string,
  ) {
    const created = await prService.create(
      {
        type,
        notes,
        items: lines.map((l) => ({
          itemId: itemId[l.sku],
          requestedQty: l.qty,
        })),
      },
      userId[requester],
      actors[requester],
    );
    const lineBySku = {} as Record<string, number>;
    for (const it of created.items) {
      const sku = ITEMS.find((i) => itemId[i.sku] === it.itemId)?.sku;
      if (sku) lineBySku[sku] = it.id;
    }
    return {
      id: created.pr.id,
      requester,
      line: (sku: Sku) => must(lineBySku[sku], `PR line ${sku}`),
    };
  }
  type Pr = Awaited<ReturnType<typeof makePr>>;

  async function submitPr(pr: Pr) {
    return approvalService.submitRequest(
      { docType: "pr", docId: pr.id },
      userId[pr.requester],
      actors[pr.requester],
    );
  }
  async function approvedPr(
    requester: DeskRole,
    type: "stock_reorder" | "tooling" | "misc",
    lines: PrLine[],
    notes: string,
  ) {
    const pr = await makePr(requester, type, lines, notes);
    const req = await submitPr(pr);
    await decide(req.id, "approve", `Approved: ${notes}`, userId[requester]);
    return pr;
  }

  // ---- PRs in all 7 statuses (BR-KD-44) ----
  await makePr(
    "floor_supervisor",
    "misc",
    [{ sku: "CN-GLOVES", qty: 100 }],
    "Gloves for new hires (draft)",
  );

  await submitPr(
    await makePr(
      "floor_supervisor",
      "misc",
      [{ sku: "CN-FLUX", qty: 300 }],
      "Flux top-up, waiting for approval",
    ),
  );

  await approvedPr(
    "floor_supervisor",
    "stock_reorder",
    [{ sku: "CN-GLOVES", qty: 500 }],
    "Monthly gloves stock",
  );

  {
    const pr = await makePr(
      "die_designer",
      "tooling",
      [{ sku: "RM-H13", qty: 100 }],
      "Spare die block",
    );
    const req = await submitPr(pr);
    await decide(
      req.id,
      "reject",
      "Rejected: block already in stock, reuse it",
      userId.die_designer,
    );
  }

  {
    const pr = await makePr(
      "floor_supervisor",
      "misc",
      [{ sku: "CN-FLUX", qty: 50 }],
      "Flux, raised twice by mistake",
    );
    await submitPr(pr);
    await prService.cancel(pr.id, "Duplicate request", actors.floor_supervisor);
  }

  // partial_ordered: two lines, only ADC12 goes on a PO (PO1 below)
  const prPartial = await approvedPr(
    "floor_supervisor",
    "stock_reorder",
    [
      { sku: "RM-ADC12", qty: 1000 },
      { sku: "CN-RELEASE", qty: 400 },
    ],
    "Ingot and release agent for the month",
  );
  const prLm24 = await approvedPr(
    "floor_supervisor",
    "stock_reorder",
    [{ sku: "RM-LM24", qty: 800 }],
    "LM24 for new job",
  );
  const prFlux = await approvedPr(
    "floor_supervisor",
    "stock_reorder",
    [{ sku: "CN-FLUX", qty: 1000 }],
    "Flux for the quarter",
  );
  const prRelease = await approvedPr(
    "floor_supervisor",
    "stock_reorder",
    [{ sku: "CN-RELEASE", qty: 300 }],
    "Release agent, urgent",
  );
  const prTools = await approvedPr(
    "die_designer",
    "tooling",
    [
      { sku: "RM-H13", qty: 500 },
      { sku: "SP-PLUNGER", qty: 20 },
    ],
    "H13 and plunger tips for die build",
  );
  const prSleeve = await approvedPr(
    "die_designer",
    "tooling",
    [
      { sku: "SP-SLEEVE", qty: 12 },
      { sku: "RM-H13", qty: 100 },
    ],
    "Shot sleeves and extra H13",
  );
  const prGloves = await approvedPr(
    "floor_supervisor",
    "stock_reorder",
    [{ sku: "CN-GLOVES", qty: 2000 }],
    "Gloves, bulk",
  );
  const prAdc = await approvedPr(
    "floor_supervisor",
    "stock_reorder",
    [{ sku: "RM-ADC12", qty: 500 }],
    "ADC12 top-up",
  );
  const prLm24b = await approvedPr(
    "floor_supervisor",
    "stock_reorder",
    [{ sku: "RM-LM24", qty: 100 }],
    "Small LM24 lot",
  );
  log("purchase requests: 7 statuses");

  // ---- POs (created by back_office; approved by whoever the chain names, not the creator) ----
  type PoLine = { pr: Pr; sku: Sku; qty: number };
  async function makePo(
    supplier: SupplierKey,
    lines: PoLine[],
    expected: Date,
    notes: string,
  ) {
    // BR-PO-18: the API refuses an expected date before the PO date, so a PO
    // that must look late is created with today's date and back-dated by sendPo.
    const created = await poService.create(
      {
        supplierId: supplierId[supplier],
        paymentTermsDays: 30,
        deliveryTerms: "Ex-works",
        expectedDeliveryDate:
          expected.getTime() < Date.now() ? new Date() : expected,
        notes,
        lines: lines.map((l) => ({
          prItemId: l.pr.line(l.sku),
          unitPricePaise: rate(l.sku),
        })),
      },
      userId.back_office,
    );
    const itemBySku = {} as Record<string, number>;
    for (const it of created.items) {
      const sku = ITEMS.find((i) => itemId[i.sku] === it.itemId)?.sku;
      if (sku) itemBySku[sku] = it.id;
    }
    return {
      id: created.po.id,
      expected,
      totalPaise: created.po.totalAmountPaise ?? 0,
      poItem: (sku: Sku) => must(itemBySku[sku], `PO line ${sku}`),
    };
  }
  type Po = Awaited<ReturnType<typeof makePo>>;

  async function submitPo(po: Po) {
    return approvalService.submitRequest(
      { docType: "po", docId: po.id },
      userId.back_office,
      actors.back_office,
    );
  }
  async function approvePo(po: Po, note: string) {
    const req = await submitPo(po);
    await decide(req.id, "approve", note, userId.back_office);
  }
  async function sendPo(po: Po) {
    await poService.markSent(
      po.id,
      { channel: "phone", note: "Confirmed by phone" },
      userId.back_office,
    );
    if (po.expected.getTime() < Date.now()) {
      await db
        .update(purchaseOrders)
        .set({ expectedDeliveryDate: po.expected })
        .where(eq(purchaseOrders.id, po.id));
    }
  }

  // 1 draft
  await makePo(
    "hindalco",
    [{ pr: prPartial, sku: "RM-ADC12", qty: 1000 }],
    daysFromNow(14),
    "ADC12 monthly lot",
  );
  // 2 pending_approval
  await submitPo(
    await makePo(
      "hindalco",
      [{ pr: prLm24, sku: "RM-LM24", qty: 800 }],
      daysFromNow(10),
      "LM24 lot",
    ),
  );
  // 3 approved
  await approvePo(
    await makePo(
      "foseco",
      [{ pr: prFlux, sku: "CN-FLUX", qty: 1000 }],
      daysFromNow(12),
      "Flux quarterly",
    ),
    "Approved: rate matches last quote",
  );
  // 4 dispatched and overdue, GRN rejected then a draft retry
  const po4 = await makePo(
    "foseco",
    [{ pr: prRelease, sku: "CN-RELEASE", qty: 300 }],
    daysFromNow(-12),
    "Release agent, urgent",
  );
  await approvePo(po4, "Approved: urgent");
  await sendPo(po4);
  // 5 partial_received, GRN waiting for QA
  const po5 = await makePo(
    "bharat",
    [
      { pr: prTools, sku: "RM-H13", qty: 500 },
      { pr: prTools, sku: "SP-PLUNGER", qty: 20 },
    ],
    daysFromNow(5),
    "Die build steel and plungers",
  );
  await approvePo(po5, "Approved: needed for die build");
  await sendPo(po5);
  // 6 fully_received after a partial rejection
  const po6 = await makePo(
    "bharat",
    [
      { pr: prSleeve, sku: "SP-SLEEVE", qty: 12 },
      { pr: prSleeve, sku: "RM-H13", qty: 100 },
    ],
    daysFromNow(-3),
    "Sleeves and extra H13",
  );
  await approvePo(po6, "Approved");
  await sendPo(po6);
  // 7 invoiced
  const po7 = await makePo(
    "safetymart",
    [{ pr: prGloves, sku: "CN-GLOVES", qty: 2000 }],
    daysFromNow(-20),
    "Gloves bulk",
  );
  await approvePo(po7, "Approved");
  await sendPo(po7);
  // 8 closed via a QA bypass
  const po8 = await makePo(
    "hindalco",
    [{ pr: prAdc, sku: "RM-ADC12", qty: 500 }],
    daysFromNow(-8),
    "ADC12 top-up",
  );
  await approvePo(po8, "Approved");
  await sendPo(po8);
  // 9 cancelled draft
  const po9 = await makePo(
    "hindalco",
    [{ pr: prLm24b, sku: "RM-LM24", qty: 100 }],
    daysFromNow(20),
    "Small LM24 lot",
  );
  await poService.cancel(
    po9.id,
    "Raised on the wrong supplier",
    userId.back_office,
  );
  log("purchase orders: 9 statuses");

  // ---- GRNs: stock only arrives here ----
  async function makeGrn(
    po: Po,
    lines: Array<{ sku: Sku; qty: number }>,
    challan: string,
  ) {
    const created = await grnService.create(
      {
        poId: po.id,
        challanNo: challan,
        challanDate: new Date(),
        vehicleNo: "MH12AB1234",
        lines: lines.map((l) => ({
          poItemId: po.poItem(l.sku),
          arrivedQty: l.qty,
        })),
      },
      userId.back_office,
    );
    const lineByPoItem = new Map(created.items.map((i) => [i.poItemId, i.id]));
    return {
      id: created.grn.id,
      line: (po2: Po, sku: Sku) =>
        must(lineByPoItem.get(po2.poItem(sku)), `GRN line ${sku}`),
    };
  }
  const qa = (
    grnId: number,
    lineId: number,
    accept: number | null,
    reject: number | null,
    remarks: string,
  ) =>
    grnService.qaAction(
      grnId,
      lineId,
      accept !== null
        ? { decision: "accept", acceptedQty: accept, remarks }
        : { decision: "reject", rejectedQty: reject ?? 0, remarks },
      userId.qa_inspector,
      actors.qa_inspector,
    );

  // PO4: everything rejected, then a draft re-delivery
  const g4a = await makeGrn(po4, [{ sku: "CN-RELEASE", qty: 300 }], "CH-4001");
  await qa(
    g4a.id,
    g4a.line(po4, "CN-RELEASE"),
    null,
    300,
    "Drums leaking, returned to supplier",
  );
  await makeGrn(po4, [{ sku: "CN-RELEASE", qty: 300 }], "CH-4002");

  // PO5: H13 partly accepted, plunger tips still waiting for QA
  const g5 = await makeGrn(
    po5,
    [
      { sku: "RM-H13", qty: 200 },
      { sku: "SP-PLUNGER", qty: 20 },
    ],
    "CH-5001",
  );
  await qa(
    g5.id,
    g5.line(po5, "RM-H13"),
    200,
    null,
    "Hardness and size checked",
  );

  // PO6: sleeve accepted, H13 rejected; second delivery replaces the H13
  const g6a = await makeGrn(
    po6,
    [
      { sku: "SP-SLEEVE", qty: 12 },
      { sku: "RM-H13", qty: 100 },
    ],
    "CH-6001",
  );
  await qa(g6a.id, g6a.line(po6, "SP-SLEEVE"), 12, null, "Dimensions OK");
  await qa(
    g6a.id,
    g6a.line(po6, "RM-H13"),
    null,
    100,
    "Wrong grade certificate",
  );
  const g6b = await makeGrn(po6, [{ sku: "RM-H13", qty: 100 }], "CH-6002");
  await qa(
    g6b.id,
    g6b.line(po6, "RM-H13"),
    100,
    null,
    "Grade certificate matches",
  );

  // PO7: full delivery, accepted, invoiced
  const g7 = await makeGrn(po7, [{ sku: "CN-GLOVES", qty: 2000 }], "CH-7001");
  await qa(g7.id, g7.line(po7, "CN-GLOVES"), 2000, null, "Count and size OK");
  await poService.markInvoiced(
    po7.id,
    {
      invoiceNumber: "SM/INV/0042",
      invoiceDate: new Date(),
      billedAmountPaise: po7.totalPaise,
    },
    userId.back_office,
  );

  // PO8: QA bypass by the owner, then closed
  const g8 = await makeGrn(po8, [{ sku: "RM-ADC12", qty: 500 }], "CH-8001");
  await grnService.bypass(
    g8.id,
    g8.line(po8, "RM-ADC12"),
    { bypassReason: "Melt schedule urgent; supplier test certificate on file" },
    userId.owner,
    actors.owner,
  );
  await poService.close(po8.id, { note: "Received and settled" }, userId.owner);
  log("goods receipts: 5 statuses, 1 QA bypass");

  // ---- summary (BR-KD-46): counts, logins without passwords, ledger balance per item ----
  const lines: string[] = [];
  const counts = await db.execute(sql`
    SELECT 'employees' AS t, count(*)::int AS n FROM employees
    UNION ALL SELECT 'item_master', count(*)::int FROM item_master
    UNION ALL SELECT 'supplier_master', count(*)::int FROM supplier_master
    UNION ALL SELECT 'purchase_requests', count(*)::int FROM purchase_requests
    UNION ALL SELECT 'purchase_orders', count(*)::int FROM purchase_orders
    UNION ALL SELECT 'grns', count(*)::int FROM grns
    UNION ALL SELECT 'inventory_ledger', count(*)::int FROM inventory_ledger`);
  lines.push("Rows:");
  for (const r of counts) lines.push(`  ${String(r.t)}: ${String(r.n)}`);

  const logins = await db.execute(sql`
    SELECT e.email AS email, r.name AS role FROM employees e
    JOIN roles r ON r.id = e.role_id WHERE e.email IS NOT NULL ORDER BY e.id`);
  lines.push("Logins (password = SEED_USER_PASSWORD):");
  for (const r of logins)
    lines.push(`  ${String(r.email)}  (${String(r.role)})`);

  const balances = await db.execute(sql`
    SELECT i.name AS name, i.uom AS uom, sum(l.quantity_change) AS bal
    FROM inventory_ledger l JOIN item_master i ON i.id = l.item_id
    GROUP BY i.name, i.uom ORDER BY i.name`);
  lines.push("Ledger balance per item:");
  for (const r of balances)
    lines.push(`  ${String(r.name)}: ${String(r.bal)} ${String(r.uom)}`);
  return lines;
}

async function mustLoad(id: number): Promise<Actor> {
  const actor = await loadActor(id);
  if (!actor) throw new Error(`employee ${id} not found`);
  return actor;
}

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`fixture lookup failed: ${what}`);
  return value;
}
