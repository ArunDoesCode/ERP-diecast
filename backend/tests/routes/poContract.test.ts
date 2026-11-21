/**
 * Rate contract on the PO (change to the frozen PO / approval / inventory specs, carried in docs/specs/rfq/spec.md):
 * BR-RFQ-02 (PR line on open RFQ), 29, 50..57, 74 (PO side). HTTP via createApp(), real DB. Fixtures TEST_poc_ prefixed.
 * Money caps follow the coordinator decision: rate and line value <= 1e13 paise.
 * Approval fixtures: PR type "maintenance" with one policy (approver owner2); buyer is back_office.
 */
import { afterAll, describe, expect, setSystemTime, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import {
  purchaseOrderItems,
  purchaseOrders,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  type Actor,
  istDay,
  type Json,
  makeRfqFx,
} from "../helpers/rfqFixtures";

const fx = makeRfqFx("poc");
afterAll(() => fx.cleanup());

let policyReady = false;
async function ensurePolicy() {
  if (policyReady) return;
  policyReady = true;
  await fx.maintenancePoPolicy((await fx.owner2()).id, -96201);
}

type Ctx = Awaited<ReturnType<typeof ctx>>;
/** supplier + item + active contract (24,400, 18 %, 5000 kg) + one PR line of `qty`. */
async function ctx(
  o: {
    qty?: number;
    agreedQty?: number | null;
    allowance?: number;
    rate?: number;
    validFrom?: string;
    validTo?: string;
    activate?: boolean;
    prType?: "misc" | "maintenance";
  } = {},
) {
  const supplierId = await fx.newSupplier();
  const itemId = await fx.newItem();
  const c = await fx.mkContract({
    supplierId,
    items: [
      {
        itemId,
        rate: o.rate ?? 24400,
        agreedQty: o.agreedQty === undefined ? 5000 : o.agreedQty,
      },
    ],
    allowance: o.allowance,
    validFrom: o.validFrom,
    validTo: o.validTo,
    activate: o.activate,
  });
  const pr = await fx.newPr({
    qtys: [o.qty ?? 1000],
    itemIds: [itemId],
    type: o.prType,
  });
  return { supplierId, itemId, contract: c, prItemId: pr.prItemIds[0]! };
}
const morePr = async (x: Ctx, qty: number, type?: "misc" | "maintenance") =>
  (await fx.newPr({ qtys: [qty], itemIds: [x.itemId], type })).prItemIds[0]!;
const poItemRows = (poId: number) =>
  db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
const poStatus = async (id: number) =>
  (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)))[0]!
    .status;
const bare = (prItemId: number) => ({ prItemId });
/** Counts toward the contract's ordered qty (approved PO line), inserted directly. */
async function ordered(x: Ctx, qty: number, status = "approved") {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: fx.uid(),
      supplierId: x.supplierId,
      status: status as never,
      createdBy: (await fx.owner()).id,
    })
    .returning({ id: purchaseOrders.id });
  await db.insert(purchaseOrderItems).values({
    poId: po!.id,
    itemId: x.itemId,
    qty,
    receivedQty: 0,
    unitPricePaise: 24400,
    gstPercent: 18,
    uom: "kg",
    contractItemId: x.contract.lineIds[0]!,
  });
}
const orderedQtyOf = async (x: Ctx) =>
  Number(
    (
      await fx.rcApi(
        "GET",
        `/getcontractdetails/${x.contract.id}`,
        await fx.owner(),
      )
    ).json.data.lines[0].orderedQty,
  );

