/**
 * SCM epic scenario: one chained flow over HTTP through all nine modules (bom, sale-order, reorder is
 * not part of this chain, purchase-returns, supplier-invoice, rfq, stock-transfer, supplier-rating,
 * dispatch) on top of PR / PO / GRN.
 *
 *   customer + BOM (released) -> sale order confirmed -> explosion -> draft PR + SCO -> PR approved
 *   -> RFQ with 2 quotes -> award -> PO approved + sent -> GRN + QA (one line partly rejected)
 *   -> ledger -> supplier invoice entered, matched, released -> purchase return (debit note, offset)
 *   -> stock transfer out and back -> delivery note posted (SO fully delivered) -> supplier rating.
 *
 * Specs: docs/specs/{bom,sale-order,rfq,purchase-returns,supplier-invoice,stock-transfer,dispatch,
 * supplier-rating}/spec.md. Money is integer paise; stock only moves through inventory_ledger.
 *
 * Step order note: the supplier invoice is released BEFORE the purchase return is posted, so the
 * debit note links to that approved bill at post (BR-PRT-44) and lowers its payable (BR-PRT-45,
 * BR-SINV-31). A return before the bill would need a bill that includes the returned qty.
 *
 * All rows are TEST_scm_ prefixed or reachable only from rows that are; afterAll removes them by
 * following foreign keys from the roots this file made (items, suppliers, customers, locations,
 * employees), then restores the company settings row.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import {
  inventoryLedger,
  itemMaster,
  locations,
  serviceMaster,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  supplierMaster,
  supplierServices,
} from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { companySettings } from "../../src/db/schemas/04_company";
import { istDay, makeRfqFx } from "../helpers/rfqFixtures";

// biome-ignore lint/suspicious/noExplicitAny: tests read arbitrary JSON
type Json = any;
type Actor = Awaited<ReturnType<ReturnType<typeof makeRfqFx>["owner"]>>;

const fx = makeRfqFx("scm");
const RUN = fx.RUN;
const uid = fx.uid;

// ---------------------------------------------------------------- state shared by the steps
const itemIds: number[] = [];
const supplierIds: number[] = [];
const customerIds: number[] = [];
const locationIds: number[] = [];
const serviceIds: number[] = [];

let owner: Actor;
let bo: Actor;
let bo2: Actor;
let floor: Actor;
let qa: Actor;

let savedCompany: typeof companySettings.$inferSelect | undefined;
let companyTaken = false;

const S = {
  mainStoreId: 0,
  storeId: 0,
  fgId: 0,
  vendorId: 0,
  serviceId: 0,
  supA: 0,
  supB: 0,
  customerId: 0,
  adc: 0,
  bush: 0,
  rc: 0,
  mc: 0,
  soId: 0,
  soNumber: "",
  soLineId: 0,
  explosionId: 0,
  prId: 0,
  scoId: 0,
  prLineAdc: 0,
  prLineBush: 0,
  rfqId: 0,
  poId: 0,
  poNumber: "",
  poItemAdc: 0,
  poItemBush: 0,
  grnId: 0,
  grnLineAdc: 0,
  grnLineBush: 0,
  invoiceId: 0,
  invoiceNumber: "",
  invoiceTotal: 0,
  returnId: 0,
};

const ADC_QTY = 900.1; // BR-BOM-18 example: 1000 HSG-MC need 900.100 kg ADC12
const BUSH_QTY = 2150;
const ADC_RATE = 24_500;
const BUSH_RATE = 450;
const BUSH_ACCEPTED = 2100;
const BUSH_REJECTED = 50;
const BUSH_RETURN_ACCEPTED = 10;

// ---------------------------------------------------------------- helpers
const call = (
  who: Actor | null,
  method: string,
  path: string,
  body?: unknown,
) => fx.call(method, path, who, body);

async function must(
  who: Actor,
  method: string,
  path: string,
  body: unknown,
  ok: number[] = [200, 201],
): Promise<Json> {
  const r = await call(who, method, path, body);
  if (!ok.includes(r.status))
    throw new Error(
      `${method} ${path} -> ${r.status} ${JSON.stringify(r.json)}`,
    );
  return r.json;
}

async function approveAll(docType: "pr" | "po", docId: number) {
  for (let i = 0; i < 6; i++) {
    const cur = await call(
      owner,
      "GET",
      `/api/approval/getCurrentApprovalByDoc/${docType}/${docId}`,
    );
    const data = cur.json?.data;
    if (cur.status !== 200 || !data || data.status !== "pending_approval")
      return;
    let done = false;
    for (const who of [owner, bo2, floor]) {
      const r = await fx.approve(who, data.id);
      if (r.status === 200) {
        done = true;
        break;
      }
    }
    if (!done) throw new Error(`nobody could approve ${docType} ${docId}`);
  }
  throw new Error(`${docType} ${docId} still pending after 6 approvals`);
}

const ledgerOf = (itemId: number) =>
  db
    .select()
    .from(inventoryLedger)
    .where(eq(inventoryLedger.itemId, itemId))
    .orderBy(asc(inventoryLedger.id));
async function balanceAt(itemId: number, locationId: number) {
  return (await ledgerOf(itemId))
    .filter((r) => r.locationId === locationId)
    .reduce((n, r) => n + r.quantityChange, 0);
}
async function itemRow(id: number) {
  const [r] = await db.select().from(itemMaster).where(eq(itemMaster.id, id));
  if (!r) throw new Error(`item ${id} missing`);
  return r;
}
const halfUp = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d));

async function mkItem(
  uom: string,
  category: string,
  over: Partial<typeof itemMaster.$inferInsert> = {},
) {
  const sku = uid();
  const [r] = await db
    .insert(itemMaster)
    .values({
      sku,
      name: sku,
      category,
      uom,
      isActive: true,
      hsnCode: "7601",
      ...over,
    })
    .returning({ id: itemMaster.id });
  itemIds.push(r?.id as number);
  return r?.id as number;
}
async function mkSupplier(o: Partial<typeof supplierMaster.$inferInsert>) {
  const [r] = await db
    .insert(supplierMaster)
    .values({
      name: uid(),
      isActive: true,
      address: "Supplier Road, Pune",
      ...o,
    })
    .returning({ id: supplierMaster.id });
  supplierIds.push(r?.id as number);
  return r?.id as number;
}

// ---------------------------------------------------------------- cleanup by foreign keys
type Fk = {
  child: string;
  childCol: string;
  parent: string;
  parentCol: string;
  notNull: boolean;
};
let fkCache: Fk[] | undefined;
async function fks(): Promise<Fk[]> {
  if (fkCache) return fkCache;
  const rows = (await db.execute(
    sql.raw(`
      select c.conrelid::regclass::text as child, a.attname as "childCol",
             c.confrelid::regclass::text as parent, af.attname as "parentCol",
             a.attnotnull as "notNull"
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
      where c.contype = 'f' and array_length(c.conkey, 1) = 1
    `),
  )) as unknown as Fk[];
  fkCache = [...rows];
  return fkCache;
}
const run = (q: string) => db.execute(sql.raw(q));

/** Delete the rows of `table` matching `where`, children first. `nullable` = set null instead of delete. */
async function purge(
  table: string,
  where: string,
  path: string[] = [],
  nullable = false,
) {
  for (const fk of (await fks()).filter((f) => f.parent === table)) {
    if (path.includes(fk.child) || fk.child === table) continue;
    const sub = `select "${fk.parentCol}" from ${table} where ${where}`;
    const cond = `"${fk.childCol}" in (${sub})`;
    if (nullable && !fk.notNull)
      await run(`update ${fk.child} set "${fk.childCol}" = null where ${cond}`);
    else await purge(fk.child, cond, [...path, table], false);
  }
  await run(`delete from ${table} where ${where}`);
}
const idList = (ids: number[]) => ids.join(",");

