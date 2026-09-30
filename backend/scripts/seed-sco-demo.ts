/**
 * `bun run seed` — optional demo data for the subcontracting (job work) screens.
 *
 * Run it AFTER `bun run db:reset` (it needs the fixture logins). It is not part of `db:reset`
 * on purpose: the reset fixtures are frozen spec (known-defects BR-KD-44/46) and stock there
 * arrives only through GRN ledger rows.
 *
 * Adds through the real services: company details, raw + finished casting items with HSN,
 * a machining service, a job-work vendor, 500 raw castings in stock (PR -> PO -> GRN -> QA),
 * and five SCOs: draft, pending approval, approved, issued + receipt waiting for QA, closed.
 *
 * Exit codes: 0 done, 1 a step failed, 2 refused (non-local DB, production, already seeded),
 * 3 fixture users missing (run `bun run db:reset` first).
 */
import { eq, sql } from "drizzle-orm";
import { db, disconnectDb } from "../src/db/client";
import { approvalRequests } from "../src/db/schemas/02_procurement-approval";
import { supplierMaster } from "../src/db/schemas/02_procurement-suppliers";
import { employees } from "../src/db/schemas/03_hcm";
import { type Actor, loadActor } from "../src/lib/auth-middleware";
import { approvalService } from "../src/service/approvalService";
import { assetService } from "../src/service/assetService";
import { companySettingsService } from "../src/service/companySettingsService";
import { grnService } from "../src/service/grnService";
import { poService } from "../src/service/poService";
import { prService } from "../src/service/prService";
import { scoChallanService } from "../src/service/scoChallanService";
import { scoReceiptService } from "../src/service/scoReceiptService";
import { scoService } from "../src/service/scoService";
import { supplierService } from "../src/service/supplierService";

const EXIT = { ok: 0, step: 1, guard: 2, users: 3 } as const;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY_MS);

const VENDOR_NAME = "Precision Machining Works";
const ROLES = [
  "admin",
  "owner",
  "back_office",
  "floor_supervisor",
  "qa_inspector",
] as const;
type Who = (typeof ROLES)[number];

// Paise. Kept small so every SCO needs only the floor supervisor (< Rs 20,000) and
// no challan reaches the Rs 50,000 e-way bill line (BR-SCO-10).
const RAW_RATE = 25_000;
const SERVICE_RATE = 5_000;

function refuse(code: number, msg: string): never {
  console.error(msg);
  process.exit(code);
}

function guard() {
  if (process.env.NODE_ENV === "production") {
    refuse(EXIT.guard, "Refused: NODE_ENV=production.");
  }
  let host = "";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    refuse(EXIT.guard, "Refused: DATABASE_URL is missing or not a URL.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    refuse(EXIT.guard, `Refused: ${host} is not a local database host.`);
  }
}

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`lookup failed: ${what}`);
  return value;
}