async function mkPo(who: Actor, x: Ctx, prItemId: number, line: Json = {}) {
  const r = await fx.createPo(who, x.supplierId, [{ prItemId, ...line }]);
  if (r.status !== 201)
    throw new Error(`fixture createpo: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.data.po.id as number;
}
async function submitAndApprove(poId: number) {
  await ensurePolicy();
  const s = await fx.submitPo(await fx.bo(), poId);
  if (s.status !== 201) return { s, a: null };
  const a = await fx.approve(await fx.owner2(), s.json.data.id);
  return { s, a };
}

describe("BR-RFQ-50 the contract rate comes first on a PO line", () => {
  test("BR-RFQ-50 PO to the contract supplier with no rate typed -> rate 24,400, GST 18, linked, source contract", async () => {
    const x = await ctx();
    const r = await fx.createPo(await fx.bo(), x.supplierId, [
      bare(x.prItemId),
    ]);
    expect(r.status).toBe(201);
    const [l] = await poItemRows(r.json.data.po.id);
    expect(l!.unitPricePaise).toBe(24400);
    expect(Number(l!.gstPercent)).toBe(18);
    expect(l!.contractItemId).toBe(x.contract.lineIds[0]!);
    expect(l!.contractRatePaise).toBe(24400);
    const items = await fx.poItems(r.json.data.po.id);
    expect(items[0].rateSource).toBe("contract");
    expect(items[0].contractNumber).toBe(x.contract.contractNumber);
    expect(items[0].contractRatePaise).toBe(24400);
  });

  test("BR-RFQ-50 the same rate typed is not an override: no key, no reason needed", async () => {
    const x = await ctx();
    const r = await fx.createPo(await fx.bo(), x.supplierId, [
      fx.poLine(x.prItemId, { rate: 24400 }),
    ]);
    expect(r.status).toBe(201);
    const [l] = await poItemRows(r.json.data.po.id);
    expect(l!.rateOverrideReason).toBeNull();
  });

  test("BR-RFQ-50 a PO to another supplier gets no contract link", async () => {
    const x = await ctx();
    const other = await fx.newSupplier();
    const r = await fx.createPo(await fx.bo(), other, [
      fx.poLine(x.prItemId, { rate: 20000 }),
    ]);
    expect(r.status).toBe(201);
    const [l] = await poItemRows(r.json.data.po.id);
    expect(l!.contractItemId).toBeNull();
    expect(l!.unitPricePaise).toBe(20000);
  });

  test("BR-RFQ-45 contract valid from a future date: a PO today gets no contract rate", async () => {
    const x = await ctx({ validFrom: istDay(5), validTo: istDay(40) });
    const r = await fx.createPo(await fx.bo(), x.supplierId, [
      fx.poLine(x.prItemId, { rate: 20000 }),
    ]);
    expect(r.status).toBe(201);
    const [l] = await poItemRows(r.json.data.po.id);
    expect(l!.contractItemId).toBeNull();
    expect(l!.unitPricePaise).toBe(20000);
  });

  test("BR-RFQ-45 on valid-from the contract applies", async () => {
    const x = await ctx({ validFrom: istDay(5), validTo: istDay(40) });
    setSystemTime(new Date(Date.now() + 5 * 86400000));
    try {
      const r = await fx.createPo(await fx.bo(), x.supplierId, [
        bare(x.prItemId),
      ]);
      expect(r.status).toBe(201);
      const [l] = await poItemRows(r.json.data.po.id);
      expect(l!.contractItemId).toBe(x.contract.lineIds[0]!);
    } finally {
      setSystemTime();
    }
  });

  test("BR-RFQ-47 the day after valid-to the contract is not used", async () => {
    const x = await ctx({ validFrom: istDay(-5), validTo: istDay(1) });
    setSystemTime(new Date(Date.now() + 2 * 86400000));
    try {
      const r = await fx.createPo(await fx.bo(), x.supplierId, [
        fx.poLine(x.prItemId, { rate: 20000 }),
      ]);
      expect(r.status).toBe(201);
      const [l] = await poItemRows(r.json.data.po.id);
      expect(l!.contractItemId).toBeNull();
    } finally {
      setSystemTime();
    }
  });

  test("BR-RFQ-48 terminated today: used through today, not the next day; earlier POs keep their rate", async () => {
    const x = await ctx();
    const first = await fx.createPo(await fx.bo(), x.supplierId, [
      bare(x.prItemId),
    ]);
    expect(first.status).toBe(201);
    const t = await fx.rcApi(
      "POST",
      `/${x.contract.id}/terminate`,
      await fx.owner(),
      { reason: "price revised" },
    );
    expect(t.status).toBe(200);
    const todayPr = await morePr(x, 10);
    const today = await fx.createPo(await fx.bo(), x.supplierId, [
      bare(todayPr),
    ]);
    expect(today.status).toBe(201);
    expect((await poItemRows(today.json.data.po.id))[0]!.contractItemId).toBe(
      x.contract.lineIds[0]!,
    );
    const tomorrowPr = await morePr(x, 10);
    setSystemTime(new Date(Date.now() + 86400000));
    try {
      const r = await fx.createPo(await fx.bo(), x.supplierId, [
        fx.poLine(tomorrowPr, { rate: 20000 }),
      ]);
      expect(r.status).toBe(201);
      expect(
        (await poItemRows(r.json.data.po.id))[0]!.contractItemId,
      ).toBeNull();
    } finally {
      setSystemTime();
    }
    const kept = (await poItemRows(first.json.data.po.id))[0]!;
    expect(kept.unitPricePaise).toBe(24400);
    expect(kept.contractItemId).toBe(x.contract.lineIds[0]!);
  });

  test("BR-RFQ-50 a draft contract is not used", async () => {
    const x = await ctx({ activate: false });
    const r = await fx.createPo(await fx.bo(), x.supplierId, [
      fx.poLine(x.prItemId, { rate: 20000 }),
    ]);
    expect(r.status).toBe(201);
    expect((await poItemRows(r.json.data.po.id))[0]!.contractItemId).toBeNull();
  });
});

describe("BR-RFQ-51, 55, 57 override of a contract-linked line", () => {
  test("BR-RFQ-51 back office sets 24,600 -> 403 PERMISSION_DENIED naming contract.override_rate, nothing saved", async () => {
    const x = await ctx();
    const r = await fx.createPo(await fx.bo(), x.supplierId, [
      fx.poLine(x.prItemId, { rate: 24600, reason: "urgent lot, premium" }),
    ]);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
    expect(r.json.key).toBe("contract.override_rate");
    const rows = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.supplierId, x.supplierId));
    expect(rows).toEqual([]);
  });

  test("BR-RFQ-51 owner sets 24,600 with a reason -> saved; reason, who, when and the contract rate are stored (BR-RFQ-71)", async () => {
    const x = await ctx();
    const owner = await fx.owner();
    const r = await fx.createPo(owner, x.supplierId, [
      fx.poLine(x.prItemId, { rate: 24600, reason: "urgent lot, premium" }),
    ]);
    expect(r.status).toBe(201);
    const [l] = await poItemRows(r.json.data.po.id);
    expect(l!.unitPricePaise).toBe(24600);
    expect(l!.contractRatePaise).toBe(24400);
    expect(l!.rateOverrideReason).toBe("urgent lot, premium");
    expect(l!.rateOverrideBy).toBe(owner.id);
    expect(l!.rateOverrideAt).not.toBeNull();
    const items = await fx.poItems(r.json.data.po.id, owner);
    expect(items[0].rateOverrideReason).toBe("urgent lot, premium");
    expect(items[0].rateOverrideByName).toBeTruthy();
  });

  test("BR-RFQ-51 super-admin may override with a reason", async () => {
    const x = await ctx();
    const r = await fx.createPo(await fx.superAdmin(), x.supplierId, [
      fx.poLine(x.prItemId, { rate: 24600, reason: "urgent lot, premium" }),
    ]);
    expect(r.status).toBe(201);
  });

  test("BR-RFQ-55 owner sets 24,600 with no reason -> 400 OVERRIDE_REASON_REQUIRED", async () => {
    const x = await ctx();
    const r = await fx.createPo(await fx.owner(), x.supplierId, [
      fx.poLine(x.prItemId, { rate: 24600 }),
    ]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("OVERRIDE_REASON_REQUIRED");
  });

  test("BR-RFQ-55 back office, same -> 403 first", async () => {
    const x = await ctx();
    const r = await fx.createPo(await fx.bo(), x.supplierId, [
      fx.poLine(x.prItemId, { rate: 24600 }),
    ]);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
  });

  test("BR-RFQ-55 a reason of 2 characters -> 400", async () => {
    const x = await ctx();
    const r = await fx.createPo(await fx.owner(), x.supplierId, [
      fx.poLine(x.prItemId, { rate: 24600, reason: "ab" }),
    ]);
    expect(r.status).toBe(400);
  });

  test("BR-RFQ-57 owner sends GST 12 % on the contract line -> 400 CONTRACT_LINE_LOCKED_FIELD", async () => {
    const x = await ctx();
    const r = await fx.createPo(await fx.owner(), x.supplierId, [
      fx.poLine(x.prItemId, { rate: 24400, gst: 12 }),
    ]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("CONTRACT_LINE_LOCKED_FIELD");
  });

  test("BR-RFQ-57 GST change together with a rate override is still refused, even for the owner", async () => {
    const x = await ctx();
    const r = await fx.createPo(await fx.owner(), x.supplierId, [
      fx.poLine(x.prItemId, {
        rate: 24600,
        gst: 5,
        reason: "urgent lot, premium",
      }),
    ]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("CONTRACT_LINE_LOCKED_FIELD");
  });

  test("BR-RFQ-57 back office sends GST 12 % -> 400 CONTRACT_LINE_LOCKED_FIELD (locked for everyone)", async () => {
    const x = await ctx();
    const r = await fx.createPo(await fx.bo(), x.supplierId, [
      fx.poLine(x.prItemId, { rate: 24400, gst: 12 }),
    ]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("CONTRACT_LINE_LOCKED_FIELD");
  });

  test("BR-RFQ-51 updatepo: back office reprices a linked line to 24,600 -> 403; owner with a reason -> saved", async () => {
    const x = await ctx();
    const poId = await mkPo(await fx.bo(), x, x.prItemId);
    const [line] = await poItemRows(poId);
    const edit = (who: Actor, upd: Json) =>
      fx.poApi("PATCH", "/updatepo", who, {
        poId,
        inserts: [],
        updates: [{ id: line!.id, ...upd }],
        deletes: [],
      });
    const no = await edit(await fx.bo(), {
      unitPricePaise: 24600,
      rateOverrideReason: "urgent lot, premium",
    });
    expect(no.status).toBe(403);
    expect(no.json.key).toBe("contract.override_rate");
    const noReason = await edit(await fx.owner(), { unitPricePaise: 24600 });
    expect(noReason.status).toBe(400);
    expect(noReason.json.code).toBe("OVERRIDE_REASON_REQUIRED");
    const ok = await edit(await fx.owner(), {
      unitPricePaise: 24600,
      rateOverrideReason: "urgent lot, premium",
    });
    expect(ok.status).toBe(200);
    expect((await poItemRows(poId))[0]!.unitPricePaise).toBe(24600);
  });

  test("BR-RFQ-57 updatepo: GST change on a linked line -> 400 CONTRACT_LINE_LOCKED_FIELD", async () => {
    const x = await ctx();
    const poId = await mkPo(await fx.bo(), x, x.prItemId);
    const [line] = await poItemRows(poId);
    const r = await fx.poApi("PATCH", "/updatepo", await fx.owner(), {
      poId,
      inserts: [],
      updates: [{ id: line!.id, gstPercent: 12 }],
      deletes: [],
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("CONTRACT_LINE_LOCKED_FIELD");
  });
});

describe("BR-RFQ-52 contract qty cap", () => {
  test("BR-RFQ-52 3000 ordered, PO for 2500 at 0 % allowance -> 409 CONTRACT_QTY_EXCEEDED with agreed, ordered, cap", async () => {
    const x = await ctx({ qty: 2500 });
    await ordered(x, 3000);
    const r = await fx.createPo(await fx.bo(), x.supplierId, [
      bare(x.prItemId),
    ]);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("CONTRACT_QTY_EXCEEDED");
    expect(Number(r.json.details.agreed)).toBe(5000);
    expect(Number(r.json.details.ordered)).toBe(3000);
    expect(Number(r.json.details.cap)).toBe(5000);
  });

  test("BR-RFQ-52 allowance 10 % (cap 5500) -> the same PO is ok", async () => {
    const x = await ctx({ qty: 2500, allowance: 10 });
    await ordered(x, 3000);
    const r = await fx.createPo(await fx.bo(), x.supplierId, [
      bare(x.prItemId),
    ]);
    expect(r.status).toBe(201);
  });

  test("BR-RFQ-52 a PO that reaches the cap exactly is ok (3000 + 2000 = 5000)", async () => {
    const x = await ctx({ qty: 2000 });
    await ordered(x, 3000);
    expect(
      (await fx.createPo(await fx.bo(), x.supplierId, [bare(x.prItemId)]))
        .status,
    ).toBe(201);
  });

  test("BR-RFQ-52 a rate-only contract line has no cap", async () => {
    const x = await ctx({ qty: 100000, agreedQty: null });
    await ordered(x, 90000);
    expect(
      (await fx.createPo(await fx.bo(), x.supplierId, [bare(x.prItemId)]))
        .status,
    ).toBe(201);
  });

  test("BR-RFQ-52/53 draft, pending, rejected and cancelled POs do not count toward the cap", async () => {
    const x = await ctx({ qty: 2500 });
    for (const s of ["draft", "pending_approval", "cancelled"])
      await ordered(x, 3000, s);
    expect(
      (await fx.createPo(await fx.bo(), x.supplierId, [bare(x.prItemId)]))
        .status,
    ).toBe(201);
  });

  test("BR-RFQ-52 cap re-checked at PO submit -> 409 CONTRACT_QTY_EXCEEDED", async () => {
    await ensurePolicy();
    const x = await ctx({ qty: 2500, prType: "maintenance" });
    const poId = await mkPo(await fx.bo(), x, x.prItemId);
    await ordered(x, 3000);
    const s = await fx.submitPo(await fx.bo(), poId);
    expect(s.status).toBe(409);
    expect(s.json.code).toBe("CONTRACT_QTY_EXCEEDED");
    expect(await poStatus(poId)).toBe("draft");
  });

  test("BR-RFQ-52/72 two POs of 3000 on a 5000 contract: both draft and submit, the second last-level approval -> 409 CONTRACT_QTY_EXCEEDED", async () => {
    await ensurePolicy();
    const x = await ctx({ qty: 3000, prType: "maintenance" });
    const second = await morePr(x, 3000, "maintenance");
    const bo = await fx.bo();
    const p1 = await mkPo(bo, x, x.prItemId);
    const p2 = await mkPo(bo, x, second);
    const s1 = await fx.submitPo(bo, p1);
    const s2 = await fx.submitPo(bo, p2);
    expect(s1.status).toBe(201);
    expect(s2.status).toBe(201);
    const approver = await fx.owner2();
    expect((await fx.approve(approver, s1.json.data.id)).status).toBe(200);
    const a2 = await fx.approve(approver, s2.json.data.id);
    expect(a2.status).toBe(409);
    expect(a2.json.code).toBe("CONTRACT_QTY_EXCEEDED");
    expect(await poStatus(p2)).toBe("pending_approval");
  });

  test("BR-RFQ-72 two POs approved at once past the cap: one 200, one 409", async () => {
    await ensurePolicy();
    const x = await ctx({ qty: 3000, prType: "maintenance" });
    const second = await morePr(x, 3000, "maintenance");
    const bo = await fx.bo();
    const p1 = await mkPo(bo, x, x.prItemId);
    const p2 = await mkPo(bo, x, second);
    const s1 = await fx.submitPo(bo, p1);
    const s2 = await fx.submitPo(bo, p2);
    const approver = await fx.owner2();
    const [a, b] = await Promise.all([
      fx.approve(approver, s1.json.data.id),
      fx.approve(approver, s2.json.data.id),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});

describe("BR-RFQ-53 ordered qty moves with approval and cancel", () => {
  test("BR-RFQ-53 draft and pending count 0; approved (last level) counts 1000; cancelling the approved PO takes it back to 0", async () => {
    await ensurePolicy();
    const x = await ctx({ qty: 1000, prType: "maintenance" });
    const bo = await fx.bo();
    const poId = await mkPo(bo, x, x.prItemId);
    expect(await orderedQtyOf(x)).toBe(0);
    const s = await fx.submitPo(bo, poId);
    expect(s.status).toBe(201);
    expect(await orderedQtyOf(x)).toBe(0);
    expect((await fx.approve(await fx.owner2(), s.json.data.id)).status).toBe(
      200,
    );
    expect(await poStatus(poId)).toBe("approved");
    expect(await orderedQtyOf(x)).toBe(1000);
    const del = await fx.poApi("DELETE", `/deletepo/${poId}`, bo, {
      reason: "wrong supplier",
    });
    expect(del.status).toBe(200);
    expect(await orderedQtyOf(x)).toBe(0);
  });

  test("BR-RFQ-53 a rejected PO never counts", async () => {
    await ensurePolicy();
    const x = await ctx({ qty: 1000, prType: "maintenance" });
    const bo = await fx.bo();
    const poId = await mkPo(bo, x, x.prItemId);
    const s = await fx.submitPo(bo, poId);
    const rej = await fx.call(
      "POST",
      `/api/approval/actOnRequest/${s.json.data.id}`,
      await fx.owner2(),
      {
        action: "reject",
        notes: "TEST reject",
      },
    );
    expect(rej.status).toBe(200);
    expect(await orderedQtyOf(x)).toBe(0);
  });
});

describe("BR-RFQ-54 a draft tied to an ended contract cannot be submitted until re-priced", () => {
  test("BR-RFQ-54 contract terminated and past its date -> submit 409 CONTRACT_NOT_ACTIVE; edit line drops the link; submit ok", async () => {
    await ensurePolicy();
    const x = await ctx({ qty: 1000, prType: "maintenance" });
    const bo = await fx.bo();
    const poId = await mkPo(bo, x, x.prItemId);
    expect((await poItemRows(poId))[0]!.contractItemId).not.toBeNull();
    const t = await fx.rcApi(
      "POST",
      `/${x.contract.id}/terminate`,
      await fx.owner(),
      { reason: "price revised" },
    );
    expect(t.status).toBe(200);
    setSystemTime(new Date(Date.now() + 2 * 86400000));
    try {
      const s = await fx.submitPo(bo, poId);
      expect(s.status).toBe(409);
      expect(s.json.code).toBe("CONTRACT_NOT_ACTIVE");
      const [line] = await poItemRows(poId);
      const e = await fx.poApi("PATCH", "/updatepo", bo, {
        poId,
        inserts: [],
        updates: [{ id: line!.id, unitPricePaise: 24400 }],
        deletes: [],
      });
      expect(e.status).toBe(200);
      const after = (await poItemRows(poId))[0]!;
      expect(after.contractItemId).toBeNull();
      expect(after.contractRatePaise).toBeNull();
      const again = await fx.submitPo(bo, poId);
      expect(again.status).toBe(201);
    } finally {
      setSystemTime();
    }
  });

  test("BR-RFQ-54 contract expired -> submit 409 CONTRACT_NOT_ACTIVE", async () => {
    await ensurePolicy();
    const x = await ctx({
      qty: 1000,
      prType: "maintenance",
      validFrom: istDay(-5),
      validTo: istDay(1),
    });
    const bo = await fx.bo();
    const poId = await mkPo(bo, x, x.prItemId);
    setSystemTime(new Date(Date.now() + 3 * 86400000));
    try {
      const s = await fx.submitPo(bo, poId);
      expect(s.status).toBe(409);
      expect(s.json.code).toBe("CONTRACT_NOT_ACTIVE");
    } finally {
      setSystemTime();
    }
  });

  test("BR-RFQ-54 a PO whose contract is still active submits and approves normally", async () => {
    const x = await ctx({ qty: 1000, prType: "maintenance" });
    const poId = await mkPo(await fx.bo(), x, x.prItemId);
    const { s, a } = await submitAndApprove(poId);
    expect(s.status).toBe(201);
    expect(a?.status).toBe(200);
  });
});

describe("BR-RFQ-56 rate suggestion shows the contract rate only to po.manage / contract.view", () => {
  const lastRate = (
    who: Actor,
    itemId: number,
    supplierId: number,
    onDate?: string,
  ) =>
    fx.call(
      "GET",
      `/api/asset/items/${itemId}/last-rate?supplierId=${supplierId}${onDate ? `&onDate=${onDate}` : ""}`,
      who,
    );
  async function withHistory(x: Ctx) {
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        poNumber: fx.uid(),
        supplierId: x.supplierId,
        status: "dispatched",
        createdBy: (await fx.owner()).id,
      })
      .returning({ id: purchaseOrders.id });
    await db.insert(purchaseOrderItems).values({
      poId: po!.id,
      itemId: x.itemId,
      qty: 10,
      receivedQty: 0,
      unitPricePaise: 24300,
      gstPercent: 18,
      uom: "kg",
    });
  }

  test("BR-RFQ-50 back office (po.manage) gets source contract first: 24,400, with the contract line and GST", async () => {
    const x = await ctx();
    await withHistory(x);
    const r = await lastRate(await fx.bo(), x.itemId, x.supplierId);
    expect(r.status).toBe(200);
    expect(r.json.data.source).toBe("contract");
    expect(r.json.data.ratePaise).toBe(24400);
    expect(r.json.data.contractItemId).toBe(x.contract.lineIds[0]!);
    expect(Number(r.json.data.gstPercent)).toBe(18);
  });

  test("BR-RFQ-56 contract.view alone (with inventory.view) also gets the contract rate", async () => {
    const x = await ctx();
    const who = await fx.actor("cv", ["inventory.view", "contract.view"]);
    const r = await lastRate(who, x.itemId, x.supplierId);
    expect(r.json.data.source).toBe("contract");
    expect(r.json.data.ratePaise).toBe(24400);
  });

  test("BR-RFQ-56 inventory.view only: next source 'Last PO' 24,300, no contract rate", async () => {
    const x = await ctx();
    await withHistory(x);
    const who = await fx.actor("invOnly", ["inventory.view"]);
    const r = await lastRate(who, x.itemId, x.supplierId);
    expect(r.status).toBe(200);
    expect(r.json.data.source).toBe("po_history");
    expect(r.json.data.ratePaise).toBe(24300);
    expect(r.json.data.contractItemId).toBeUndefined();
    expect(JSON.stringify(r.json)).not.toContain("24400");
  });

  test("BR-RFQ-50 onDate inside the contract period gives the contract, outside it does not", async () => {
    const x = await ctx({ validFrom: istDay(5), validTo: istDay(40) });
    await withHistory(x);
    const bo = await fx.bo();
    expect(
      (await lastRate(bo, x.itemId, x.supplierId, istDay(0))).json.data.source,
    ).toBe("po_history");
    expect(
      (await lastRate(bo, x.itemId, x.supplierId, istDay(10))).json.data.source,
    ).toBe("contract");
    expect(
      (await lastRate(bo, x.itemId, x.supplierId, istDay(41))).json.data.source,
    ).toBe("po_history");
  });

  test("BR-RFQ-50 no onDate means today: an expired contract is not suggested", async () => {
    const x = await ctx({ validFrom: istDay(-5), validTo: istDay(1) });
    await withHistory(x);
    setSystemTime(new Date(Date.now() + 3 * 86400000));
    try {
      const r = await lastRate(await fx.bo(), x.itemId, x.supplierId);
      expect(r.json.data.source).toBe("po_history");
    } finally {
      setSystemTime();
    }
  });
});

describe("BR-RFQ-74 PO line limits", () => {
  test("BR-RFQ-74 PO line value above 1e13 paise (1000 kg x 10,000,000,001) -> 400 AMOUNT_TOO_LARGE, no PO saved", async () => {
    const supplierId = await fx.newSupplier();
    const pr = await fx.newPr({ qtys: [1000] });
    const r = await fx.createPo(await fx.bo(), supplierId, [
      fx.poLine(pr.prItemIds[0]!, { rate: 10_000_000_001, gst: 0 }),
    ]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("AMOUNT_TOO_LARGE");
    const rows = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.supplierId, supplierId));
    expect(rows).toEqual([]);
  });

  test("BR-RFQ-74 PO line value exactly 1e13 paise is accepted", async () => {
    const supplierId = await fx.newSupplier();
    const pr = await fx.newPr({ qtys: [1000] });
    const r = await fx.createPo(await fx.bo(), supplierId, [
      fx.poLine(pr.prItemIds[0]!, { rate: 10_000_000_000, gst: 0 }),
    ]);
    expect(r.status).toBe(201);
  });

  test("BR-RFQ-74 a PO rate above 1e13 paise -> 400", async () => {
    const supplierId = await fx.newSupplier();
    const pr = await fx.newPr({ qtys: [1] });
    const r = await fx.createPo(await fx.bo(), supplierId, [
      fx.poLine(pr.prItemIds[0]!, { rate: 10_000_000_000_001, gst: 0 }),
    ]);
    expect(r.status).toBe(400);
  });
});