// ---------------------------------------------------------------- setup / teardown
beforeAll(async () => {
  owner = await fx.owner();
  bo = await fx.bo();
  bo2 = await fx.actor("bo2", "back_office");
  floor = await fx.floor();
  qa = await fx.actor("qa", "qa_inspector");

  // Plant: state 27, tolerances price 0 % / weight 0.5 %, e-way limit Rs 50,000.
  [savedCompany] = await db.select().from(companySettings).limit(1);
  companyTaken = true;
  const plant = {
    id: 1,
    name: `${RUN} Works`,
    address: "1 Plant Road, Pune",
    gstin: "27AAACD1234E1Z5",
    stateCode: "27",
    priceToleranceBp: 0,
    weightToleranceBp: 50,
    ewayIntraLimitPaise: 5_000_000,
  };
  await db
    .insert(companySettings)
    .values(plant)
    .onConflictDoUpdate({ target: companySettings.id, set: plant });

  const [main] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "main_store"))
    .orderBy(asc(locations.id))
    .limit(1);
  if (main) S.mainStoreId = main.id;
  else {
    const [l] = await db
      .insert(locations)
      .values({ name: `${RUN}_main`, type: "main_store" })
      .returning({ id: locations.id });
    S.mainStoreId = l?.id as number;
    locationIds.push(S.mainStoreId);
  }
  const mkLoc = async (type: string) => {
    const r = await must(bo, "POST", "/api/asset/locations", {
      name: uid(),
      type,
    });
    locationIds.push(r.data.id);
    return r.data.id as number;
  };
  S.storeId = await mkLoc("store");
  S.fgId = await mkLoc("finished_goods");

  S.vendorId = await mkSupplier({ type: "service_provider" });
  const [svc] = await db
    .insert(serviceMaster)
    .values({ code: uid(), name: uid(), defaultUom: "pcs", isActive: true })
    .returning({ id: serviceMaster.id });
  S.serviceId = svc?.id as number;
  serviceIds.push(S.serviceId);
  await db.insert(supplierServices).values({
    supplierId: S.vendorId,
    serviceId: S.serviceId,
    serviceUnitPricePaise: 2500,
    taxPercentage: 18,
  });

  // Two bidders, both registered in the plant's state; terms 30 days.
  S.supA = await mkSupplier({
    gstNumber: `27AAACA${String(Date.now()).slice(-4)}E1Z5`,
    defaultPaymentTermsDays: 30,
  });
  S.supB = await mkSupplier({
    gstNumber: `27AAACB${String(Date.now()).slice(-4)}E1Z5`,
    defaultPaymentTermsDays: 30,
  });

  S.adc = await mkItem("kg", "Raw Material");
  S.bush = await mkItem("pcs", "Raw Material");
  S.rc = await mkItem("pcs", "Manufactured part");
  S.mc = await mkItem("pcs", "Manufactured part", { hsnCode: "8708" });

  const cust = await must(bo, "POST", "/api/customers", {
    name: uid(),
    stateCode: "27",
    address: "Plot 4, Rane Nagar",
  });
  S.customerId = cust.data.id;
  customerIds.push(S.customerId);
});