async function main() {
  guard();
  const log = (msg: string) => console.log(`  ${msg}`);

  const [already] = await db
    .select({ id: supplierMaster.id })
    .from(supplierMaster)
    .where(eq(supplierMaster.name, VENDOR_NAME));
  if (already) refuse(EXIT.guard, "Refused: SCO demo data is already there.");

  const userId = {} as Record<Who, number>;
  const actor = {} as Record<Who, Actor>;
  for (const who of ROLES) {
    const email =
      who === "admin" ? "admin@diecast.local" : `${who}@diecast.local`;
    const [row] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, email));
    if (!row) {
      refuse(EXIT.users, `Missing ${email}. Run 'bun run db:reset' first.`);
    }
    const loaded = await loadActor(row.id);
    if (!loaded) refuse(EXIT.users, `Could not load ${email}.`);
    userId[who] = row.id;
    actor[who] = loaded;
  }

  /** Act on an approval request as whoever holds the current step's role; never the requester. */
  async function decide(requestId: number, requesterId: number, note: string) {
    for (;;) {
      const [req] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, requestId));
      if (!req) throw new Error(`approval request ${requestId} not found`);
      if (req.status !== "pending_approval") return;
      const role = req.currentApproverRole as Who | null;
      if (!role || !(role in userId)) {
        throw new Error(`no fixture user for approver role '${role}'`);
      }
      if (userId[role] === requesterId) {
        throw new Error(`approver ${role} is also the requester`);
      }
      await approvalService.actOnRequest(
        requestId,
        { action: "approve", notes: note },
        userId[role],
      );
    }
  }

  // ---- company details, items, service, vendors (BR-SCO-09) ----
  await companySettingsService.upsert(
    {
      name: "DiecastOS Demo Plant",
      address: "Plot 14, MIDC Industrial Area, Pune, Maharashtra 411019",
      gstin: "27AABCD1234E1Z5",
      stateCode: "27",
    },
    userId.owner,
  );

  const raw = await assetService.createItem(
    {
      sku: "RC-HOUSING",
      name: "Pump Housing Raw Casting",
      category: "Raw Material",
      uom: "pcs",
      standardRatePaise: RAW_RATE,
    },
    userId.admin,
  );
  const finished = await assetService.createItem(
    {
      sku: "FG-HOUSING",
      name: "Pump Housing Machined",
      category: "Raw Material",
      uom: "pcs",
      standardRatePaise: 60_000,
    },
    userId.admin,
  );
  await assetService.updateItem(raw.id, { hsnCode: "7616" }, userId.admin);
  await assetService.updateItem(finished.id, { hsnCode: "7616" }, userId.admin);

  const service = await assetService.createService(
    {
      code: "JW-CNC",
      name: "CNC Machining (job work)",
      defaultUom: "pcs",
      sacCode: "998821",
    },
    userId.admin,
  );

  const vendor = await supplierService.create(
    {
      name: VENDOR_NAME,
      type: "service_provider",
      gstNumber: "27AAACP4321L1Z6",
      panNumber: "AAACP4321L",
      defaultPaymentTermsDays: 30,
    },
    userId.admin,
  );
  await supplierService.createSupplierService(
    vendor.id,
    {
      serviceId: service.id,
      serviceUnitPricePaise: SERVICE_RATE,
      taxPercentage: 18,
      leadTimeDays: 5,
    },
    userId.admin,
  );
  const foundry = await supplierService.create(
    {
      name: "Sharma Die Castings",
      type: "raw_material",
      gstNumber: "27AAACS8765M1Z1",
      panNumber: "AAACS8765M",
      defaultPaymentTermsDays: 30,
      supplierItems: [
        {
          itemId: raw.id,
          supplierUnitPricePaise: RAW_RATE,
          taxPercentage: 18,
          leadTimeDays: 7,
          qty: 1,
          uom: "pcs",
        },
      ],
    },
    userId.admin,
  );
  log("master data: company details, 2 items (HSN), 1 service, 2 suppliers");

  // ---- stock: 500 raw castings, only through GRN ----
  const pr = await prService.create(
    {
      type: "stock_reorder",
      notes: "Raw castings for job work",
      items: [{ itemId: raw.id, requestedQty: 500 }],
    },
    userId.floor_supervisor,
    actor.floor_supervisor,
  );
  const prReq = await approvalService.submitRequest(
    { docType: "pr", docId: pr.pr.id },
    userId.floor_supervisor,
    actor.floor_supervisor,
  );
  await decide(prReq.id, userId.floor_supervisor, "Approved: job work stock");

  const po = await poService.create(
    {
      supplierId: foundry.id,
      paymentTermsDays: 30,
      deliveryTerms: "Ex-works",
      expectedDeliveryDate: daysFromNow(7),
      notes: "Raw castings for job work",
      lines: pr.items.map((it) => ({
        prItemId: it.id,
        unitPricePaise: RAW_RATE,
      })),
    },
    userId.back_office,
  );
  const poReq = await approvalService.submitRequest(
    { docType: "po", docId: po.po.id },
    userId.back_office,
    actor.back_office,
  );
  await decide(poReq.id, userId.back_office, "Approved");
  await poService.markSent(
    po.po.id,
    { channel: "phone", note: "Confirmed by phone" },
    userId.back_office,
  );
  const poLine = must(po.items[0], "PO line");
  const grn = await grnService.create(
    {
      poId: po.po.id,
      challanNo: "SDC-2001",
      challanDate: new Date(),
      vehicleNo: "MH12AB1234",
      lines: [{ poItemId: poLine.id, arrivedQty: 500 }],
    },
    userId.back_office,
  );
  await grnService.qaAction(
    grn.grn.id,
    must(grn.items[0], "GRN line").id,
    {
      decision: "accept",
      acceptedQty: 500,
      rejectedQty: 0,
      remarks: "Count and finish OK",
    },
    userId.qa_inspector,
    actor.qa_inspector,
  );
  log("stock: 500 pcs Pump Housing Raw Casting in Main Store");

  // ---- SCOs (created by back_office; approved by the floor supervisor) ----
  async function makeSco(qty: number, projectRef: string) {
    const created = await scoService.create(
      {
        vendorId: vendor.id,
        expectedReturnDate: daysFromNow(30),
        projectRef,
        lines: [
          {
            rawItemId: raw.id,
            finishedItemId: finished.id,
            serviceId: service.id,
            rawQtyToIssue: qty,
            expectedReturnQty: qty,
            rawItemBatch: "HEAT-2401",
          },
        ],
      },
      userId.back_office,
    );
    return {
      id: created.sco.id,
      lineId: must(created.items[0], "SCO line").id,
    };
  }
  async function submitSco(id: number) {
    return approvalService.submitRequest(
      { docType: "sco", docId: id },
      userId.back_office,
      actor.back_office,
    );
  }
  async function approvedSco(qty: number, projectRef: string) {
    const sco = await makeSco(qty, projectRef);
    const req = await submitSco(sco.id);
    await decide(req.id, userId.back_office, "Approved: rate per vendor list");
    return sco;
  }
  const issue = (scoId: number, lineId: number, qty: number) =>
    scoChallanService.create(
      scoId,
      { lines: [{ scoItemId: lineId, qty }] },
      userId.back_office,
      actor.back_office,
    );

  // 1 draft
  await makeSco(50, "Housing batch A (draft)");
  // 2 pending approval
  await submitSco((await makeSco(60, "Housing batch B (in approval)")).id);
  // 3 approved, nothing sent yet: make the challan from the UI
  await approvedSco(80, "Housing batch C (ready to issue)");
  // 4 material issued (150 of 200 sent), one receipt of 50 waiting for QA
  const s4 = await approvedSco(200, "Housing batch D (at vendor)");
  await issue(s4.id, s4.lineId, 150);
  await scoReceiptService.create(
    s4.id,
    {
      vendorChallanNo: "PMW-1001",
      lines: [{ scoItemId: s4.lineId, processedQty: 50, unprocessedQty: 0 }],
    },
    userId.back_office,
    actor.back_office,
  );
  // 5 full cycle: issued, received, QA (95 ok, 5 rejected), closed
  const s5 = await approvedSco(100, "Housing batch E (done)");
  await issue(s5.id, s5.lineId, 100);
  const rec = await scoReceiptService.create(
    s5.id,
    {
      vendorChallanNo: "PMW-1002",
      lines: [{ scoItemId: s5.lineId, processedQty: 100, unprocessedQty: 0 }],
    },
    userId.back_office,
    actor.back_office,
  );
  await scoReceiptService.decideQa(
    rec.receipt.id,
    must(rec.lines[0], "receipt line").id,
    { acceptedQty: 95, rejectedQty: 5, notes: "5 pcs porous after machining" },
    userId.qa_inspector,
    actor.qa_inspector,
  );
  await scoService.close(s5.id, {}, userId.back_office, actor.back_office);
  log("subcontracting orders: draft, in approval, approved, issued, closed");

  const rows = await db.execute(sql`
    SELECT status::text AS status, count(*)::int AS n
    FROM subcontracting_orders GROUP BY status ORDER BY status`);
  console.log("SCO statuses:");
  for (const r of rows) console.log(`  ${String(r.status)}: ${String(r.n)}`);
  console.log(
    "Log in as back_office@diecast.local (create/issue/receive/close), floor_supervisor@ (approve), qa_inspector@ (QA).",
  );
}

main()
  .then(() => disconnectDb())
  .catch(async (error) => {
    console.error("sco demo seed failed:", error);
    await disconnectDb();
    process.exit(EXIT.step);
  });
