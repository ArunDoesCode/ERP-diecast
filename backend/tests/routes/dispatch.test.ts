/**
 * Dispatch: pending list, draft create / edit / cancel-draft, register, access
 * (docs/specs/dispatch/spec.md v1: BR-DSP-01..09, 19, 20, 23, 25, 29, 33..36,
 * 39, 40, 43). Real DB, full HTTP stack. Fixtures TEST_dspd_ prefixed.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { locations } from "../../src/db/schemas/02_procurement-catalog";
import { customers, salesAuditLog } from "../../src/db/schemas/05_sales";
import { istDay, makeDispatchFx } from "../helpers/dispatchFixtures";

const fx = makeDispatchFx("dspd");

beforeAll(async () => {
  await fx.setupCompany();
});
afterAll(async () => {
  await fx.cleanup();
});

const one = (soId: number, soLineId: number, qty: number, extra = {}) => ({
  soId,
  lines: [{ soLineId, qty }],
  ...extra,
});

describe("pending-dispatch list (BR-DSP-39)", () => {
  test("BR-DSP-39 lists a confirmed SO line with ordered, delivered, open and stock at the chosen location, without price", async () => {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 1000 }] });
    await fx.stock(so.items[0] as number, loc, 100);
    const r = await fx.dsp(
      "floor_supervisor",
      "GET",
      `/pending?soId=${so.soId}&locationId=${loc}`,
    );
    expect(r.status).toBe(200);
    expect(r.json.data).toHaveLength(1);
    const row = r.json.data[0];
    expect(row.soId).toBe(so.soId);
    expect(row.soLineId).toBe(so.lineIds[0]);
    expect(row.ordered).toBe(1000);
    expect(row.delivered).toBe(0);
    expect(row.open).toBe(1000);
    expect(row.stockAtLocation).toBe(100);
    expect(JSON.stringify(row)).not.toMatch(/price|gst|value/i);
  });

  test("BR-DSP-39 only confirmed SOs appear: an SO on hold has no row", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 10 }] });
    await fx.soOp(so.soId, "hold");
    const r = await fx.dsp("owner", "GET", `/pending?soId=${so.soId}`);
    expect(r.status).toBe(200);
    expect(r.json.data).toHaveLength(0);
  });

  test("BR-DSP-39 a soft-removed SO line has no row", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 10 }, { qty: 20 }],
    });
    await fx.soEdit(so.soId, { removeLineIds: [so.lineIds[1]] });
    const r = await fx.dsp("owner", "GET", `/pending?soId=${so.soId}`);
    expect(r.json.data.map((x: { soLineId: number }) => x.soLineId)).toEqual([
      so.lineIds[0],
    ]);
  });

  test("BR-DSP-39 filters by customer and by item", async () => {
    const c1 = await fx.mkCustomer();
    const c2 = await fx.mkCustomer();
    const a = await fx.mkSo({ customerId: c1, lines: [{ qty: 5 }] });
    const b = await fx.mkSo({ customerId: c2, lines: [{ qty: 5 }] });
    const byCust = await fx.dsp("owner", "GET", `/pending?customerId=${c1}`);
    expect(byCust.json.data.map((x: { soId: number }) => x.soId)).toEqual([
      a.soId,
    ]);
    const byItem = await fx.dsp(
      "owner",
      "GET",
      `/pending?itemId=${b.items[0]}`,
    );
    expect(byItem.json.data.map((x: { soId: number }) => x.soId)).toEqual([
      b.soId,
    ]);
  });

  test("BR-DSP-39 a stock location that is virtual, inactive or a vendor location is refused with 400", async () => {
    const virt = await fx.mkVirtualLoc();
    const off = await fx.mkLoc();
    await fx.setLocActive(off, false);
    const vendor = await fx.mkVendorLoc();
    for (const id of [virt, off, vendor]) {
      const r = await fx.dsp("owner", "GET", `/pending?locationId=${id}`);
      expect(r.status).toBe(400);
    }
  });

  test("BR-DSP-39 with soId the meta carries the SO header and a user without so.view can read it", async () => {
    const c = await fx.mkCustomer({ stateCode: "33" });
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 5 }],
      shipTo: { address: "Hosur works", stateCode: "33" },
    });
    const r = await fx.dsp(
      "floor_supervisor",
      "GET",
      `/pending?soId=${so.soId}`,
    );
    expect(r.status).toBe(200);
    expect(r.json.meta.so.soNumber).toBe(so.soNumber);
    expect(r.json.meta.so.customer.id).toBe(c);
    expect(r.json.meta.so.shipTo.stateCode).toBe("33");
  });

  test("BR-DSP-39 an unknown sortBy is 400 and paging meta is returned", async () => {
    const bad = await fx.dsp("owner", "GET", "/pending?sortBy=price");
    expect(bad.status).toBe(400);
    const ok = await fx.dsp("owner", "GET", "/pending?page=1&pageSize=5");
    expect(ok.status).toBe(200);
    expect(ok.json.meta.pageSize).toBe(5);
    expect(ok.json.meta.page).toBe(1);
  });
});

describe("create a draft (BR-DSP-01..09)", () => {
  test("BR-DSP-01 a confirmed SO gives a draft note with no number", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 100 }] });
    const loc = await fx.mkLoc();
    const r = await fx.draft(
      one(so.soId, so.lineIds[0] as number, 40, { sourceLocationId: loc }),
    );
    expect(r.status).toBe(201);
    expect(r.json.data.status).toBe("draft");
    expect(r.json.data.dnNumber).toBeNull();
    expect(r.json.data.soId).toBe(so.soId);
    expect(r.json.data.lines[0].qty).toBe(40);
  });

  test("BR-DSP-01 an SO that is draft, on hold, closed or cancelled gives 409 DISPATCH_SO_NOT_CONFIRMED", async () => {
    const c = await fx.mkCustomer();
    const draftSo = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 5 }],
      confirm: false,
    });
    const hold = await fx.mkSo({ customerId: c, lines: [{ qty: 5 }] });
    await fx.soOp(hold.soId, "hold");
    const closed = await fx.mkSo({ customerId: c, lines: [{ qty: 5 }] });
    await fx.soOp(closed.soId, "close");
    const cancelled = await fx.mkSo({ customerId: c, lines: [{ qty: 5 }] });
    await fx.soOp(cancelled.soId, "cancel");
    // line ids of a draft SO exist too
    const dLine = (await fx.soDetail(draftSo.soId)).lines[0].id as number;
    const cases: Array<[number, number]> = [
      [draftSo.soId, dLine],
      [hold.soId, hold.lineIds[0] as number],
      [closed.soId, closed.lineIds[0] as number],
      [cancelled.soId, cancelled.lineIds[0] as number],
    ];
    for (const [soId, lineId] of cases) {
      const r = await fx.draft(one(soId, lineId, 1));
      expect(r.status).toBe(409);
      expect(r.json.code).toBe("DISPATCH_SO_NOT_CONFIRMED");
    }
  });

  test("BR-DSP-01 a confirmed SO of an inactive customer can still be dispatched", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 5 }] });
    await db
      .update(customers)
      .set({ isActive: false })
      .where(eq(customers.id, c));
    const r = await fx.draft(one(so.soId, so.lineIds[0] as number, 1));
    expect(r.status).toBe(201);
  });

  test("BR-DSP-01 an unknown soId is 404", async () => {
    const r = await fx.draft(one(999_999_999, 1, 1));
    expect(r.status).toBe(404);
  });

  test("BR-DSP-02 customer and ship-to are copied from the SO, and a body with customer, price or status keys is 400", async () => {
    const c = await fx.mkCustomer({
      address: "Rane Brakes, Chakan",
      gstin: "27ABCDE1234F1Z5",
    });
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 5 }],
      shipTo: { address: "Hosur works", stateCode: "33" },
    });
    const note = await fx.mustDraft(one(so.soId, so.lineIds[0] as number, 1));
    expect(note.customer.id).toBe(c);
    expect(note.customer.address).toBe("Rane Brakes, Chakan");
    expect(note.customer.gstin).toBe("27ABCDE1234F1Z5");
    expect(note.customer.stateCode).toBe("27");
    expect(note.shipTo).toEqual({ address: "Hosur works", stateCode: "33" });
    expect(note.soNumber).toBe(so.soNumber);
    for (const extra of [
      { customer: { name: "x" } },
      { unitPricePaise: 1 },
      { status: "posted" },
    ]) {
      const r = await fx.draft(one(so.soId, so.lineIds[0] as number, 1, extra));
      expect(r.status).toBe(400);
    }
    const edit = await fx.dsp(
      "floor_supervisor",
      "PATCH",
      `/notes/${note.id}`,
      {
        customer: { address: "x" },
      },
    );
    expect(edit.status).toBe(400);
  });

  test("BR-DSP-03 empty lines and qty 0 are 400", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 5 }] });
    expect((await fx.draft({ soId: so.soId, lines: [] })).status).toBe(400);
    const zero = await fx.draft(one(so.soId, so.lineIds[0] as number, 0));
    expect(zero.status).toBe(400);
  });

  test("BR-DSP-03 a line of another SO is 400 DISPATCH_LINE_NOT_ON_SO", async () => {
    const c = await fx.mkCustomer();
    const a = await fx.mkSo({ customerId: c, lines: [{ qty: 5 }] });
    const b = await fx.mkSo({ customerId: c, lines: [{ qty: 5 }] });
    const r = await fx.draft(one(a.soId, b.lineIds[0] as number, 1));
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("DISPATCH_LINE_NOT_ON_SO");
    expect(JSON.stringify(r.json)).not.toContain(b.soNumber);
  });

  test("BR-DSP-03 the same SO line twice on one note is 400", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 50 }] });
    const id = so.lineIds[0] as number;
    const r = await fx.draft({
      soId: so.soId,
      lines: [
        { soLineId: id, qty: 1 },
        { soLineId: id, qty: 2 },
      ],
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("DISPATCH_LINE_NOT_ON_SO");
  });

  test("BR-DSP-03 a soft-removed SO line is 400", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 5 }, { qty: 5 }],
    });
    await fx.soEdit(so.soId, { removeLineIds: [so.lineIds[1]] });
    const r = await fx.draft(one(so.soId, so.lineIds[1] as number, 1));
    expect(r.status).toBe(400);
  });

  test("BR-DSP-03 two lines of the same item with different delivery dates stay two note lines", async () => {
    const c = await fx.mkCustomer();
    const item = await fx.mkItem();
    const so = await fx.mkSo({
      customerId: c,
      lines: [
        { qty: 10, itemId: item, deliveryDate: istDay(20) },
        { qty: 10, itemId: item, deliveryDate: istDay(50) },
      ],
    });
    const r = await fx.draft({
      soId: so.soId,
      lines: so.lineIds.map((id) => ({ soLineId: id, qty: 4 })),
    });
    expect(r.status).toBe(201);
    expect(r.json.data.lines).toHaveLength(2);
  });

  test("BR-DSP-04 qty above the line's open qty is 400, equal to open qty is accepted", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 1000 }] });
    const id = so.lineIds[0] as number;
    const over = await fx.draft(one(so.soId, id, 1001));
    expect(over.status).toBe(400);
    expect(over.json.code).toBe("DISPATCH_OVER_OPEN_QTY");
    expect((await fx.draft(one(so.soId, id, 1000))).status).toBe(201);
  });

  test("BR-DSP-05 pcs need whole numbers, other units take up to 3 decimals", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 100 }, { qty: 100, uom: "kg" }],
    });
    const [pcs, kg] = so.lineIds as number[];
    expect((await fx.draft(one(so.soId, pcs as number, 600.5))).status).toBe(
      400,
    );
    expect((await fx.draft(one(so.soId, kg as number, 2.5))).status).toBe(201);
    expect((await fx.draft(one(so.soId, kg as number, 2.5555))).status).toBe(
      400,
    );
  });

  test("BR-DSP-06 two drafts may each ask for the full open qty", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 1000 }] });
    const id = so.lineIds[0] as number;
    expect((await fx.draft(one(so.soId, id, 1000))).status).toBe(201);
    expect((await fx.draft(one(so.soId, id, 1000))).status).toBe(201);
  });

  test("BR-DSP-07 note date defaults to today (IST), future is 400, before the SO order date is 400, between is accepted", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 100 }],
      orderDate: istDay(-3),
    });
    const id = so.lineIds[0] as number;
    const def = await fx.draft(one(so.soId, id, 1));
    expect(def.json.data.noteDate).toBe(istDay(0));
    expect(
      (await fx.draft(one(so.soId, id, 1, { noteDate: istDay(1) }))).status,
    ).toBe(400);
    expect(
      (await fx.draft(one(so.soId, id, 1, { noteDate: istDay(-4) }))).status,
    ).toBe(400);
    expect(
      (await fx.draft(one(so.soId, id, 1, { noteDate: istDay(-2) }))).status,
    ).toBe(201);
  });

  test("BR-DSP-08 with no location sent the default is the lowest-id active finished_goods location, else the main store", async () => {
    const c = await fx.mkCustomer();
    // a finished_goods location of our own, so the default exists on any DB
    await fx.mkLoc("finished_goods");
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 100 }] });
    const r = await fx.dsp(
      "floor_supervisor",
      "POST",
      "/notes",
      one(so.soId, so.lineIds[0] as number, 1),
    );
    expect(r.status).toBe(201);
    const all = await db.select().from(locations);
    const fg = all
      .filter((l) => l.type === "finished_goods" && l.isActive && !l.isVirtual)
      .sort((a, b) => a.id - b.id)[0];
    const main = all.find((l) => l.type === "main_store" && l.isActive);
    expect(r.json.data.sourceLocation.id).toBe((fg ?? main)?.id as number);
  });

  test("BR-DSP-08 a vendor_premise, virtual or inactive location is 400", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 100 }] });
    const id = so.lineIds[0] as number;
    const vendor = await fx.mkVendorLoc();
    const virt = await fx.mkVirtualLoc();
    const off = await fx.mkLoc();
    await fx.setLocActive(off, false);
    for (const loc of [vendor, virt, off]) {
      const r = await fx.draft(one(so.soId, id, 1, { sourceLocationId: loc }));
      expect(r.status).toBe(400);
    }
  });

  test("BR-DSP-09 a lot number on a line is kept on the note", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 100 }] });
    const r = await fx.draft({
      soId: so.soId,
      lines: [{ soLineId: so.lineIds[0], qty: 5, lotNo: "H-231" }],
    });
    expect(r.status).toBe(201);
    expect(r.json.data.lines[0].lotNo).toBe("H-231");
  });
});

describe("draft value and e-way answer (BR-DSP-19, 23, 43)", () => {
  test("BR-DSP-19 a draft shows the SO's current price, taxable, GST and value to a user with so.view", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 1000, price: 18500, gst: 18 }],
    });
    const note = await fx.mustDraft(
      one(so.soId, so.lineIds[0] as number, 600),
      "back_office",
    );
    expect(note.lines[0].unitPricePaise).toBe(18500);
    expect(note.lines[0].taxablePaise).toBe(11_100_000);
    expect(note.lines[0].gstPaise).toBe(1_998_000);
    expect(note.taxablePaise).toBe(11_100_000);
    expect(note.gstPaise).toBe(1_998_000);
    expect(note.valuePaise).toBe(13_098_000);
    await fx.soPrice(so.soId, so.lineIds[0] as number, 18000);
    const again = await fx.noteDetail(note.id, "back_office");
    expect(again.lines[0].unitPricePaise).toBe(18000);
  });

  test("BR-DSP-43 without so.view price, tax and value are absent but ewayNeeded and ewayLimitPaise are returned", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 1000 }] });
    const note = await fx.mustDraft(
      one(so.soId, so.lineIds[0] as number, 600),
      "floor_supervisor",
    );
    const body = JSON.stringify(note);
    for (const k of [
      "unitPricePaise",
      "gstPercent",
      "taxablePaise",
      "gstPaise",
      "valuePaise",
    ])
      expect(body).not.toContain(k);
    expect(note.ewayNeeded).toBe(true);
    expect(note.ewayLimitPaise).toBe(5_000_000);
    expect(note.lines[0].qty).toBe(600);
  });

  test("BR-DSP-43 sorting the register by value without so.view is 400", async () => {
    const r = await fx.dsp(
      "floor_supervisor",
      "GET",
      "/notes?sortBy=valuePaise",
    );
    expect(r.status).toBe(400);
    const ok = await fx.dsp("back_office", "GET", "/notes?sortBy=valuePaise");
    expect(ok.status).toBe(200);
  });

  test("BR-DSP-43 register rows leave out valuePaise without so.view and carry it with so.view", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 100 }] });
    await fx.mustDraft(one(so.soId, so.lineIds[0] as number, 10));
    const fs = await fx.dsp(
      "floor_supervisor",
      "GET",
      `/notes?soId=${so.soId}`,
    );
    expect(fs.json.data).toHaveLength(1);
    expect("valuePaise" in fs.json.data[0]).toBe(false);
    expect(typeof fs.json.data[0].ewayNeeded).toBe("boolean");
    const bo = await fx.dsp("back_office", "GET", `/notes?soId=${so.soId}`);
    expect(typeof bo.json.data[0].valuePaise).toBe("number");
  });

  const needed = async (o: {
    qty: number;
    price: number;
    gst: number;
    customerState?: string;
    shipTo?: string;
  }) => {
    const c = await fx.mkCustomer({ stateCode: o.customerState ?? "27" });
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: o.qty, price: o.price, gst: o.gst }],
      shipTo: o.shipTo
        ? { address: "Ship-to site", stateCode: o.shipTo }
        : undefined,
    });
    const n = await fx.mustDraft(one(so.soId, so.lineIds[0] as number, o.qty));
    return n.ewayNeeded as boolean;
  };

  test("BR-DSP-23 same-state customer: Rs 1,30,980 needs an e-way bill, Rs 43,660 does not", async () => {
    expect(await needed({ qty: 600, price: 18500, gst: 18 })).toBe(true);
    expect(await needed({ qty: 200, price: 18500, gst: 18 })).toBe(false);
  });

  test("BR-DSP-23 other-state customer below Rs 50,000 does not need one", async () => {
    expect(
      await needed({ qty: 200, price: 18500, gst: 18, customerState: "33" }),
    ).toBe(false);
  });

  test("BR-DSP-23 exactly Rs 50,000 needs an e-way bill", async () => {
    expect(await needed({ qty: 1000, price: 5000, gst: 0 })).toBe(true);
  });

  test("BR-DSP-23 same-state customer with a ship-to in another state uses the ship-to state: Rs 43,660 optional, Rs 60,000 needed even above a Rs 1 lakh intra-state limit", async () => {
    expect(
      await needed({ qty: 200, price: 18500, gst: 18, shipTo: "33" }),
    ).toBe(false);
    await fx.setLimit(10_000_000);
    try {
      expect(
        await needed({ qty: 100, price: 60000, gst: 0, shipTo: "33" }),
      ).toBe(true);
    } finally {
      await fx.setLimit(5_000_000);
    }
  });

  test("BR-DSP-23 with the intra-state limit raised to Rs 1 lakh a same-state Rs 60,000 note is optional", async () => {
    await fx.setLimit(10_000_000);
    try {
      expect(await needed({ qty: 100, price: 60000, gst: 0 })).toBe(false);
    } finally {
      await fx.setLimit(5_000_000);
    }
  });

  test("BR-DSP-23 a price-0 sample is optional", async () => {
    expect(await needed({ qty: 10, price: 0, gst: 0 })).toBe(false);
  });

  test("BR-DSP-40 a draft's e-way answer stays as of its last save until the next save", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 200, price: 18500, gst: 18 }],
    });
    const lineId = so.lineIds[0] as number;
    const n = await fx.mustDraft(one(so.soId, lineId, 200));
    expect(n.ewayNeeded).toBe(false);
    await fx.soPrice(so.soId, lineId, 30000);
    const reg = await fx.dsp("owner", "GET", `/notes?soId=${so.soId}`);
    expect(reg.json.data[0].ewayNeeded).toBe(false);
    expect((await fx.noteDetail(n.id)).ewayNeeded).toBe(false);
    const saved = await fx.dsp("floor_supervisor", "PATCH", `/notes/${n.id}`, {
      remarks: "resave",
    });
    expect(saved.status).toBe(200);
    expect(saved.json.data.ewayNeeded).toBe(true);
  });
});

describe("packages and transport format on a draft (BR-DSP-20, 25)", () => {
  const pkg = (soLineId: number, over: Record<string, unknown> = {}) => ({
    soLineId,
    packageNo: "1",
    qty: 10,
    netKg: 40,
    grossKg: 42,
    ...over,
  });
  async function base() {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 100 }, { qty: 100 }],
    });
    return { so, l1: so.lineIds[0] as number, l2: so.lineIds[1] as number };
  }

  test("BR-DSP-20 a valid package is stored on its line", async () => {
    const { so, l1 } = await base();
    const r = await fx.draft(one(so.soId, l1, 10, { packages: [pkg(l1)] }));
    expect(r.status).toBe(201);
    expect(r.json.data.packages).toHaveLength(1);
    expect(r.json.data.packages[0].packageNo).toBe("1");
    expect(r.json.data.packages[0].soLineId).toBe(l1);
  });

  test("BR-DSP-20 gross below net is 400", async () => {
    const { so, l1 } = await base();
    const r = await fx.draft(
      one(so.soId, l1, 10, { packages: [pkg(l1, { netKg: 42, grossKg: 40 })] }),
    );
    expect(r.status).toBe(400);
  });

  test("BR-DSP-20 net 0 and qty 0 are 400", async () => {
    const { so, l1 } = await base();
    expect(
      (
        await fx.draft(
          one(so.soId, l1, 10, { packages: [pkg(l1, { netKg: 0 })] }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await fx.draft(
          one(so.soId, l1, 10, { packages: [pkg(l1, { qty: 0 })] }),
        )
      ).status,
    ).toBe(400);
  });

  test("BR-DSP-20 the same package number twice on one note is 400", async () => {
    const { so, l1 } = await base();
    const r = await fx.draft(
      one(so.soId, l1, 10, {
        packages: [pkg(l1, { qty: 5 }), pkg(l1, { qty: 5 })],
      }),
    );
    expect(r.status).toBe(400);
  });

  test("BR-DSP-20 a package for a line that is not on the note is 400 DISPATCH_LINE_NOT_ON_SO", async () => {
    const { so, l1, l2 } = await base();
    const r = await fx.draft(one(so.soId, l1, 10, { packages: [pkg(l2)] }));
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("DISPATCH_LINE_NOT_ON_SO");
  });

  test("BR-DSP-20 an edit that drops a line while a package still names it is 400", async () => {
    const { so, l1, l2 } = await base();
    const n = await fx.mustDraft({
      soId: so.soId,
      lines: [
        { soLineId: l1, qty: 10 },
        { soLineId: l2, qty: 10 },
      ],
      packages: [pkg(l2)],
    });
    const r = await fx.dsp("floor_supervisor", "PATCH", `/notes/${n.id}`, {
      lines: [{ soLineId: l1, qty: 10 }],
      packages: [pkg(l2)],
    });
    expect(r.status).toBe(400);
  });

  test("BR-DSP-25 'mh 12 ab 1234' is saved as MH12AB1234", async () => {
    const { so, l1 } = await base();
    const r = await fx.draft(
      one(so.soId, l1, 1, {
        transport: { mode: "road", vehicleNo: "mh 12 ab 1234" },
      }),
    );
    expect(r.status).toBe(201);
    expect(r.json.data.transport.vehicleNo).toBe("MH12AB1234");
  });

  test("BR-DSP-25 bad vehicle, transporter id, e-way number length and e-way dates are 400", async () => {
    const { so, l1 } = await base();
    const bad: Array<Record<string, unknown>> = [
      { vehicleNo: "MH12" },
      { transporterId: "NOTAGSTIN" },
      { ewayBillNo: "12345678901", ewayBillDate: istDay(0) },
      { ewayBillNo: "123456789012", ewayBillDate: istDay(1) },
      { ewayBillNo: "123456789012", ewayBillDate: istDay(-1) },
    ];
    for (const transport of bad) {
      const r = await fx.draft(one(so.soId, l1, 1, { transport }));
      expect(r.status).toBe(400);
    }
  });

  test("BR-DSP-25 an unknown transport mode and a distance outside 1..4000 are 400", async () => {
    const { so, l1 } = await base();
    for (const transport of [
      { mode: "boat" },
      { distanceKm: 0 },
      { distanceKm: 4001 },
    ]) {
      const r = await fx.draft(one(so.soId, l1, 1, { transport }));
      expect(r.status).toBe(400);
    }
  });

  test("BR-DSP-26 an e-way number already on another live note is 409 DISPATCH_EWAY_REUSED", async () => {
    const { so, l1 } = await base();
    const no = fx.ewayNo();
    const t = {
      mode: "road",
      vehicleNo: "MH12AB1234",
      ewayBillNo: no,
      ewayBillDate: istDay(0),
    };
    expect((await fx.draft(one(so.soId, l1, 1, { transport: t }))).status).toBe(
      201,
    );
    const r = await fx.draft(one(so.soId, l1, 1, { transport: t }));
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DISPATCH_EWAY_REUSED");
  });

  test("BR-DSP-26 a cancelled draft frees its e-way number", async () => {
    const { so, l1 } = await base();
    const no = fx.ewayNo();
    const t = {
      mode: "road",
      vehicleNo: "MH12AB1234",
      ewayBillNo: no,
      ewayBillDate: istDay(0),
    };
    const a = await fx.mustDraft(one(so.soId, l1, 1, { transport: t }));
    expect((await fx.cancelDraft(a.id)).status).toBe(200);
    expect((await fx.draft(one(so.soId, l1, 1, { transport: t }))).status).toBe(
      201,
    );
  });
});

describe("edit a draft (BR-DSP-03..09, 22, 36)", () => {
  async function mk() {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 100 }, { qty: 100 }],
    });
    const l1 = so.lineIds[0] as number;
    const l2 = so.lineIds[1] as number;
    const n = await fx.mustDraft(one(so.soId, l1, 10));
    return { so, l1, l2, n };
  }
  const edit = (
    id: number,
    body: Record<string, unknown>,
    role: "floor_supervisor" | "owner" = "floor_supervisor",
  ) => fx.dsp(role, "PATCH", `/notes/${id}`, body);

  test("BR-DSP-03 lines sent in an edit replace the whole list", async () => {
    const { l1, l2, n } = await mk();
    const r = await edit(n.id, { lines: [{ soLineId: l2, qty: 7 }] });
    expect(r.status).toBe(200);
    expect(r.json.data.lines).toHaveLength(1);
    expect(r.json.data.lines[0].soLineId).toBe(l2);
    expect(r.json.data.lines[0].qty).toBe(7);
    expect(l1).not.toBe(l2);
  });

  test("BR-DSP-03 an edit with a line of another SO is 400", async () => {
    const { n } = await mk();
    const c = await fx.mkCustomer();
    const other = await fx.mkSo({ customerId: c, lines: [{ qty: 5 }] });
    const r = await edit(n.id, {
      lines: [{ soLineId: other.lineIds[0], qty: 1 }],
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("DISPATCH_LINE_NOT_ON_SO");
  });

  test("BR-DSP-04 an edit above open qty is 400", async () => {
    const { l1, n } = await mk();
    const r = await edit(n.id, { lines: [{ soLineId: l1, qty: 101 }] });
    expect(r.status).toBe(400);
  });

  test("BR-DSP-07 an edit to a future note date is 400", async () => {
    const { n } = await mk();
    expect((await edit(n.id, { noteDate: istDay(1) })).status).toBe(400);
  });

  test("BR-DSP-08 an edit to a vendor location is 400", async () => {
    const { n } = await mk();
    const v = await fx.mkVendorLoc();
    expect((await edit(n.id, { sourceLocationId: v })).status).toBe(400);
  });

  test("BR-DSP-36 an edit with no key or an unknown key is 400", async () => {
    const { n } = await mk();
    expect((await edit(n.id, {})).status).toBe(400);
    expect((await edit(n.id, { dnNumber: "DN/26-27/1" })).status).toBe(400);
  });

  test("BR-DSP-36 create and edit each leave an audit row (dispatch.create, dispatch.edit)", async () => {
    const { n } = await mk();
    await edit(n.id, { remarks: "changed" });
    const d = await fx.noteDetail(n.id);
    const actions = d.activity.map((a: { action: string }) => a.action);
    expect(actions).toContain("dispatch.create");
    expect(actions).toContain("dispatch.edit");
  });

  test("BR-DSP-22 an edit of a missing note is 404", async () => {
    expect((await edit(999_999_999, { remarks: "x" })).status).toBe(404);
  });

  test("BR-DSP-36 the dispatch.edit audit row carries before and after of the changed header field and no prices", async () => {
    const { so, n } = await mk();
    expect((await edit(n.id, { remarks: "first" })).status).toBe(200);
    expect((await edit(n.id, { remarks: "second" })).status).toBe(200);
    const rows = (
      await db
        .select()
        .from(salesAuditLog)
        .where(eq(salesAuditLog.soId, so.soId))
    ).filter((r) => r.action === "dispatch.edit");
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const last = rows[rows.length - 1];
    // biome-ignore lint/suspicious/noExplicitAny: jsonb columns
    const before = last?.before as any;
    // biome-ignore lint/suspicious/noExplicitAny: jsonb columns
    const after = last?.after as any;
    expect(before?.remarks).toBe("first");
    expect(after?.remarks).toBe("second");
    for (const row of rows) {
      expect(JSON.stringify([row.before, row.after])).not.toMatch(
        /price|taxable|gst|valuePaise|totalPaise/i,
      );
    }
  });
});

describe("draft of an SO that is no longer confirmed (BR-DSP-11)", () => {
  for (const op of ["hold", "close", "cancel"] as const) {
    test(`BR-DSP-11 a draft of an SO after ${op} cannot be edited (409 DISPATCH_SO_NOT_CONFIRMED) but can be cancelled`, async () => {
      const s = await fx.scenario();
      await fx.soOp(s.so.soId, op);
      const e = await fx.dsp(
        "floor_supervisor",
        "PATCH",
        `/notes/${s.note.id}`,
        {
          remarks: "late change",
        },
      );
      expect(e.status).toBe(409);
      expect(e.json.code).toBe("DISPATCH_SO_NOT_CONFIRMED");
      const c = await fx.cancelDraft(s.note.id, "order stopped");
      expect(c.status).toBe(200);
      expect(c.json.data.status).toBe("cancelled");
    });
  }
});

describe("cancel a draft (BR-DSP-29, 33, 36)", () => {
  test("BR-DSP-29 a draft is cancelled with a reason, posts nothing and takes no number", async () => {
    const s = await fx.scenario();
    const r = await fx.cancelDraft(s.note.id, "truck did not come");
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("cancelled");
    expect(r.json.data.dnNumber).toBeNull();
    expect(r.json.data.cancelReason).toBe("truck did not come");
    expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(0);
    expect((await fx.soDetail(s.so.soId)).lines[0].deliveredQty).toBe(0);
  });

  test("BR-DSP-29 a reason of 1 or 501 characters is 400, a missing reason is 400", async () => {
    const s = await fx.scenario();
    expect((await fx.cancelDraft(s.note.id, "x")).status).toBe(400);
    expect((await fx.cancelDraft(s.note.id, "x".repeat(501))).status).toBe(400);
    expect(
      (
        await fx.dsp(
          "floor_supervisor",
          "POST",
          `/notes/${s.note.id}/cancel-draft`,
          {},
        )
      ).status,
    ).toBe(400);
  });

  test("BR-DSP-33 cancelling a cancelled draft again is 409 DISPATCH_NOTE_STATUS", async () => {
    const s = await fx.scenario();
    await fx.cancelDraft(s.note.id);
    const r = await fx.cancelDraft(s.note.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DISPATCH_NOTE_STATUS");
  });

  test("BR-DSP-29 a cancelled draft can no longer be posted or edited (409)", async () => {
    const s = await fx.scenario();
    await fx.cancelDraft(s.note.id);
    expect((await fx.post(s.note.id)).status).toBe(409);
    const e = await fx.dsp("floor_supervisor", "PATCH", `/notes/${s.note.id}`, {
      remarks: "x",
    });
    expect(e.status).toBe(409);
  });

  test("BR-DSP-36 cancelling a draft writes an audit row dispatch.cancel with the reason", async () => {
    const s = await fx.scenario();
    await fx.cancelDraft(s.note.id, "truck did not come");
    const d = await fx.noteDetail(s.note.id);
    const row = d.activity.find(
      (a: { action: string }) => a.action === "dispatch.cancel",
    );
    expect(row).toBeDefined();
    expect(row.reason).toBe("truck did not come");
  });
});

describe("register (BR-DSP-40)", () => {
  test("BR-DSP-40 filters by SO, customer, status and date range, and returns customer options", async () => {
    const c = await fx.mkCustomer();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 100 }] });
    const id = so.lineIds[0] as number;
    const a = await fx.mustDraft(one(so.soId, id, 5));
    const b = await fx.mustDraft(one(so.soId, id, 6));
    await fx.cancelDraft(b.id);
    const all = await fx.dsp("owner", "GET", `/notes?customerId=${c}`);
    expect(all.json.data.map((r: { id: number }) => r.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    expect(
      all.json.meta.customers.some((x: { id: number }) => x.id === c),
    ).toBe(true);
    const draftOnly = await fx.dsp(
      "owner",
      "GET",
      `/notes?customerId=${c}&status=draft`,
    );
    expect(draftOnly.json.data.map((r: { id: number }) => r.id)).toEqual([
      a.id,
    ]);
    const today = istDay(0);
    const inRange = await fx.dsp(
      "owner",
      "GET",
      `/notes?customerId=${c}&dateFrom=${today}&dateTo=${today}`,
    );
    expect(inRange.json.data).toHaveLength(2);
    const past = await fx.dsp(
      "owner",
      "GET",
      `/notes?customerId=${c}&dateTo=${istDay(-5)}`,
    );
    expect(past.json.data).toHaveLength(0);
  });

  test("BR-DSP-40 dateFrom after dateTo and an unknown status are 400", async () => {
    expect(
      (
        await fx.dsp(
          "owner",
          "GET",
          `/notes?dateFrom=${istDay(0)}&dateTo=${istDay(-3)}`,
        )
      ).status,
    ).toBe(400);
    expect((await fx.dsp("owner", "GET", "/notes?status=weird")).status).toBe(
      400,
    );
  });

  test("BR-DSP-40 'e-way needed but missing' lists only drafts that need one and have no e-way number", async () => {
    const c = await fx.mkCustomer();
    const big = await fx.mkSo({ customerId: c, lines: [{ qty: 600 }] });
    const small = await fx.mkSo({ customerId: c, lines: [{ qty: 10 }] });
    const bigNote = await fx.mustDraft(
      one(big.soId, big.lineIds[0] as number, 600),
    );
    const smallNote = await fx.mustDraft(
      one(small.soId, small.lineIds[0] as number, 10),
    );
    const ok = await fx.mustDraft(
      one(big.soId, big.lineIds[0] as number, 600, {
        transport: fx.roadTransport(),
      }),
    );
    const r = await fx.dsp(
      "owner",
      "GET",
      `/notes?customerId=${c}&ewayMissing=true`,
    );
    const ids = r.json.data.map((x: { id: number }) => x.id);
    expect(ids).toContain(bigNote.id);
    expect(ids).not.toContain(smallNote.id);
    expect(ids).not.toContain(ok.id);
  });

  test("BR-DSP-40 an invalid sortBy is 400", async () => {
    expect(
      (await fx.dsp("owner", "GET", "/notes?sortBy=nonsense")).status,
    ).toBe(400);
  });
});

describe("no delete (BR-DSP-34)", () => {
  test("BR-DSP-34 DELETE on a note is 404 and the note is unchanged", async () => {
    const s = await fx.scenario();
    const r = await fx.dsp("owner", "DELETE", `/notes/${s.note.id}`);
    expect(r.status).toBe(404);
    expect((await fx.noteDetail(s.note.id)).status).toBe("draft");
  });
});

describe("access per route (BR-DSP-35)", () => {
  type Row = [string, string, unknown, string[]];
  // [method, path, body, roles that must get 403]
  const rows = (id: number): Row[] => [
    ["GET", "/pending", undefined, ["qa_inspector", "operator"]],
    ["GET", "/settings", undefined, ["qa_inspector", "operator"]],
    ["GET", "/notes", undefined, ["qa_inspector", "operator"]],
    ["GET", `/notes/${id}`, undefined, ["qa_inspector", "operator"]],
    [
      "GET",
      `/notes/${id}/transport-history`,
      undefined,
      ["qa_inspector", "operator"],
    ],
    [
      "POST",
      "/notes",
      { soId: 999999999, lines: [{ soLineId: 1, qty: 1 }] },
      ["qa_inspector", "operator"],
    ],
    ["PATCH", `/notes/${id}`, { remarks: "x" }, ["qa_inspector", "operator"]],
    ["POST", `/notes/${id}/post`, {}, ["qa_inspector", "operator"]],
    [
      "POST",
      `/notes/${id}/cancel-draft`,
      { reason: "valid reason" },
      ["qa_inspector", "operator"],
    ],
    [
      "PATCH",
      `/notes/${id}/transport`,
      { vehicleNo: "MH12AB1234" },
      ["qa_inspector", "operator"],
    ],
    [
      "POST",
      `/notes/${id}/cancel`,
      { reason: "valid reason" },
      ["back_office", "floor_supervisor", "qa_inspector"],
    ],
  ];

  test("BR-DSP-35 every route answers 401 without a token", async () => {
    for (const [m, p, b] of rows(999_999_999)) {
      const r = await fx.dsp(null, m, p, b);
      expect(r.status).toBe(401);
    }
  });

  test("BR-DSP-35 roles without the key get 403 PERMISSION_DENIED on every route", async () => {
    for (const [m, p, b, forbidden] of rows(999_999_999)) {
      for (const role of forbidden) {
        const r = await fx.dsp(role as "qa_inspector", m, p, b);
        expect(r.status).toBe(403);
        expect(r.json.code).toBe("PERMISSION_DENIED");
      }
    }
  });

  test("BR-DSP-35 owner, back_office and floor_supervisor pass the permission check on view and manage routes", async () => {
    for (const [m, p, b, forbidden] of rows(999_999_999)) {
      if (forbidden.includes("back_office")) continue;
      for (const role of [
        "owner",
        "back_office",
        "floor_supervisor",
      ] as const) {
        const r = await fx.dsp(role, m, p, b);
        expect(r.status).not.toBe(401);
        expect(r.status).not.toBe(403);
      }
    }
  });

  test("BR-DSP-35 owner passes the permission check on cancel of a posted note (404 for a missing id)", async () => {
    const r = await fx.cancelPosted(999_999_999);
    expect(r.status).toBe(404);
  });

  test("BR-DSP-35 a denied post changes nothing", async () => {
    const s = await fx.scenario();
    const r = await fx.post(s.note.id, "qa_inspector");
    expect(r.status).toBe(403);
    expect((await fx.noteDetail(s.note.id)).status).toBe("draft");
  });

  test("BR-DSP-35 floor_supervisor can create and post (no so.view needed)", async () => {
    const s = await fx.scenario({ qty: 10 });
    const r = await fx.post(s.note.id, "floor_supervisor");
    expect(r.status).toBe(200);
  });
});
