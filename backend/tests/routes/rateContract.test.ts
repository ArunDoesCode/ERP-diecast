/**
 * Rate contracts (BR-RFQ-40..49, 70, 71, 73, 74 on contracts). Spec: docs/specs/rfq/spec.md (v1 frozen).
 * HTTP via createApp(), real DB. Fixtures TEST_rc_ prefixed (tests/helpers/rfqFixtures.ts).
 * Contract money cap follows the coordinator decision: agreed qty x rate <= 1e13 paise.
 */
import { afterAll, describe, expect, setSystemTime, test } from "bun:test";
import { db } from "../../src/db/client";
import {
  purchaseOrderItems,
  purchaseOrders,
} from "../../src/db/schemas/02_procurement-purchasing";
import { istDay, type Json, makeRfqFx } from "../helpers/rfqFixtures";

const fx = makeRfqFx("rc");
afterAll(() => fx.cleanup());

type Body = Record<string, unknown>;
async function body(over: Body = {}, line: Body = {}): Promise<Body> {
  return {
    supplierId: await fx.newSupplier(),
    validFrom: istDay(-10),
    validTo: istDay(30),
    lines: [
      {
        itemId: await fx.newItem(),
        ratePaise: 24400,
        gstPercent: 18,
        agreedQty: 5000,
        ...line,
      },
    ],
    ...over,
  };
}
const create = async (b: Body, who?: Awaited<ReturnType<typeof fx.owner>>) =>
  fx.rcApi("POST", "/createcontract", who ?? (await fx.owner()), b);
const details = async (
  id: number,
  who?: Awaited<ReturnType<typeof fx.owner>>,
) =>
  (
    await fx.rcApi(
      "GET",
      `/getcontractdetails/${id}`,
      who ?? (await fx.owner()),
    )
  ).json.data;
const activate = async (
  id: number,
  who?: Awaited<ReturnType<typeof fx.owner>>,
) => fx.rcApi("POST", `/${id}/activate`, who ?? (await fx.owner()), {});
const terminate = async (id: number, b: Body = { reason: "price revised" }) =>
  fx.rcApi("POST", `/${id}/terminate`, await fx.owner(), b);