afterAll(async () => {
  // rfq_items and PO items point at each other: break that loop first.
  if (S.rfqId)
    await run(
      `update rfq_items set po_item_id = null, awarded_quote_item_id = null where rfq_id = ${S.rfqId}`,
    );
  // Documents hang off these roots through foreign keys, children first.
  if (customerIds.length)
    await purge("customers", `id in (${idList(customerIds)})`);
  if (supplierIds.length)
    await purge("supplier_master", `id in (${idList(supplierIds)})`);
  if (itemIds.length) await purge("item_master", `id in (${idList(itemIds)})`);
  if (serviceIds.length)
    await purge("service_master", `id in (${idList(serviceIds)})`);
  if (locationIds.length)
    await purge("locations", `id in (${idList(locationIds)})`);

  // Whatever is left was made by this file's employees: delete it, and detach the nullable links
  // (document number counters are shared and are never deleted).
  const emps = await db
    .select({ id: employees.id })
    .from(employees)
    .where(sql`${employees.name} like ${`${RUN}\\_%`}`);
  if (emps.length)
    await purge(
      "employees",
      `id in (${idList(emps.map((e) => e.id))})`,
      [],
      true,
    );

  await fx.cleanup();
  if (companyTaken) {
    if (savedCompany)
      await db
        .update(companySettings)
        .set(savedCompany)
        .where(eq(companySettings.id, 1));
    else await db.delete(companySettings).where(eq(companySettings.id, 1));
  }
});