describe("BR-RFQ-40 contract header", () => {
  test("BR-RFQ-40 created as draft with RC-<yyyy>-<mm>-<seq>, allowance default 0, createdBy", async () => {
    const who = await fx.owner();
    const r = await create(await body(), who);
    expect(r.status).toBe(201);
    expect(r.json.data.status).toBe("draft");
    expect(r.json.data.contractNumber).toMatch(/^RC-\d{4}-\d{2}-\d+$/);
    expect(Number(r.json.data.allowancePercent)).toBe(0);
    expect(r.json.data.createdBy).toBe(who.id);
  });

  test("BR-RFQ-40 the number carries the IST month (02:00 IST on 1 Oct 2026 -> RC-2026-10-)", async () => {
    setSystemTime(new Date("2026-09-30T20:30:00.000Z"));
    try {
      const r = await create(
        await body({ validFrom: "2026-10-01", validTo: "2026-12-31" }),
      );
      expect(r.status).toBe(201);
      expect(r.json.data.contractNumber).toMatch(/^RC-2026-10-\d+$/);
    } finally {
      setSystemTime();
    }
  });

  test("BR-RFQ-40 no valid-to -> 400 CONTRACT_DATES_INVALID", async () => {
    const b = await body();
    delete b.validTo;
    const r = await create(b);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("CONTRACT_DATES_INVALID");
  });

  test("BR-RFQ-40 valid-to before valid-from -> 400 CONTRACT_DATES_INVALID; equal dates are fine", async () => {
    const bad = await create(
      await body({ validFrom: istDay(5), validTo: istDay(4) }),
    );
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe("CONTRACT_DATES_INVALID");
    const ok = await create(
      await body({ validFrom: istDay(5), validTo: istDay(5) }),
    );
    expect(ok.status).toBe(201);
  });

  test("BR-RFQ-40 inactive supplier -> 400 SUPPLIER_INACTIVE", async () => {
    const r = await create(
      await body({ supplierId: await fx.newSupplier({ active: false }) }),
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("SUPPLIER_INACTIVE");
  });

  test("BR-RFQ-40 unknown supplier -> 404", async () => {
    const r = await create(await body({ supplierId: 2_000_000_000 }));
    expect(r.status).toBe(404);
  });

  test("BR-RFQ-40 allowance 0..20 accepted (2 decimals), 21 and -1 -> 400", async () => {
    const ok = await create(await body({ allowancePercent: 20 }));
    expect(ok.status).toBe(201);
    const dec = await create(await body({ allowancePercent: 7.5 }));
    expect(dec.status).toBe(201);
    expect(Number(dec.json.data.allowancePercent)).toBe(7.5);
    expect((await create(await body({ allowancePercent: 21 }))).status).toBe(
      400,
    );
    expect((await create(await body({ allowancePercent: -1 }))).status).toBe(
      400,
    );
  });

  test("BR-RFQ-40 notes over 2000 characters -> 400", async () => {
    expect((await create(await body({ notes: "x".repeat(2001) }))).status).toBe(
      400,
    );
  });
});

describe("BR-RFQ-41 contract lines", () => {
  test("BR-RFQ-41 ADC12 24,400, 18 %, 5000 kg -> saved with the item's uom", async () => {
    const r = await create(await body());
    expect(r.status).toBe(201);
    const l = r.json.data.lines[0];
    expect(l.ratePaise).toBe(24400);
    expect(Number(l.gstPercent)).toBe(18);
    expect(Number(l.agreedQty)).toBe(5000);
    expect(l.uom).toBe("kg");
  });

  test("BR-RFQ-41 rate 0 -> 400 CONTRACT_LINE_INVALID", async () => {
    const r = await create(await body({}, { ratePaise: 0 }));
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("CONTRACT_LINE_INVALID");
  });

  test("BR-RFQ-41 GST 17 -> 400 CONTRACT_LINE_INVALID", async () => {
    const r = await create(await body({}, { gstPercent: 17 }));
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("CONTRACT_LINE_INVALID");
  });

  test("BR-RFQ-41 the same item twice -> 400 CONTRACT_LINE_INVALID", async () => {
    const itemId = await fx.newItem();
    const r = await create(
      await body({
        lines: [
          { itemId, ratePaise: 100, gstPercent: 18, agreedQty: 1 },
          { itemId, ratePaise: 200, gstPercent: 18, agreedQty: 1 },
        ],
      }),
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("CONTRACT_LINE_INVALID");
  });

  test("BR-RFQ-41 inactive item -> 400 CONTRACT_LINE_INVALID", async () => {
    const r = await create(
      await body({}, { itemId: await fx.newItem({ active: false }) }),
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("CONTRACT_LINE_INVALID");
  });

  test("BR-RFQ-41 agreed qty 1.2345 (4 decimals) -> 400 CONTRACT_LINE_INVALID; 1.234 ok", async () => {
    const bad = await create(await body({}, { agreedQty: 1.2345 }));
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe("CONTRACT_LINE_INVALID");
    expect((await create(await body({}, { agreedQty: 1.234 }))).status).toBe(
      201,
    );
  });

  test("BR-RFQ-41 agreed qty 0 or negative -> 400", async () => {
    expect((await create(await body({}, { agreedQty: 0 }))).status).toBe(400);
    expect((await create(await body({}, { agreedQty: -5 }))).status).toBe(400);
  });

  test("BR-RFQ-41 a blank agreed qty makes a rate-only line", async () => {
    const r = await create(await body({}, { agreedQty: null }));
    expect(r.status).toBe(201);
    expect(r.json.data.lines[0].agreedQty).toBeNull();
    expect(r.json.data.lines[0].percentOrdered).toBeNull();
    expect(r.json.data.lines[0].capQty).toBeNull();
  });

  test("BR-RFQ-41 no lines -> 400", async () => {
    expect((await create(await body({ lines: [] }))).status).toBe(400);
  });
});

describe("BR-RFQ-43, 44 draft contracts: edit and cancel", () => {
  test("BR-RFQ-43 owner makes a contract by hand with no RFQ -> draft", async () => {
    const r = await create(await body());
    expect(r.status).toBe(201);
    expect(r.json.data.status).toBe("draft");
  });

  test("BR-RFQ-44 a draft can be edited (full replace)", async () => {
    const r = await create(await body());
    const id = r.json.data.id;
    const itemId = await fx.newItem();
    const u = await fx.rcApi("PATCH", "/updatecontract", await fx.owner(), {
      id,
      supplierId: r.json.data.supplierId,
      validFrom: istDay(-10),
      validTo: istDay(60),
      allowancePercent: 5,
      lines: [{ itemId, ratePaise: 30000, gstPercent: 12, agreedQty: 100 }],
    });
    expect(u.status).toBe(200);
    const d = await details(id);
    expect(d.validTo).toBe(istDay(60));
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].itemId).toBe(itemId);
    expect(d.lines[0].ratePaise).toBe(30000);
  });

  test("BR-RFQ-44 an active contract cannot be edited -> 409 CONTRACT_NOT_EDITABLE, rate unchanged", async () => {
    const c = await fx.mkContract({
      supplierId: await fx.newSupplier(),
      items: [{ itemId: await fx.newItem(), rate: 24400 }],
    });
    const before = await details(c.id);
    const u = await fx.rcApi("PATCH", "/updatecontract", await fx.owner(), {
      id: c.id,
      supplierId: before.supplierId,
      validFrom: before.validFrom,
      validTo: before.validTo,
      lines: [
        {
          itemId: before.lines[0].itemId,
          ratePaise: 99999,
          gstPercent: 18,
          agreedQty: 5000,
        },
      ],
    });
    expect(u.status).toBe(409);
    expect(u.json.code).toBe("CONTRACT_NOT_EDITABLE");
    expect((await details(c.id)).lines[0].ratePaise).toBe(24400);
  });

  test("BR-RFQ-44 cancel a draft with a reason; it stores who, when, why (BR-RFQ-71)", async () => {
    const who = await fx.owner();
    const r = await create(await body(), who);
    const id = r.json.data.id;
    const c = await fx.rcApi("POST", `/${id}/cancel`, who, {
      reason: "negotiation failed",
    });
    expect(c.status).toBe(200);
    const d = await details(id);
    expect(d.status).toBe("cancelled");
    expect(d.cancelReason).toBe("negotiation failed");
    expect(d.cancelledAt).toBeTruthy();
    expect(d.cancelledByName).toContain("owner");
  });

  test("BR-RFQ-44 cancel with reason 'no' -> 400, contract stays draft", async () => {
    const r = await create(await body());
    const c = await fx.rcApi(
      "POST",
      `/${r.json.data.id}/cancel`,
      await fx.owner(),
      { reason: "no" },
    );
    expect(c.status).toBe(400);
    expect((await details(r.json.data.id)).status).toBe("draft");
  });

  test("BR-RFQ-44 cancel an active contract -> 409 CONTRACT_NOT_EDITABLE", async () => {
    const c = await fx.mkContract({
      supplierId: await fx.newSupplier(),
      items: [{ itemId: await fx.newItem() }],
    });
    const r = await fx.rcApi("POST", `/${c.id}/cancel`, await fx.owner(), {
      reason: "negotiation failed",
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("CONTRACT_NOT_EDITABLE");
  });

  test("BR-RFQ-44 a cancelled contract cannot be edited, activated or cancelled again", async () => {
    const who = await fx.owner();
    const r = await create(await body(), who);
    const id = r.json.data.id;
    await fx.rcApi("POST", `/${id}/cancel`, who, {
      reason: "negotiation failed",
    });
    expect((await activate(id)).status).toBe(409);
    expect(
      (
        await fx.rcApi("POST", `/${id}/cancel`, who, {
          reason: "negotiation failed",
        })
      ).status,
    ).toBe(409);
  });
});

describe("BR-RFQ-45 activate", () => {
  test("BR-RFQ-45 activate draft -> active, stores who and when (BR-RFQ-71)", async () => {
    const who = await fx.owner();
    const r = await create(await body(), who);
    const a = await activate(r.json.data.id, who);
    expect(a.status).toBe(200);
    const d = await details(r.json.data.id);
    expect(d.status).toBe("active");
    expect(d.effectiveStatus).toBe("active");
    expect(d.activatedAt).toBeTruthy();
    expect(d.activatedByName).toContain("owner");
  });

  test("BR-RFQ-45 valid-to before today -> 400 CONTRACT_DATES_INVALID, stays draft", async () => {
    const r = await create(
      await body({ validFrom: istDay(-20), validTo: istDay(-1) }),
    );
    const a = await activate(r.json.data.id);
    expect(a.status).toBe(400);
    expect(a.json.code).toBe("CONTRACT_DATES_INVALID");
    expect((await details(r.json.data.id)).status).toBe("draft");
  });

  test("BR-RFQ-45 valid-to today is accepted", async () => {
    const r = await create(
      await body({ validFrom: istDay(-5), validTo: istDay(0) }),
    );
    expect((await activate(r.json.data.id)).status).toBe(200);
  });

  test("BR-RFQ-45 a future valid-from may be activated", async () => {
    const r = await create(
      await body({ validFrom: istDay(10), validTo: istDay(40) }),
    );
    expect((await activate(r.json.data.id)).status).toBe(200);
  });

  test("BR-RFQ-45 activating an active contract -> 409 CONTRACT_INVALID_STATUS", async () => {
    const c = await fx.mkContract({
      supplierId: await fx.newSupplier(),
      items: [{ itemId: await fx.newItem() }],
    });
    const r = await activate(c.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("CONTRACT_INVALID_STATUS");
  });
});

describe("BR-RFQ-46 no overlapping active contracts for a supplier and item", () => {
  test("BR-RFQ-46 overlapping dates -> 409 CONTRACT_OVERLAP naming the other contract", async () => {
    const supplierId = await fx.newSupplier();
    const itemId = await fx.newItem();
    const first = await fx.mkContract({
      supplierId,
      items: [{ itemId }],
      validFrom: istDay(-10),
      validTo: istDay(50),
    });
    const second = await create(
      await body(
        { supplierId, validFrom: istDay(40), validTo: istDay(80) },
        { itemId },
      ),
    );
    const r = await activate(second.json.data.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("CONTRACT_OVERLAP");
    expect(r.json.details.contractNumber).toBe(first.contractNumber);
    expect((await details(second.json.data.id)).status).toBe("draft");
  });

  test("BR-RFQ-46 touching on the last day counts as overlap; the next day does not", async () => {
    const supplierId = await fx.newSupplier();
    const itemId = await fx.newItem();
    await fx.mkContract({
      supplierId,
      items: [{ itemId }],
      validFrom: istDay(-10),
      validTo: istDay(50),
    });
    const same = await create(
      await body(
        { supplierId, validFrom: istDay(50), validTo: istDay(80) },
        { itemId },
      ),
    );
    expect((await activate(same.json.data.id)).status).toBe(409);
    const next = await create(
      await body(
        { supplierId, validFrom: istDay(51), validTo: istDay(80) },
        { itemId },
      ),
    );
    expect((await activate(next.json.data.id)).status).toBe(200);
  });

  test("BR-RFQ-46 another item or another supplier does not clash", async () => {
    const supplierId = await fx.newSupplier();
    const itemId = await fx.newItem();
    await fx.mkContract({ supplierId, items: [{ itemId }] });
    const otherItem = await create(await body({ supplierId }));
    expect((await activate(otherItem.json.data.id)).status).toBe(200);
    const otherSupplier = await create(await body({}, { itemId }));
    expect((await activate(otherSupplier.json.data.id)).status).toBe(200);
  });

  test("BR-RFQ-46 a terminated contract covers only up to its termination date", async () => {
    const supplierId = await fx.newSupplier();
    const itemId = await fx.newItem();
    const first = await fx.mkContract({
      supplierId,
      items: [{ itemId }],
      validFrom: istDay(-10),
      validTo: istDay(50),
    });
    expect(
      (
        await terminate(first.id, {
          reason: "price revised",
          terminatedOn: istDay(10),
        })
      ).status,
    ).toBe(200);
    const second = await create(
      await body(
        { supplierId, validFrom: istDay(11), validTo: istDay(60) },
        { itemId },
      ),
    );
    expect((await activate(second.json.data.id)).status).toBe(200);
  });

  test("BR-RFQ-46/72 two overlapping contracts activated at once: one 200, one 409", async () => {
    const supplierId = await fx.newSupplier();
    const itemId = await fx.newItem();
    const a = await create(
      await body(
        { supplierId, validFrom: istDay(-1), validTo: istDay(20) },
        { itemId },
      ),
    );
    const b = await create(
      await body(
        { supplierId, validFrom: istDay(5), validTo: istDay(40) },
        { itemId },
      ),
    );
    const [x, y] = await Promise.all([
      activate(a.json.data.id),
      activate(b.json.data.id),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });
});

describe("BR-RFQ-47 expiry is computed", () => {
  test("BR-RFQ-47 the day after valid-to an active contract reads expired, with no action", async () => {
    const r = await create(
      await body({ validFrom: istDay(-5), validTo: istDay(1) }),
    );
    const id = r.json.data.id;
    await activate(id);
    setSystemTime(new Date(Date.now() + 3 * 86400000));
    try {
      const d = await details(id);
      expect(d.status).toBe("active");
      expect(d.effectiveStatus).toBe("expired");
      const list = await fx.rcApi(
        "GET",
        "/getcontracts?status=expired",
        await fx.owner(),
      );
      expect(list.json.data.map((c: Json) => c.id)).toContain(id);
      const active = await fx.rcApi(
        "GET",
        "/getcontracts?status=active",
        await fx.owner(),
      );
      expect(active.json.data.map((c: Json) => c.id)).not.toContain(id);
    } finally {
      setSystemTime();
    }
  });
});

describe("BR-RFQ-48 terminate", () => {
  test("BR-RFQ-48 terminate with a reason, default date today; stores who, when, why (BR-RFQ-71)", async () => {
    const c = await fx.mkContract({
      supplierId: await fx.newSupplier(),
      items: [{ itemId: await fx.newItem() }],
    });
    const r = await terminate(c.id, { reason: "price revised" });
    expect(r.status).toBe(200);
    const d = await details(c.id);
    expect(d.status).toBe("terminated");
    expect(d.terminatedOn).toBe(istDay(0));
    expect(d.terminateReason).toBe("price revised");
    expect(d.terminatedAt).toBeTruthy();
    expect(d.terminatedByName).toContain("owner");
  });

  test("BR-RFQ-48 a termination date from today up to valid-to is accepted", async () => {
    const c = await fx.mkContract({
      supplierId: await fx.newSupplier(),
      items: [{ itemId: await fx.newItem() }],
      validTo: istDay(30),
    });
    const r = await terminate(c.id, {
      reason: "price revised",
      terminatedOn: istDay(30),
    });
    expect(r.status).toBe(200);
    expect((await details(c.id)).terminatedOn).toBe(istDay(30));
  });

  test("BR-RFQ-48 date before today or after valid-to -> 400 CONTRACT_DATES_INVALID", async () => {
    const c = await fx.mkContract({
      supplierId: await fx.newSupplier(),
      items: [{ itemId: await fx.newItem() }],
      validTo: istDay(30),
    });
    const early = await terminate(c.id, {
      reason: "price revised",
      terminatedOn: istDay(-1),
    });
    expect(early.status).toBe(400);
    expect(early.json.code).toBe("CONTRACT_DATES_INVALID");
    const late = await terminate(c.id, {
      reason: "price revised",
      terminatedOn: istDay(31),
    });
    expect(late.status).toBe(400);
    expect(late.json.code).toBe("CONTRACT_DATES_INVALID");
    expect((await details(c.id)).status).toBe("active");
  });

  test("BR-RFQ-48 reason of 2 characters -> 400", async () => {
    const c = await fx.mkContract({
      supplierId: await fx.newSupplier(),
      items: [{ itemId: await fx.newItem() }],
    });
    expect((await terminate(c.id, { reason: "ab" })).status).toBe(400);
  });

  test("BR-RFQ-48 already terminated, or still a draft -> 409 CONTRACT_INVALID_STATUS", async () => {
    const c = await fx.mkContract({
      supplierId: await fx.newSupplier(),
      items: [{ itemId: await fx.newItem() }],
    });
    await terminate(c.id);
    const again = await terminate(c.id);
    expect(again.status).toBe(409);
    expect(again.json.code).toBe("CONTRACT_INVALID_STATUS");
    const draft = await create(await body());
    const d = await terminate(draft.json.data.id);
    expect(d.status).toBe(409);
    expect(d.json.code).toBe("CONTRACT_INVALID_STATUS");
  });

  test("BR-RFQ-48 an expired contract cannot be terminated -> 409 CONTRACT_INVALID_STATUS", async () => {
    const r = await create(
      await body({ validFrom: istDay(-5), validTo: istDay(1) }),
    );
    await activate(r.json.data.id);
    setSystemTime(new Date(Date.now() + 3 * 86400000));
    try {
      const t = await terminate(r.json.data.id);
      expect(t.status).toBe(409);
      expect(t.json.code).toBe("CONTRACT_INVALID_STATUS");
    } finally {
      setSystemTime();
    }
  });
});

describe("BR-RFQ-49 fulfilment", () => {
  async function poLineOn(
    supplierId: number,
    itemId: number,
    contractItemId: number,
    o: { qty: number; received: number; status: string },
  ) {
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        poNumber: fx.uid(),
        supplierId,
        status: o.status as never,
        createdBy: (await fx.owner()).id,
      })
      .returning({ id: purchaseOrders.id });
    await db.insert(purchaseOrderItems).values({
      poId: po!.id,
      itemId,
      qty: o.qty,
      receivedQty: o.received,
      unitPricePaise: 24400,
      gstPercent: 18,
      uom: "kg",
      contractItemId,
    });
    return po!.id;
  }

  test("BR-RFQ-49 5000 agreed, 3000 ordered, 2500 received -> 60 % ordered; draft and cancelled POs do not count", async () => {
    const supplierId = await fx.newSupplier();
    const itemId = await fx.newItem();
    const c = await fx.mkContract({
      supplierId,
      items: [{ itemId, agreedQty: 5000 }],
    });
    await poLineOn(supplierId, itemId, c.lineIds[0]!, {
      qty: 3000,
      received: 2500,
      status: "partial_received",
    });
    await poLineOn(supplierId, itemId, c.lineIds[0]!, {
      qty: 700,
      received: 0,
      status: "draft",
    });
    await poLineOn(supplierId, itemId, c.lineIds[0]!, {
      qty: 400,
      received: 0,
      status: "cancelled",
    });
    await poLineOn(supplierId, itemId, c.lineIds[0]!, {
      qty: 300,
      received: 0,
      status: "pending_approval",
    });
    const d = await details(c.id);
    const l = d.lines[0];
    expect(Number(l.orderedQty)).toBe(3000);
    expect(Number(l.receivedQty)).toBe(2500);
    expect(Number(l.percentOrdered)).toBe(60);
    expect(Number(l.capQty)).toBe(5000);
    expect(d.pos.length).toBeGreaterThanOrEqual(1);
    const list = await fx.rcApi(
      "GET",
      `/getcontracts?supplierId=${supplierId}`,
      await fx.owner(),
    );
    expect(Number(list.json.data[0].orderedPercent)).toBe(60);
    expect(list.json.data[0].itemCount).toBe(1);
  });

  test("BR-RFQ-49/53 a short-closed (closed) PO keeps its full qty counted", async () => {
    const supplierId = await fx.newSupplier();
    const itemId = await fx.newItem();
    const c = await fx.mkContract({
      supplierId,
      items: [{ itemId, agreedQty: 5000 }],
    });
    await poLineOn(supplierId, itemId, c.lineIds[0]!, {
      qty: 1000,
      received: 600,
      status: "closed",
    });
    const l = (await details(c.id)).lines[0];
    expect(Number(l.orderedQty)).toBe(1000);
    expect(Number(l.receivedQty)).toBe(600);
  });

  test("BR-RFQ-52 cap = agreed x (1 + allowance %): 5000 at 10 % -> 5500", async () => {
    const c = await fx.mkContract({
      supplierId: await fx.newSupplier(),
      items: [{ itemId: await fx.newItem(), agreedQty: 5000 }],
      allowance: 10,
    });
    expect(Number((await details(c.id)).lines[0].capQty)).toBe(5500);
  });

  test("BR-RFQ-49 a rate-only list row has orderedPercent null", async () => {
    const supplierId = await fx.newSupplier();
    await fx.mkContract({
      supplierId,
      items: [{ itemId: await fx.newItem(), agreedQty: null }],
    });
    const list = await fx.rcApi(
      "GET",
      `/getcontracts?supplierId=${supplierId}`,
      await fx.owner(),
    );
    expect(list.json.data[0].orderedPercent).toBeNull();
  });

  test("BR-RFQ-49 'ends within 30 days' filter lists contracts ending soon, soonest first", async () => {
    const supplierId = await fx.newSupplier();
    const soon = await fx.mkContract({
      supplierId,
      items: [{ itemId: await fx.newItem() }],
      validTo: istDay(20),
    });
    const sooner = await fx.mkContract({
      supplierId,
      items: [{ itemId: await fx.newItem() }],
      validTo: istDay(5),
    });
    const later = await fx.mkContract({
      supplierId,
      items: [{ itemId: await fx.newItem() }],
      validTo: istDay(90),
    });
    const r = await fx.rcApi(
      "GET",
      `/getcontracts?endsWithinDays=30&supplierId=${supplierId}`,
      await fx.owner(),
    );
    expect(r.status).toBe(200);
    expect(r.json.data.map((c: Json) => c.id)).toEqual([sooner.id, soon.id]);
    expect(r.json.data.map((c: Json) => c.id)).not.toContain(later.id);
  });

  test("list filters by status, item and search, and pages", async () => {
    const supplierId = await fx.newSupplier();
    const itemId = await fx.newItem();
    const c = await fx.mkContract({ supplierId, items: [{ itemId }] });
    const who = await fx.owner();
    const byItem = await fx.rcApi(
      "GET",
      `/getcontracts?itemId=${itemId}&status=active&pageSize=5`,
      who,
    );
    expect(byItem.status).toBe(200);
    expect(byItem.json.meta.pageSize).toBe(5);
    expect(byItem.json.data.map((x: Json) => x.id)).toEqual([c.id]);
    const q = await fx.rcApi("GET", `/getcontracts?q=${c.contractNumber}`, who);
    expect(q.json.data.map((x: Json) => x.id)).toContain(c.id);
    const draft = await fx.rcApi(
      "GET",
      `/getcontracts?status=draft&itemId=${itemId}`,
      who,
    );
    expect(draft.json.data).toEqual([]);
    expect(
      (await fx.rcApi("GET", "/getcontractdetails/2000000000", who)).status,
    ).toBe(404);
  });
});

describe("BR-RFQ-70 permissions", () => {
  test("BR-RFQ-70 no login -> 401 on every contract route", async () => {
    for (const [m, p, b] of [
      ["GET", "/getcontracts"],
      ["GET", "/getcontractdetails/1"],
      ["POST", "/createcontract", {}],
      ["PATCH", "/updatecontract", {}],
      ["POST", "/1/activate", {}],
      ["POST", "/1/terminate", { reason: "abc" }],
      ["POST", "/1/cancel", { reason: "abc" }],
    ] as [string, string, unknown?][])
      expect((await fx.rcApi(m, p, null, b)).status).toBe(401);
  });

  test("BR-RFQ-70 back office (contract.view only) can read but cannot create, edit, activate, terminate or cancel -> 403", async () => {
    const bo = await fx.bo();
    const c = await fx.mkContract({
      supplierId: await fx.newSupplier(),
      items: [{ itemId: await fx.newItem() }],
    });
    expect((await fx.rcApi("GET", "/getcontracts", bo)).status).toBe(200);
    expect(
      (await fx.rcApi("GET", `/getcontractdetails/${c.id}`, bo)).status,
    ).toBe(200);
    const made = await create(await body(), bo);
    expect(made.status).toBe(403);
    expect(made.json.code).toBe("PERMISSION_DENIED");
    expect(made.json.key).toBe("contract.manage");
    expect(
      (await fx.rcApi("PATCH", "/updatecontract", bo, { id: c.id })).status,
    ).toBe(403);
    expect(
      (
        await fx.rcApi("POST", `/${c.id}/terminate`, bo, {
          reason: "price revised",
        })
      ).status,
    ).toBe(403);
    const draft = await create(await body());
    expect((await activate(draft.json.data.id, bo)).status).toBe(403);
    expect(
      (
        await fx.rcApi("POST", `/${draft.json.data.id}/cancel`, bo, {
          reason: "negotiation failed",
        })
      ).status,
    ).toBe(403);
    expect((await details(c.id)).status).toBe("active");
    expect((await details(draft.json.data.id)).status).toBe("draft");
  });

  test("BR-RFQ-70 floor supervisor cannot even read contracts -> 403", async () => {
    const r = await fx.rcApi("GET", "/getcontracts", await fx.floor());
    expect(r.status).toBe(403);
    expect(r.json.key).toBe("contract.view");
  });

  test("BR-RFQ-70 super-admin can create and activate", async () => {
    const sa = await fx.superAdmin();
    const r = await create(await body(), sa);
    expect(r.status).toBe(201);
    expect((await activate(r.json.data.id, sa)).status).toBe(200);
  });
});

describe("BR-RFQ-73, 74 money on contracts", () => {
  test("BR-RFQ-73 a fractional rate 244.5 -> 400", async () => {
    expect((await create(await body({}, { ratePaise: 244.5 }))).status).toBe(
      400,
    );
  });

  test("BR-RFQ-74 1,000,000,000 kg x 10,000,000 paise on a contract -> 400 AMOUNT_TOO_LARGE", async () => {
    const r = await create(
      await body({}, { agreedQty: 1_000_000_000, ratePaise: 10_000_000 }),
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("AMOUNT_TOO_LARGE");
  });

  test("BR-RFQ-74 agreed qty x rate just above 1e13 -> 400 AMOUNT_TOO_LARGE; exactly 1e13 accepted", async () => {
    const over = await create(
      await body({}, { agreedQty: 1_000_000_000, ratePaise: 10_001 }),
    );
    expect(over.status).toBe(400);
    expect(over.json.code).toBe("AMOUNT_TOO_LARGE");
    const exact = await create(
      await body({}, { agreedQty: 1_000_000_000, ratePaise: 10_000 }),
    );
    expect(exact.status).toBe(201);
  });

  test("BR-RFQ-74 a contract rate above 1e13 paise -> 400", async () => {
    expect(
      (
        await create(
          await body({}, { agreedQty: null, ratePaise: 10_000_000_000_001 }),
        )
      ).status,
    ).toBe(400);
  });

  test("BR-RFQ-73 unknown body key -> 400", async () => {
    expect((await create(await body({ bogus: 1 }))).status).toBe(400);
  });
});