// ================================================================ the chain
describe("SCM epic: one chained flow", () => {
  test("BR-BOM-01/12/22 casting + job-work BOMs: write routes return only { id, status, version }; owner releases, back office cannot", async () => {
    const castingBody = {
      partId: S.rc,
      kind: "casting",
      casting: {
        alloyItemId: S.adc,
        netWeightKg: 0.85,
        shotWeightKg: 2,
        cavities: 2,
        meltLossPct: 3,
        castingRejectPct: 5,
      },
      lines: [{ componentItemId: S.bush, qtyPerPiece: 2, buyAsIs: false }],
    };
    const rc = await call(bo, "POST", "/api/bom", castingBody);
    expect(rc.status).toBe(201);
    expect(Object.keys(rc.json.data).sort()).toEqual([
      "id",
      "status",
      "version",
    ]);
    expect(rc.json.data.status).toBe("draft");

    const detail = await call(owner, "GET", `/api/bom/${rc.json.data.id}`);
    const denied = await call(
      bo,
      "POST",
      `/api/bom/${rc.json.data.id}/release`,
      {
        version: detail.json.data.version,
      },
    );
    expect(denied.status).toBe(403);
    const rel = await call(
      owner,
      "POST",
      `/api/bom/${rc.json.data.id}/release`,
      {
        version: detail.json.data.version,
      },
    );
    expect(rel.status).toBe(200);
    expect(rel.json.data.status).toBe("active");

    const mc = await must(bo, "POST", "/api/bom", {
      partId: S.mc,
      kind: "job_work",
      jobWork: {
        sentItemId: S.rc,
        sendQty: 1,
        returnQty: 1,
        jobWorkerId: S.vendorId,
        serviceId: S.serviceId,
        jobWorkLossPct: 2,
      },
      lines: [],
    });
    const mcDetail = await must(
      owner,
      "GET",
      `/api/bom/${mc.data.id}`,
      undefined,
    );
    const mcRel = await call(owner, "POST", `/api/bom/${mc.data.id}/release`, {
      version: mcDetail.data.version,
    });
    expect(mcRel.status).toBe(200);
    expect(mcRel.json.data.status).toBe("active");
  });

  test("BR-BOM-18 needs preview: 1000 HSG-MC -> send 1021, pour 1075, alloy 900.100 kg, inserts 2150; no price fields", async () => {
    const r = await call(
      owner,
      "GET",
      `/api/bom/needs?partId=${S.mc}&qty=1000&levels=all`,
    );
    expect(r.status).toBe(200);
    const rcRow = r.json.data.rows.find((x: Json) => x.itemId === S.rc);
    expect(rcRow.qty).toBe(1021);
    expect(rcRow.pourQty).toBe(1075);
    expect(rcRow.alloyKg).toBeCloseTo(ADC_QTY, 3);
    const bush = r.json.data.toBuy.find((x: Json) => x.itemId === S.bush);
    expect(bush.qty).toBe(BUSH_QTY);
    expect(JSON.stringify(r.json)).not.toMatch(/price|rate|cost/i);
  });

  test("BR-SO-05/12 sale order of 1000 pcs is created as a draft, then confirmed", async () => {
    const created = await must(bo, "POST", "/api/sale-orders", {
      customerId: S.customerId,
      orderDate: istDay(-1),
      customerPoNumber: uid().slice(-40),
      lines: [
        {
          itemId: S.mc,
          qty: 1000,
          unitPricePaise: 18_500,
          gstPercent: 18,
          deliveryDate: istDay(30),
        },
      ],
    });
    expect(created.data.status).toBe("draft");
    expect(created.data.totalAmountPaise).toBe(18_500_000); // BR-SO-11, paise, before tax
    S.soId = created.data.id;
    S.soNumber = created.data.soNumber;
    const c = await call(bo, "POST", `/api/sale-orders/${S.soId}/confirm`, {
      editVersion: created.data.editVersion,
    });
    expect(c.status).toBe(200);
    const d = await must(bo, "GET", `/api/sale-orders/${S.soId}`, undefined);
    expect(d.data.status).toBe("confirmed");
    S.soLineId = d.data.lines[0].id;
    expect(d.data.lines[0].deliveredQty).toBe(0); // BR-SO-09
  });

  test("BR-SO-21/22/23/24 explosion E1: job work -> cast -> buy rows with the BOM module's quantities; no prices", async () => {
    const ex = await call(
      bo,
      "POST",
      `/api/sale-orders/${S.soId}/explosions`,
      {},
    );
    expect(ex.status).toBe(201);
    expect(ex.json.data.number).toBe(`${S.soNumber}/E1`);
    S.explosionId = ex.json.data.id;

    const rowsRes = await call(
      bo,
      "GET",
      `/api/sale-orders/${S.soId}/explosions/${S.explosionId}/rows?pageSize=100`,
    );
    expect(rowsRes.status).toBe(200);
    const rows: Json[] = rowsRes.json.data;
    const row = (id: number) => rows.find((r) => r.itemId === id);
    expect(row(S.mc)?.type).toBe("job_work");
    expect(row(S.mc)?.netQty).toBe(1000);
    expect(row(S.mc)?.sendQty).toBe(1021);
    expect(row(S.rc)?.type).toBe("cast");
    expect(row(S.rc)?.netQty).toBe(1021);
    expect(row(S.rc)?.pourQty).toBe(1075);
    expect(row(S.adc)?.type).toBe("buy");
    expect(row(S.adc)?.netQty).toBeCloseTo(ADC_QTY, 3);
    expect(row(S.bush)?.type).toBe("buy");
    expect(row(S.bush)?.netQty).toBe(BUSH_QTY);
    expect(JSON.stringify(rowsRes.json)).not.toMatch(/unitPrice|pricePaise/);

    // BR-SO-35: a reservation is a soft claim, never a ledger posting.
    expect(await ledgerOf(S.adc)).toHaveLength(0);
  });

  test("BR-SO-40/42/46 create drafts: one draft PR (type sale_order) for the bought rows, one draft SCO for the job-work row; a second call is 409", async () => {
    const rowsRes = await call(
      bo,
      "GET",
      `/api/sale-orders/${S.soId}/explosions/${S.explosionId}/rows?pageSize=100`,
    );
    const rows: Json[] = rowsRes.json.data;
    const row = (id: number) => rows.find((r) => r.itemId === id);
    const picks = [
      { rowId: row(S.adc)?.id, qty: row(S.adc)?.netQty },
      { rowId: row(S.bush)?.id, qty: row(S.bush)?.netQty },
      {
        rowId: row(S.mc)?.id,
        qty: row(S.mc)?.netQty,
        vendorId: S.vendorId,
        expectedReturnDate: istDay(25),
      },
    ];
    const r = await call(
      bo,
      "POST",
      `/api/sale-orders/${S.soId}/explosions/${S.explosionId}/drafts`,
      { rows: picks },
    );
    expect(r.status).toBe(201);
    expect(r.json.data.prs).toHaveLength(1);
    expect(r.json.data.scos).toHaveLength(1);
    S.prId = r.json.data.prs[0].id;
    S.scoId = r.json.data.scos[0].id;

    const pr = await must(
      bo,
      "GET",
      `/api/pr/getprdetails/${S.prId}`,
      undefined,
    );
    expect(pr.data.pr.status).toBe("draft");
    expect(pr.data.pr.type).toBe("sale_order");
    expect(pr.data.pr.saleOrderId).toBe(S.soId);
    expect(pr.data.items).toHaveLength(2);
    const line = (id: number) =>
      pr.data.items.find((i: Json) => i.itemId === id);
    expect(line(S.adc).requestedQty).toBeCloseTo(ADC_QTY, 3);
    expect(line(S.bush).requestedQty).toBe(BUSH_QTY);
    S.prLineAdc = line(S.adc).id;
    S.prLineBush = line(S.bush).id;

    const again = await call(
      bo,
      "POST",
      `/api/sale-orders/${S.soId}/explosions/${S.explosionId}/drafts`,
      { rows: picks },
    );
    expect(again.status).toBe(409);
  });

  test("BR-SO-47 PR goes through its own approval: submitted, approved; the SO is untouched", async () => {
    const sub = await call(bo, "POST", "/api/approval/submitRequest", {
      docType: "pr",
      docId: S.prId,
    });
    expect(sub.status).toBe(201);
    await approveAll("pr", S.prId);
    const pr = await must(
      bo,
      "GET",
      `/api/pr/getprdetails/${S.prId}`,
      undefined,
    );
    expect(pr.data.pr.status).toBe("approved");
    const so = await must(bo, "GET", `/api/sale-orders/${S.soId}`, undefined);
    expect(so.data.status).toBe("confirmed");
  });

  test("BR-RFQ-01/05/07 RFQ from the approved PR lines to two suppliers: draft, then sent", async () => {
    const r = await call(bo, "POST", "/api/rfq/createrfq", {
      dueDate: istDay(5),
      supplierIds: [S.supA, S.supB],
      prItemIds: [S.prLineAdc, S.prLineBush],
    });
    expect(r.status).toBe(201);
    expect(r.json.data.status).toBe("draft");
    S.rfqId = r.json.data.id;
    // BR-RFQ-03: qty copied from the PR line, never typed.
    const lines: Json[] = r.json.data.lines;
    expect(lines).toHaveLength(2);
    const sent = await call(bo, "POST", `/api/rfq/${S.rfqId}/send`, {});
    expect(sent.status).toBe(200);
  });

  test("BR-RFQ-13/15/16/18/21 two quotes entered and submitted; supplier A is lowest on both lines (landed rates, paise)", async () => {
    const detail = await must(
      bo,
      "GET",
      `/api/rfq/getrfqdetails/${S.rfqId}`,
      undefined,
    );
    const lines: Json[] = detail.data.lines;
    const lineOf = (prItemId: number) =>
      lines.find((l) => l.prItemId === prItemId);
    const adcLine = lineOf(S.prLineAdc);
    const bushLine = lineOf(S.prLineBush);
    const quote = async (supplierId: number, adc: number, bush: number) => {
      const r = await call(bo, "POST", `/api/rfq/${S.rfqId}/quotes`, {
        supplierId,
        supplierQuoteRef: uid(),
        quoteDate: istDay(0),
        validTill: istDay(30),
        lines: [
          {
            rfqItemId: adcLine.id,
            isQuoted: true,
            ratePaise: adc,
            gstPercent: 18,
            leadDays: 7,
            freightPaise: 0,
          },
          {
            rfqItemId: bushLine.id,
            isQuoted: true,
            ratePaise: bush,
            gstPercent: 18,
            leadDays: 7,
            freightPaise: 0,
          },
        ],
      });
      expect(r.status).toBe(201);
      const s = await call(
        bo,
        "POST",
        `/api/rfq/quotes/${r.json.data.id}/submit`,
        {},
      );
      expect(s.status).toBe(200);
      return r.json.data;
    };
    const qa1 = await quote(S.supA, ADC_RATE, BUSH_RATE);
    await quote(S.supB, ADC_RATE + 300, BUSH_RATE + 20);

    const cmp = await call(bo, "GET", `/api/rfq/${S.rfqId}/comparison`);
    expect(cmp.status).toBe(200);
    expect(cmp.json.data.rows).toHaveLength(2);

    const pick = (rfqItemId: number) => ({
      rfqItemId,
      quoteItemId: qa1.lines.find((l: Json) => l.rfqItemId === rfqItemId).id,
    });
    const award = await call(bo, "POST", `/api/rfq/${S.rfqId}/award`, {
      lines: [pick(adcLine.id), pick(bushLine.id)],
    });
    expect(award.status).toBe(201);
    // BR-RFQ-28: one draft PO per winning supplier; BR-RFQ-34: all lines awarded -> RFQ awarded.
    expect(award.json.data.rfq.status).toBe("awarded");
    expect(award.json.data.pos).toHaveLength(1);
    expect(award.json.data.pos[0].supplierId).toBe(S.supA);
    expect(award.json.data.pos[0].lineCount).toBe(2);
    S.poId = award.json.data.pos[0].poId;

    const after = await must(
      bo,
      "GET",
      `/api/rfq/getrfqdetails/${S.rfqId}`,
      undefined,
    );
    const statuses = after.data.quotes.map((q: Json) => q.status).sort();
    expect(statuses).toEqual(["not_awarded", "submitted"].sort());
  });

  test("BR-RFQ-28/31/39 the awarded PO is a draft with the quote rates and no delivery date; set the date, approve, send", async () => {
    const d = await must(
      bo,
      "GET",
      `/api/po/getpodetails/${S.poId}`,
      undefined,
    );
    expect(d.data.po.status).toBe("draft");
    expect(d.data.po.expectedDeliveryDate).toBeNull();
    S.poNumber = d.data.po.poNumber;
    const item = (id: number) =>
      d.data.items.find((i: Json) => i.itemId === id);
    expect(item(S.adc).unitPricePaise).toBe(ADC_RATE);
    expect(item(S.bush).unitPricePaise).toBe(BUSH_RATE);
    S.poItemAdc = item(S.adc).id;
    S.poItemBush = item(S.bush).id;
    const subtotal =
      Math.round(ADC_QTY * ADC_RATE) + Math.round(BUSH_QTY * BUSH_RATE);
    expect(d.data.po.subtotalPaise).toBe(subtotal);
    expect(Number.isInteger(d.data.po.totalAmountPaise)).toBe(true);

    const up = await call(bo, "PATCH", "/api/po/updatepo", {
      poId: S.poId,
      expectedDeliveryDate: new Date(
        Date.now() + 10 * 86_400_000,
      ).toISOString(),
      inserts: [],
      updates: [],
      deletes: [],
    });
    expect(up.status).toBe(200);
    const sub = await fx.submitPo(bo, S.poId);
    expect(sub.status).toBe(201);
    await approveAll("po", S.poId);
    const approved = await must(
      bo,
      "GET",
      `/api/po/getpodetails/${S.poId}`,
      undefined,
    );
    expect(approved.data.po.status).toBe("approved");
    const sent = await call(bo, "POST", `/api/po/${S.poId}/send`, {
      channel: "phone",
    });
    expect(sent.status).toBe(200);
    expect(sent.json.data.status).toBe("dispatched");
  });

  test("BR-GRN-QA GRN received, QA decides: ADC12 fully accepted, bushes 2100 accepted / 50 rejected; stock enters only through the ledger", async () => {
    const g = await call(bo, "POST", "/api/grn/creategrn", {
      poId: S.poId,
      challanNo: uid(),
      lines: [
        { poItemId: S.poItemAdc, arrivedQty: ADC_QTY },
        { poItemId: S.poItemBush, arrivedQty: BUSH_QTY },
      ],
    });
    expect(g.status).toBe(201);
    S.grnId = g.json.data.grn.id;
    const items: Json[] = g.json.data.items;
    S.grnLineAdc = (
      items.find((i) => i.poItemId === S.poItemAdc) ?? items[0]
    ).id;
    S.grnLineBush = (
      items.find((i) => i.poItemId === S.poItemBush) ?? items[1]
    ).id;

    // A draft receipt has no stock effect.
    expect(await ledgerOf(S.adc)).toHaveLength(0);
    expect((await itemRow(S.adc)).currentStock).toBe(0);

    const q1 = await call(
      qa,
      "POST",
      `/api/grn/${S.grnId}/lines/${S.grnLineAdc}/qa`,
      {
        acceptedQty: ADC_QTY,
        rejectedQty: 0,
      },
    );
    expect(q1.status).toBe(200);
    const q2 = await call(
      qa,
      "POST",
      `/api/grn/${S.grnId}/lines/${S.grnLineBush}/qa`,
      {
        acceptedQty: BUSH_ACCEPTED,
        rejectedQty: BUSH_REJECTED,
      },
    );
    expect(q2.status).toBe(200);

    const adcRows = await ledgerOf(S.adc);
    expect(adcRows).toHaveLength(1);
    expect(adcRows[0]?.referenceType).toBe("grn");
    expect(adcRows[0]?.referenceId).toBe(S.grnId);
    expect(adcRows[0]?.locationId).toBe(S.mainStoreId);
    expect(adcRows[0]?.quantityChange).toBeCloseTo(ADC_QTY, 3);
    expect(adcRows[0]?.unitCostPaise).toBe(ADC_RATE);
    expect(adcRows[0]?.totalValueChangePaise).toBe(
      Math.round(ADC_QTY * ADC_RATE),
    );

    // BR-GRN-13: rejected qty never enters stock.
    const bushRows = await ledgerOf(S.bush);
    expect(bushRows).toHaveLength(1);
    expect(bushRows[0]?.quantityChange).toBe(BUSH_ACCEPTED);
    expect((await itemRow(S.bush)).currentStock).toBe(BUSH_ACCEPTED);

    // BR-PRT-20: rejected qty is not "received": the PO line is short, so the PO stays partial.
    const po = await must(
      bo,
      "GET",
      `/api/po/getpodetails/${S.poId}`,
      undefined,
    );
    expect(po.data.po.status).toBe("partial_received");
  });

  test("BR-SINV-02/14/21/23/25 supplier invoice: price above PO rate -> blocked; back office cannot release, owner can; approved, net payable = total", async () => {
    const lines = [
      {
        grnItemId: S.grnLineAdc,
        qty: ADC_QTY,
        ratePaise: ADC_RATE,
        gstPercent: 18,
      },
      {
        grnItemId: S.grnLineBush,
        qty: BUSH_ACCEPTED,
        ratePaise: BUSH_RATE + 1,
        gstPercent: 18,
      },
    ];
    let taxable = 0;
    let cgst = 0;
    let sgst = 0;
    for (const l of lines) {
      const t = Math.round(l.qty * l.ratePaise);
      taxable += t;
      cgst += halfUp(t * 1800, 20_000);
      sgst += halfUp(t * 1800, 20_000);
    }
    const printed = {
      taxablePaise: taxable,
      cgstPaise: cgst,
      sgstPaise: sgst,
      igstPaise: 0,
      totalPaise: taxable + cgst + sgst,
    };
    S.invoiceNumber =
      `T${Date.now().toString(36).slice(-6).toUpperCase()}`.slice(0, 16);
    const c = await call(
      bo,
      "POST",
      "/api/supplier-invoice/createsupplierinvoice",
      {
        poId: S.poId,
        invoiceNumber: S.invoiceNumber,
        invoiceDate: istDay(0),
        printed,
        lines,
      },
    );
    expect(c.status).toBe(201);
    expect(c.json.data.status).toBe("draft");
    expect(c.json.data.taxType).toBe("cgst_sgst"); // supplier 27, plant 27
    S.invoiceId = c.json.data.id;

    const s = await call(
      bo,
      "POST",
      `/api/supplier-invoice/${S.invoiceId}/submit`,
      {},
    );
    expect(s.status).toBe(200);
    expect(s.json.data.status).toBe("blocked");
    expect(JSON.stringify(s.json.data.mismatches)).toContain("price");

    const deny = await call(
      bo,
      "POST",
      `/api/supplier-invoice/${S.invoiceId}/release`,
      {
        reason: "rate agreed by phone",
      },
    );
    expect(deny.status).toBe(403);
    const rel = await call(
      owner,
      "POST",
      `/api/supplier-invoice/${S.invoiceId}/release`,
      {
        reason: "rate agreed by phone",
      },
    );
    expect(rel.status).toBe(200);
    expect(rel.json.data.status).toBe("approved");

    const d = await must(
      owner,
      "GET",
      `/api/supplier-invoice/getsupplierinvoicedetails/${S.invoiceId}`,
      undefined,
    );
    S.invoiceTotal = d.data.totalPaise;
    expect(
      Math.abs(d.data.totalPaise - printed.totalPaise),
    ).toBeLessThanOrEqual(100);
    expect(d.data.debitNotes).toHaveLength(0);
    expect(d.data.netPayablePaise).toBe(d.data.totalPaise); // BR-SINV-31, nothing to offset yet
  });

  test("BR-PRT-12/14/15/29/31/32/44/45 purchase return: 50 rejected + 10 accepted bushes; ledger moves only the accepted 10; one debit note; offset = accepted lines only", async () => {
    const r = await call(bo, "POST", "/api/purchase-return/createreturn", {
      grnId: S.grnId,
      reason: "porosity in heat H-881",
      lines: [
        { grnItemId: S.grnLineBush, source: "rejected", qty: BUSH_REJECTED },
        {
          grnItemId: S.grnLineBush,
          source: "accepted",
          qty: BUSH_RETURN_ACCEPTED,
        },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.json.data.status).toBe("draft");
    S.returnId = r.json.data.id;
    // A draft moves nothing.
    expect(await ledgerOf(S.bush)).toHaveLength(1);

    const p = await call(
      bo,
      "POST",
      `/api/purchase-return/${S.returnId}/post`,
      {},
    );
    expect(p.status).toBe(200);
    expect(p.json.data.status).toBe("posted");
    expect(p.json.data.ledgerRowIds).toHaveLength(1); // rejected line posts no row (BR-PRT-15)

    const bushRows = await ledgerOf(S.bush);
    expect(bushRows).toHaveLength(2);
    const out = bushRows[1];
    expect(out?.referenceType).toBe("pro");
    expect(out?.referenceId).toBe(S.returnId);
    expect(out?.transactionType).toBe("out");
    expect(out?.quantityChange).toBe(-BUSH_RETURN_ACCEPTED);
    expect(out?.locationId).toBe(S.mainStoreId);
    expect(out?.unitCostPaise).toBe(BUSH_RATE);
    expect(out?.totalValueChangePaise).toBe(-BUSH_RETURN_ACCEPTED * BUSH_RATE);
    expect((await itemRow(S.bush)).currentStock).toBe(
      BUSH_ACCEPTED - BUSH_RETURN_ACCEPTED,
    );

    const d = await must(
      bo,
      "GET",
      `/api/purchase-return/getreturndetails/${S.returnId}`,
      undefined,
    );
    const dn = d.data.debitNote;
    const taxable =
      BUSH_REJECTED * BUSH_RATE + BUSH_RETURN_ACCEPTED * BUSH_RATE; // 27,000
    const gst =
      halfUp(BUSH_REJECTED * BUSH_RATE * 18, 100) +
      halfUp(BUSH_RETURN_ACCEPTED * BUSH_RATE * 18, 100);
    expect(dn.status).toBe("issued");
    expect(dn.taxablePaise).toBe(taxable);
    expect(dn.cgstPaise + dn.sgstPaise).toBe(gst); // same state: CGST + SGST, no IGST
    expect(dn.igstPaise).toBe(0);
    expect(dn.totalPaise).toBe(taxable + gst);
    // BR-PRT-45: the offset is the accepted line's value (taxable + GST), not the whole note.
    const acceptedValue =
      BUSH_RETURN_ACCEPTED * BUSH_RATE +
      halfUp(BUSH_RETURN_ACCEPTED * BUSH_RATE * 18, 100);
    expect(dn.billOffsetPaise).toBe(acceptedValue);
    expect(dn.billOffsetPaise).toBeLessThan(dn.totalPaise);
    // BR-PRT-44: linked to the oldest approved bill covering the GRN line.
    expect(dn.supplierBill.invoiceNumber).toBe(S.invoiceNumber);

    // BR-SINV-31: net payable = bill total - offset.
    const inv = await must(
      owner,
      "GET",
      `/api/supplier-invoice/getsupplierinvoicedetails/${S.invoiceId}`,
      undefined,
    );
    expect(inv.data.debitNotes).toHaveLength(1);
    expect(inv.data.netPayablePaise).toBe(S.invoiceTotal - acceptedValue);

    // BR-PRT-21: credit only; the PO is not re-opened or changed by the accepted return.
    const po = await must(
      bo,
      "GET",
      `/api/po/getpodetails/${S.poId}`,
      undefined,
    );
    expect(po.data.po.status).toBe("partial_received");
  });

  test("BR-STR-01/11/14/15 stock transfer main store -> store: 100 kg out and in at the same cost; stock and average unchanged; the transfer back restores it", async () => {
    const before = await itemRow(S.adc);
    let rowCount = 1;
    const post = async (from: number, to: number) => {
      const c = await call(bo, "POST", "/api/stock-transfer", {
        sourceLocationId: from,
        destinationLocationId: to,
        lines: [{ itemId: S.adc, qty: 100 }],
      });
      expect(c.status).toBe(201);
      expect(c.json.data.status).toBe("draft");
      expect(await ledgerOf(S.adc)).toHaveLength(rowCount); // draft: no stock effect
      const p = await call(
        bo,
        "POST",
        `/api/stock-transfer/${c.json.data.id}/post`,
        {},
      );
      expect(p.status).toBe(200);
      expect(p.json.data.status).toBe("posted");
      return c.json.data.id as number;
    };
    rowCount = 1;
    const out = await post(S.mainStoreId, S.storeId);
    const rows = (await ledgerOf(S.adc)).filter(
      (r) => r.referenceType === "stock_transfer" && r.referenceId === out,
    );
    expect(rows).toHaveLength(2);
    const o = rows.find((r) => r.quantityChange < 0);
    const i = rows.find((r) => r.quantityChange > 0);
    expect(o?.locationId).toBe(S.mainStoreId);
    expect(i?.locationId).toBe(S.storeId);
    expect(o?.unitCostPaise).toBe(i?.unitCostPaise ?? -1);
    expect(
      (o?.totalValueChangePaise ?? 0) + (i?.totalValueChangePaise ?? 0),
    ).toBe(0);
    expect(await balanceAt(S.adc, S.mainStoreId)).toBeCloseTo(ADC_QTY - 100, 3);
    expect(await balanceAt(S.adc, S.storeId)).toBe(100);
    const mid = await itemRow(S.adc);
    expect(mid.currentStock).toBeCloseTo(before.currentStock, 3);
    expect(mid.averageCostPaise).toBe(before.averageCostPaise);

    rowCount = 3;
    await post(S.storeId, S.mainStoreId);
    expect(await balanceAt(S.adc, S.mainStoreId)).toBeCloseTo(ADC_QTY, 3);
    expect(await balanceAt(S.adc, S.storeId)).toBe(0);
    const end = await itemRow(S.adc);
    expect(end.currentStock).toBeCloseTo(before.currentStock, 3);
  });

  test("BR-DSP-08/12/14/15/18/19/23/24 delivery note: 1000 HSG-MC posted from finished goods; stock out through the ledger at the average cost; SO closes as fully delivered", async () => {
    // Finished goods come into stock the one allowed way: a ledger posting (opening stock).
    const open = await call(owner, "POST", "/api/asset/inventory/movements", {
      itemId: S.mc,
      locationId: S.fgId,
      referenceType: "opening_stock",
      qty: 1000,
      unitCostPaise: 9800,
      reason: "scm epic opening",
    });
    expect(open.status).toBe(201);

    const draft = await call(bo, "POST", "/api/dispatch/notes", {
      soId: S.soId,
      sourceLocationId: S.fgId,
      lines: [{ soLineId: S.soLineId, qty: 1000 }],
      transport: {
        mode: "road",
        vehicleNo: "MH12AB1234",
        distanceKm: 350,
        ewayBillNo: `${String(Date.now()).slice(-9)}001`,
        ewayBillDate: istDay(0),
      },
    });
    expect(draft.status).toBe(201);
    expect(draft.json.data.status).toBe("draft");
    expect(draft.json.data.dnNumber).toBeNull(); // BR-DSP-17: number only at posting
    // BR-DSP-12: a draft holds nothing.
    expect(await balanceAt(S.mc, S.fgId)).toBe(1000);

    const post = await call(
      bo,
      "POST",
      `/api/dispatch/notes/${draft.json.data.id}/post`,
      {},
    );
    expect(post.status).toBe(200);
    expect(post.json.data.status).toBe("posted");
    expect(post.json.data.dnNumber).toMatch(/^DN\/\d{2}-\d{2}\/\d+$/);
    expect(post.json.data.ewayNeeded).toBe(true);
    expect(post.json.data.taxablePaise).toBe(18_500_000);
    expect(post.json.data.gstPaise).toBe(3_330_000);
    expect(post.json.data.valuePaise).toBe(21_830_000);

    const rows = (await ledgerOf(S.mc)).filter(
      (r) => r.referenceType === "delivery_note",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referenceId).toBe(draft.json.data.id);
    expect(rows[0]?.transactionType).toBe("out");
    expect(rows[0]?.quantityChange).toBe(-1000);
    expect(rows[0]?.locationId).toBe(S.fgId);
    expect(rows[0]?.unitCostPaise).toBe(9800);
    expect(rows[0]?.totalValueChangePaise).toBe(-9_800_000);
    expect(await balanceAt(S.mc, S.fgId)).toBe(0);
    expect((await itemRow(S.mc)).currentStock).toBe(0);

    const so = await must(bo, "GET", `/api/sale-orders/${S.soId}`, undefined);
    expect(so.json?.data ?? so.data).toBeDefined();
    expect(so.data.lines[0].deliveredQty).toBe(1000);
    expect(so.data.status).toBe("closed");
    expect(so.data.closeKind).toBe("fully_delivered");
  });

  test("BR-SRT-03/07/11/21/22 rating card of supplier A: the PO's two lines are on time, 1 of 2 lines had rejects, too few lines for a headline score", async () => {
    const card = await call(
      owner,
      "GET",
      `/api/supplier-rating/${S.supA}/card`,
    );
    expect(card.status).toBe(200);
    const c = card.json.data;
    expect(c.supplierId).toBe(S.supA);
    expect(c.onTime.lines).toBe(2);
    expect(c.onTime.onTimeLines).toBe(2);
    expect(c.onTime.lateLines).toBe(0);
    expect(c.onTime.pctTenths).toBe(1000);
    expect(c.rejection.decidedLines).toBe(2);
    expect(c.rejection.linesWithRejects).toBe(1);
    // 22,500 rejected / 23,019,950 arrived = 0.1 % at most (1 decimal)
    expect(c.rejection.pctTenths).toBeGreaterThanOrEqual(0);
    expect(c.rejection.pctTenths).toBeLessThanOrEqual(2);
    // BR-SRT-22: under 5 judged lines there is no score and no label.
    expect(c.score).toBeNull();
    expect(c.label).toBeNull();

    const lines = await call(
      owner,
      "GET",
      `/api/supplier-rating/${S.supA}/lines?measure=on_time&page=1&pageSize=20`,
    );
    expect(lines.status).toBe(200);
    expect(JSON.stringify(lines.json.data)).toContain(S.poNumber);

    const list = await call(
      owner,
      "GET",
      `/api/supplier-rating/list?status=active&page=1&pageSize=50&q=${encodeURIComponent(RUN)}`,
    );
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json.data)).toContain(`${S.supA}`);

    // Supplier B only quoted: it has no PO, so every measure is "no data" (BR-SRT-23).
    const b = await call(owner, "GET", `/api/supplier-rating/${S.supB}/card`);
    expect(b.json.data.onTime.pctTenths).toBeNull();
    expect(b.json.data.score).toBeNull();
  });

  test("INVARIANT stock only through the ledger: every item's current stock equals the sum of its ledger rows; money columns are integers", async () => {
    for (const id of [S.adc, S.bush, S.mc, S.rc]) {
      const rows = await ledgerOf(id);
      const sum = rows.reduce((n, r) => n + r.quantityChange, 0);
      expect((await itemRow(id)).currentStock).toBeCloseTo(sum, 3);
      for (const r of rows) {
        expect(Number.isInteger(r.unitCostPaise)).toBe(true);
        expect(Number.isInteger(r.totalValueChangePaise)).toBe(true);
      }
    }
    expect(await ledgerOf(S.rc)).toHaveLength(0); // cast rows never move stock by themselves
  });
});
