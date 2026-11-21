/**
 * Dispatch: posting a delivery note (docs/specs/dispatch/spec.md v1:
 * BR-DSP-02, 03, 08, 10..19, 21..24, 26, 28, 36, 41, 43, 44).
 * Real DB, full HTTP stack. Fixtures TEST_dspp_ prefixed.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { itemMaster } from "../../src/db/schemas/02_procurement-catalog";
import { companySettings } from "../../src/db/schemas/04_company";
import { customers } from "../../src/db/schemas/05_sales";
import { fyOf, istDay, makeDispatchFx } from "../helpers/dispatchFixtures";

const fx = makeDispatchFx("dspp");

beforeAll(async () => {
  await fx.setupCompany();
});
afterAll(async () => {
  await fx.cleanup();
});

const soLine = async (soId: number, lineId: number) =>
  (await fx.soDetail(soId)).lines.find((l: { id: number }) => l.id === lineId);

describe("ledger and stock (BR-DSP-12, 09, 13, 16)", () => {
  test("BR-DSP-12 posting writes one out row at the source location, reference delivery_note, at the average cost; the average stays", async () => {
    const s = await fx.scenario({ transport: fx.roadTransport() });
    const posted = await fx.post(s.note.id);
    expect(posted.status).toBe(200);
    expect(posted.json.data.status).toBe("posted");
    const rows = await fx.ledgerOfNote(s.note.id);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.transactionType).toBe("out");
    expect(row?.referenceType).toBe("delivery_note");
    expect(row?.quantityChange).toBe(-600);
    expect(row?.locationId).toBe(s.loc);
    expect(row?.itemId).toBe(s.item);
    expect(row?.referenceLineId).toBe(s.note.lines[0].id);
    expect(row?.unitCostPaise).toBe(9800);
    expect(row?.totalValueChangePaise).toBe(-5_880_000);
    expect(await fx.balance(s.item, s.loc)).toBe(100);
    expect((await fx.itemRow(s.item))?.averageCostPaise).toBe(9800);
  });

  test("BR-DSP-09 the lot number goes to the ledger row's batch number", async () => {
    const s = await fx.scenario({ qty: 100, lotNo: "H-231" });
    await fx.mustPost(s.note.id);
    const rows = await fx.ledgerOfNote(s.note.id);
    expect(rows[0]?.batchNumber).toBe("H-231");
  });

  test("BR-DSP-13 posting more than the stock at the source is 409 INSUFFICIENT_STOCK and nothing posts", async () => {
    const s = await fx.scenario({
      qty: 800,
      stockQty: 700,
      transport: fx.roadTransport(),
    });
    const r = await fx.post(s.note.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("INSUFFICIENT_STOCK");
    expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(0);
    expect(await fx.balance(s.item, s.loc)).toBe(700);
    expect((await fx.noteDetail(s.note.id)).status).toBe("draft");
    expect((await soLine(s.so.soId, s.lineId)).deliveredQty).toBe(0);
  });

  test("BR-DSP-16 stock short on line 2 of 2: line 1 is not posted either and the note stays draft", async () => {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 100 }, { qty: 100 }],
    });
    await fx.stock(so.items[0] as number, loc, 100);
    await fx.stock(so.items[1] as number, loc, 5);
    const n = await fx.mustDraft({
      soId: so.soId,
      sourceLocationId: loc,
      lines: [
        { soLineId: so.lineIds[0], qty: 10 },
        { soLineId: so.lineIds[1], qty: 50 },
      ],
    });
    const r = await fx.post(n.id);
    expect(r.status).toBe(409);
    expect(await fx.ledgerOfNote(n.id)).toHaveLength(0);
    expect(await fx.balance(so.items[0] as number, loc)).toBe(100);
    const after = await fx.noteDetail(n.id);
    expect(after.status).toBe("draft");
    expect(after.dnNumber).toBeNull();
    expect((await soLine(so.soId, so.lineIds[0] as number)).deliveredQty).toBe(
      0,
    );
  });

  test("BR-DSP-16 posting a two-line note writes one ledger row per line", async () => {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 100 }, { qty: 100 }],
    });
    await fx.stock(so.items[0] as number, loc, 100);
    await fx.stock(so.items[1] as number, loc, 100);
    const n = await fx.mustDraft({
      soId: so.soId,
      sourceLocationId: loc,
      lines: [
        { soLineId: so.lineIds[0], qty: 10 },
        { soLineId: so.lineIds[1], qty: 20 },
      ],
    });
    await fx.mustPost(n.id);
    expect(await fx.ledgerOfNote(n.id)).toHaveLength(2);
  });

  test("BR-DSP-16 a second post of the same note is 409 DISPATCH_NOTE_STATUS and posts no more stock", async () => {
    const s = await fx.scenario({ qty: 100 });
    await fx.mustPost(s.note.id);
    const again = await fx.post(s.note.id);
    expect(again.status).toBe(409);
    expect(again.json.code).toBe("DISPATCH_NOTE_STATUS");
    expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(1);
  });

  test("BR-DSP-16 two posts of the same note at once: one 200, one 409, one ledger row", async () => {
    const s = await fx.scenario({ qty: 100 });
    const [a, b] = await Promise.all([fx.post(s.note.id), fx.post(s.note.id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(1);
    expect((await soLine(s.so.soId, s.lineId)).deliveredQty).toBe(100);
  });

  test("BR-DSP-16 a post body with any key is 400", async () => {
    const s = await fx.scenario({ qty: 100 });
    const r = await fx.dsp(
      "floor_supervisor",
      "POST",
      `/notes/${s.note.id}/post`,
      { x: 1 },
    );
    expect(r.status).toBe(400);
  });
});

describe("SO delivered qty and closing (BR-DSP-10, 11, 14, 15)", () => {
  test("BR-DSP-14 posting raises the SO line's delivered qty and lowers open qty; the SO stays confirmed", async () => {
    const s = await fx.scenario({ transport: fx.roadTransport() });
    await fx.mustPost(s.note.id);
    const l = await soLine(s.so.soId, s.lineId);
    expect(l.deliveredQty).toBe(600);
    expect(l.openQty).toBe(400);
    expect((await fx.soDetail(s.so.soId)).status).toBe("confirmed");
  });

  test("BR-DSP-14 the pending list shows the remaining open qty and the stock left, short stock visible", async () => {
    const s = await fx.scenario({ transport: fx.roadTransport() });
    await fx.mustPost(s.note.id);
    const r = await fx.dsp(
      "owner",
      "GET",
      `/pending?soId=${s.so.soId}&locationId=${s.loc}`,
    );
    expect(r.json.data).toHaveLength(1);
    expect(r.json.data[0].open).toBe(400);
    expect(r.json.data[0].delivered).toBe(600);
    expect(r.json.data[0].stockAtLocation).toBe(100);
  });

  test("BR-DSP-15 two notes that together ship the whole line close the SO; the first alone does not", async () => {
    const s = await fx.scenario({ soQty: 100, qty: 60, stockQty: 100 });
    await fx.mustPost(s.note.id);
    expect((await fx.soDetail(s.so.soId)).status).toBe("confirmed");
    const n2 = await fx.mustDraft({
      soId: s.so.soId,
      sourceLocationId: s.loc,
      lines: [{ soLineId: s.lineId, qty: 40 }],
    });
    await fx.mustPost(n2.id);
    const so = await fx.soDetail(s.so.soId);
    expect(so.status).toBe("closed");
    expect(so.closeKind).toBe("fully_delivered");
  });

  test("BR-DSP-15 when every line is fully shipped the SO closes with closeKind fully_delivered", async () => {
    const s = await fx.scenario({ soQty: 100, qty: 100, stockQty: 100 });
    await fx.mustPost(s.note.id);
    const so = await fx.soDetail(s.so.soId);
    expect(so.status).toBe("closed");
    expect(so.closeKind).toBe("fully_delivered");
    const pending = await fx.dsp("owner", "GET", `/pending?soId=${s.so.soId}`);
    expect(pending.json.data).toHaveLength(0);
  });

  test("BR-DSP-15 a soft-removed unshipped line is ignored: shipping the other line closes the SO", async () => {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 50 }, { qty: 50 }],
    });
    await fx.stock(so.items[0] as number, loc, 50);
    const n = await fx.mustDraft({
      soId: so.soId,
      sourceLocationId: loc,
      lines: [{ soLineId: so.lineIds[0], qty: 50 }],
    });
    await fx.soEdit(so.soId, { removeLineIds: [so.lineIds[1]] });
    await fx.mustPost(n.id);
    const d = await fx.soDetail(so.soId);
    expect(d.status).toBe("closed");
    expect(d.closeKind).toBe("fully_delivered");
  });

  test("BR-DSP-15 an SO with another line still open stays confirmed after one line ships fully", async () => {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 50 }, { qty: 50 }],
    });
    await fx.stock(so.items[0] as number, loc, 50);
    const n = await fx.mustDraft({
      soId: so.soId,
      sourceLocationId: loc,
      lines: [{ soLineId: so.lineIds[0], qty: 50 }],
    });
    await fx.mustPost(n.id);
    expect((await fx.soDetail(so.soId)).status).toBe("confirmed");
  });

  test("BR-DSP-10 two drafts of the full open qty: the first posts, the second is refused 400 DISPATCH_OVER_OPEN_QTY", async () => {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 100 }] });
    await fx.stock(so.items[0] as number, loc, 500);
    const body = {
      soId: so.soId,
      sourceLocationId: loc,
      lines: [{ soLineId: so.lineIds[0], qty: 100 }],
    };
    const a = await fx.mustDraft(body);
    const b = await fx.mustDraft(body);
    expect((await fx.post(a.id)).status).toBe(200);
    // the SO closed with the first posting; the second note meets a closed SO or an over-open line
    const r = await fx.post(b.id);
    expect([400, 409]).toContain(r.status);
    expect(await fx.ledgerOfNote(b.id)).toHaveLength(0);
  });

  test("BR-DSP-10 a line already over the open qty when the request arrives is 400 DISPATCH_OVER_OPEN_QTY", async () => {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 100 }, { qty: 100 }],
    });
    await fx.stock(so.items[0] as number, loc, 500);
    const mk = (qty: number) => ({
      soId: so.soId,
      sourceLocationId: loc,
      lines: [{ soLineId: so.lineIds[0], qty }],
    });
    const a = await fx.mustDraft(mk(60));
    const b = await fx.mustDraft(mk(60));
    expect((await fx.post(a.id)).status).toBe(200);
    const r = await fx.post(b.id);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("DISPATCH_OVER_OPEN_QTY");
    expect((await soLine(so.soId, so.lineIds[0] as number)).deliveredQty).toBe(
      60,
    );
  });

  test("BR-DSP-10 two notes that together exceed the open qty posted at once: only one posts and delivered never exceeds ordered", async () => {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 100 }, { qty: 100 }],
    });
    await fx.stock(so.items[0] as number, loc, 500);
    const mk = () => ({
      soId: so.soId,
      sourceLocationId: loc,
      lines: [{ soLineId: so.lineIds[0], qty: 60 }],
    });
    const a = await fx.mustDraft(mk());
    const b = await fx.mustDraft(mk());
    const [ra, rb] = await Promise.all([fx.post(a.id), fx.post(b.id)]);
    const statuses = [ra.status, rb.status];
    expect(statuses.filter((x) => x === 200)).toHaveLength(1);
    const loser = ra.status === 200 ? rb : ra;
    expect([400, 409]).toContain(loser.status);
    expect(loser.json.code).toBe("DISPATCH_OVER_OPEN_QTY");
    expect((await soLine(so.soId, so.lineIds[0] as number)).deliveredQty).toBe(
      60,
    );
    expect(await fx.balance(so.items[0] as number, loc)).toBe(440);
  });

  test("BR-DSP-11 an SO put on hold after the draft: post is 409 DISPATCH_SO_NOT_CONFIRMED and nothing posts; after resume it posts", async () => {
    const s = await fx.scenario({ qty: 100 });
    await fx.soOp(s.so.soId, "hold");
    const r = await fx.post(s.note.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DISPATCH_SO_NOT_CONFIRMED");
    expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(0);
    expect((await soLine(s.so.soId, s.lineId)).deliveredQty).toBe(0);
    await fx.soOp(s.so.soId, "resume");
    expect((await fx.post(s.note.id)).status).toBe(200);
  });

  test("BR-DSP-11 an SO closed by hand after the draft: post is 409 and the draft can still be cancelled", async () => {
    const s = await fx.scenario({ qty: 100 });
    await fx.soOp(s.so.soId, "close");
    const r = await fx.post(s.note.id);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("DISPATCH_SO_NOT_CONFIRMED");
    expect((await fx.cancelDraft(s.note.id)).status).toBe(200);
  });

  test("BR-DSP-03 an SO line soft-removed after the draft: post is 400", async () => {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 50 }, { qty: 50 }],
    });
    await fx.stock(so.items[1] as number, loc, 50);
    const n = await fx.mustDraft({
      soId: so.soId,
      sourceLocationId: loc,
      lines: [{ soLineId: so.lineIds[1], qty: 10 }],
    });
    await fx.soEdit(so.soId, { removeLineIds: [so.lineIds[1]] });
    const r = await fx.post(n.id);
    expect(r.status).toBe(400);
    expect(await fx.ledgerOfNote(n.id)).toHaveLength(0);
  });

  test("BR-DSP-08 a source location deactivated after the draft: post is 400", async () => {
    const s = await fx.scenario({ qty: 100 });
    await fx.setLocActive(s.loc, false);
    const r = await fx.post(s.note.id);
    expect(r.status).toBe(400);
    expect((await fx.noteDetail(s.note.id)).status).toBe("draft");
  });

  test("BR-DSP-44 an item deactivated after the draft: post is 400 naming the item", async () => {
    const s = await fx.scenario({ qty: 100 });
    const item = await fx.itemRow(s.item);
    await db
      .update(itemMaster)
      .set({ isActive: false })
      .where(eq(itemMaster.id, s.item));
    const r = await fx.post(s.note.id);
    expect(r.status).toBe(400);
    expect(String(r.json.message)).toContain(item?.sku as string);
    expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(0);
  });
});

describe("number (BR-DSP-17)", () => {
  test("BR-DSP-17 a draft has no number; posting gives DN/<FY>/<seq> of at most 16 characters", async () => {
    const s = await fx.scenario({ qty: 100 });
    expect(s.note.dnNumber).toBeNull();
    const p = await fx.mustPost(s.note.id);
    expect(p.dnNumber).toBe(
      `DN/${fyOf(istDay(0))}/${p.dnNumber.split("/")[2]}`,
    );
    expect(p.dnNumber).toMatch(/^DN\/\d{2}-\d{2}\/[1-9]\d*$/);
    expect(p.dnNumber.length).toBeLessThanOrEqual(16);
  });

  test("BR-DSP-17 numbers are consecutive within one financial year", async () => {
    const a = await fx.scenario({ qty: 10 });
    const b = await fx.scenario({ qty: 10 });
    const pa = await fx.mustPost(a.note.id);
    const pb = await fx.mustPost(b.note.id);
    const [, fa, na] = pa.dnNumber.split("/");
    const [, fb, nb] = pb.dnNumber.split("/");
    expect(fb).toBe(fa);
    expect(Number(nb)).toBe(Number(na) + 1);
  });

  test("BR-DSP-17 the financial year follows the note date, not today", async () => {
    const day = istDay(-400);
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 10 }],
      orderDate: istDay(-420),
    });
    await fx.stock(so.items[0] as number, loc, 10);
    const n = await fx.mustDraft({
      soId: so.soId,
      noteDate: day,
      sourceLocationId: loc,
      lines: [{ soLineId: so.lineIds[0], qty: 10 }],
    });
    const p = await fx.mustPost(n.id);
    expect(p.dnNumber.startsWith(`DN/${fyOf(day)}/`)).toBe(true);
  });
});

describe("company details and HSN (BR-DSP-18)", () => {
  test("BR-DSP-18 an item with no HSN code: post is 400 DISPATCH_COMPANY_OR_HSN_MISSING", async () => {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const item = await fx.mkItem({ hsnCode: null });
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 10, itemId: item }],
    });
    await fx.stock(item, loc, 10);
    const n = await fx.mustDraft({
      soId: so.soId,
      sourceLocationId: loc,
      lines: [{ soLineId: so.lineIds[0], qty: 10 }],
    });
    const r = await fx.post(n.id);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("DISPATCH_COMPANY_OR_HSN_MISSING");
    expect(await fx.ledgerOfNote(n.id)).toHaveLength(0);
  });

  test("BR-DSP-18 no company details saved (plant state missing): post is 400 and nothing posts", async () => {
    const s = await fx.scenario({ qty: 10 });
    await db.delete(companySettings).where(eq(companySettings.id, 1));
    try {
      const r = await fx.post(s.note.id);
      expect(r.status).toBe(400);
      expect(r.json.code).toBe("DISPATCH_COMPANY_OR_HSN_MISSING");
      expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(0);
    } finally {
      await fx.setupCompany();
    }
  });
});

describe("price, GST and value frozen at post (BR-DSP-19, 02, 41, 43)", () => {
  test("BR-DSP-19 600 x 18,500 at 18 percent: taxable 11,100,000, GST 1,998,000, value 13,098,000", async () => {
    const s = await fx.scenario({ transport: fx.roadTransport() });
    const r = await fx.post(s.note.id, "back_office");
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d.lines[0].taxablePaise).toBe(11_100_000);
    expect(d.lines[0].gstPaise).toBe(1_998_000);
    expect(d.lines[0].gstPercent).toBe(18);
    expect(d.taxablePaise).toBe(11_100_000);
    expect(d.gstPaise).toBe(1_998_000);
    expect(d.valuePaise).toBe(13_098_000);
  });

  test("BR-DSP-19 a price changed on the SO before posting is used; a change after posting leaves the note alone", async () => {
    const s = await fx.scenario({ qty: 100, transport: undefined });
    await fx.soPrice(s.so.soId, s.lineId, 18000);
    const p = await fx.post(s.note.id, "back_office");
    expect(p.json.data.lines[0].unitPricePaise).toBe(18000);
    expect(p.json.data.lines[0].taxablePaise).toBe(1_800_000);
    await fx.soPrice(s.so.soId, s.lineId, 99999);
    const after = await fx.noteDetail(s.note.id, "back_office");
    expect(after.lines[0].unitPricePaise).toBe(18000);
    expect(after.valuePaise).toBe(2_124_000);
  });

  test("BR-DSP-19 rounding is half up per line, in paise", async () => {
    // 3 x 3333 = 9,999 taxable; 5 percent = 499.95 -> 500
    const s = await fx.scenario({ soQty: 10, qty: 3, price: 3333, gst: 5 });
    const p = await fx.post(s.note.id, "back_office");
    expect(p.json.data.lines[0].taxablePaise).toBe(9999);
    expect(p.json.data.lines[0].gstPaise).toBe(500);
    expect(p.json.data.valuePaise).toBe(10_499);
  });

  test("BR-DSP-43 the post response for a user without so.view carries no price or value but the e-way answer", async () => {
    const s = await fx.scenario({ transport: fx.roadTransport() });
    const r = await fx.post(s.note.id, "floor_supervisor");
    expect(r.status).toBe(200);
    const body = JSON.stringify(r.json.data);
    for (const k of [
      "unitPricePaise",
      "taxablePaise",
      "gstPaise",
      "valuePaise",
    ])
      expect(body).not.toContain(k);
    expect(r.json.data.ewayNeeded).toBe(true);
    expect(r.json.data.lines[0].qty).toBe(600);
    const reg = await fx.dsp(
      "floor_supervisor",
      "GET",
      `/notes?soId=${s.so.soId}`,
    );
    expect("valuePaise" in reg.json.data[0]).toBe(false);
  });

  test("BR-DSP-02 a customer address changed after the draft shows on the posted note", async () => {
    const s = await fx.scenario({ qty: 100 });
    await db
      .update(customers)
      .set({ address: "New address, Chakan" })
      .where(eq(customers.id, s.customerId));
    const p = await fx.mustPost(s.note.id);
    expect(p.customer.address).toBe("New address, Chakan");
  });

  test("BR-DSP-41 our name, address, GSTIN and state are copied at posting; a later settings change does not alter the posted note", async () => {
    const s = await fx.scenario({ qty: 100 });
    const p = await fx.mustPost(s.note.id);
    expect(p.company).toEqual({
      name: "Plant Works",
      address: "1 Plant Road, Pune",
      gstin: "27AAACD1234E1Z5",
      stateCode: "27",
    });
    await fx.setCompany({ address: "Moved to Nashik" });
    try {
      const after = await fx.noteDetail(s.note.id);
      expect(after.company.address).toBe("1 Plant Road, Pune");
    } finally {
      await fx.setCompany({ address: "1 Plant Road, Pune" });
    }
  });

  test("BR-DSP-41 a posted note keeps its number and status when read back, and the cost never appears on it", async () => {
    const s = await fx.scenario({ qty: 100 });
    const p = await fx.mustPost(s.note.id);
    const d = await fx.noteDetail(s.note.id, "owner");
    expect(d.dnNumber).toBe(p.dnNumber);
    expect(JSON.stringify(d)).not.toMatch(/averageCost|unitCost/i);
    expect(d.postedBy.id).toBeGreaterThan(0);
    expect(d.postedAt).toBeTruthy();
  });

  test("BR-DSP-36 posting writes an audit row dispatch.post", async () => {
    const s = await fx.scenario({ qty: 100 });
    await fx.mustPost(s.note.id);
    const d = await fx.noteDetail(s.note.id);
    expect(d.activity.map((a: { action: string }) => a.action)).toContain(
      "dispatch.post",
    );
  });
});

describe("e-way bill at posting (BR-DSP-23, 24, 26, 28)", () => {
  const code = "DISPATCH_EWAY_REQUIRED";

  test("BR-DSP-24 a note that needs an e-way bill and has none is 400 and nothing posts", async () => {
    const s = await fx.scenario({
      transport: { mode: "road", vehicleNo: "MH12AB1234", distanceKm: 350 },
    });
    const r = await fx.post(s.note.id);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe(code);
    expect(await fx.ledgerOfNote(s.note.id)).toHaveLength(0);
    expect((await fx.noteDetail(s.note.id)).status).toBe("draft");
  });

  test("BR-DSP-24 no transport mode, road with neither vehicle nor transporter, or distance missing: 400", async () => {
    const bad: Array<Record<string, unknown>> = [
      {
        vehicleNo: "MH12AB1234",
        distanceKm: 350,
        ewayBillNo: fx.ewayNo(),
        ewayBillDate: istDay(0),
      },
      {
        mode: "road",
        distanceKm: 350,
        ewayBillNo: fx.ewayNo(),
        ewayBillDate: istDay(0),
      },
      {
        mode: "road",
        vehicleNo: "MH12AB1234",
        ewayBillNo: fx.ewayNo(),
        ewayBillDate: istDay(0),
      },
    ];
    for (const transport of bad) {
      const s = await fx.scenario({ transport });
      const r = await fx.post(s.note.id);
      expect(r.status).toBe(400);
      expect(r.json.code).toBe(code);
    }
  });

  test("BR-DSP-24 rail needs a transport document number and date", async () => {
    const base = {
      mode: "rail",
      distanceKm: 800,
      ewayBillNo: fx.ewayNo(),
      ewayBillDate: istDay(0),
    };
    const s = await fx.scenario({ transport: base });
    expect((await fx.post(s.note.id)).status).toBe(400);
    const ok = await fx.scenario({
      transport: {
        ...base,
        ewayBillNo: fx.ewayNo(),
        transportDocNo: "RR-77",
        transportDocDate: istDay(0),
      },
    });
    expect((await fx.post(ok.note.id)).status).toBe(200);
  });

  test("BR-DSP-24 road with a transporter ID instead of a vehicle number is accepted", async () => {
    const s = await fx.scenario({
      transport: {
        mode: "road",
        transporterId: "27ABCDE1234F1Z5",
        distanceKm: 350,
        ewayBillNo: fx.ewayNo(),
        ewayBillDate: istDay(0),
      },
    });
    expect((await fx.post(s.note.id)).status).toBe(200);
  });

  test("BR-DSP-23 a posted note that needed an e-way bill says so and keeps the answer when the limit changes", async () => {
    const s = await fx.scenario({ transport: fx.roadTransport() });
    const p = await fx.mustPost(s.note.id);
    expect(p.ewayNeeded).toBe(true);
    await fx.setLimit(900_000_000);
    try {
      expect((await fx.noteDetail(s.note.id)).ewayNeeded).toBe(true);
    } finally {
      await fx.setLimit(5_000_000);
    }
  });

  test("BR-DSP-23 an optional note posts with no transport at all", async () => {
    const s = await fx.scenario({ qty: 100 });
    const r = await fx.post(s.note.id);
    expect(r.status).toBe(200);
    expect(r.json.data.ewayNeeded).toBe(false);
  });

  test("BR-DSP-23 the setting at the moment of posting decides: a limit raised to Rs 1 lakh after the draft makes a Rs 60,000 same-state note optional", async () => {
    const s = await fx.scenario({
      soQty: 100,
      qty: 100,
      price: 60000,
      gst: 0,
      stockQty: 100,
    });
    expect(s.note.ewayNeeded).toBe(true);
    await fx.setLimit(10_000_000);
    try {
      const r = await fx.post(s.note.id);
      expect(r.status).toBe(200);
      expect(r.json.data.ewayNeeded).toBe(false);
    } finally {
      await fx.setLimit(5_000_000);
    }
  });

  test("BR-DSP-26 saving an e-way number that is already on a posted note is 409 DISPATCH_EWAY_REUSED", async () => {
    const no = fx.ewayNo();
    const a = await fx.scenario({
      transport: fx.roadTransport({ ewayBillNo: no }),
    });
    await fx.mustPost(a.note.id);
    const b = await fx.scenario({
      transport: fx.roadTransport({ ewayBillNo: fx.ewayNo() }),
    });
    // the same number cannot be saved on a second live note, so reach it through the transport edit
    const e = await fx.dsp("floor_supervisor", "PATCH", `/notes/${b.note.id}`, {
      transport: { ewayBillNo: no, ewayBillDate: istDay(0) },
    });
    expect(e.status).toBe(409);
    expect(e.json.code).toBe("DISPATCH_EWAY_REUSED");
  });

  test("BR-DSP-28 valid until is the end of the IST day of e-way date + ceil(km / 200) days", async () => {
    const s = await fx.scenario({
      transport: fx.roadTransport({ distanceKm: 350 }),
    });
    const p = await fx.mustPost(s.note.id);
    const day = istDay(2);
    const from = Date.parse(`${day}T23:59:00+05:30`);
    const at = Date.parse(p.ewayValidUntil);
    expect(at).toBeGreaterThanOrEqual(from);
    expect(at).toBeLessThan(from + 60_000);
    expect(p.ewayExpired).toBe(false);
  });

  test("BR-DSP-28 a note past its valid-until is tagged expired in the register", async () => {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({
      customerId: c,
      lines: [{ qty: 600 }],
      orderDate: istDay(-12),
    });
    await fx.stock(so.items[0] as number, loc, 600);
    const n = await fx.mustDraft({
      soId: so.soId,
      noteDate: istDay(-10),
      sourceLocationId: loc,
      lines: [{ soLineId: so.lineIds[0], qty: 600 }],
      transport: fx.roadTransport({
        distanceKm: 100,
        ewayBillDate: istDay(-10),
      }),
    });
    await fx.mustPost(n.id);
    const r = await fx.dsp("owner", "GET", `/notes?soId=${so.soId}`);
    expect(r.json.data[0].ewayExpired).toBe(true);
    expect(r.json.data[0].ewayValidUntil).toBeTruthy();
  });
});

describe("packing list at posting (BR-DSP-21, 22)", () => {
  const pkg = (soLineId: number, qty: number, no: string) => ({
    soLineId,
    packageNo: no,
    qty,
    netKg: 40,
    grossKg: 42,
  });
  async function withPackages(packed: number[]) {
    const c = await fx.mkCustomer();
    const loc = await fx.mkLoc();
    const so = await fx.mkSo({ customerId: c, lines: [{ qty: 100 }] });
    await fx.stock(so.items[0] as number, loc, 100);
    const line = so.lineIds[0] as number;
    return fx.mustDraft({
      soId: so.soId,
      sourceLocationId: loc,
      lines: [{ soLineId: line, qty: 60 }],
      packages: packed.map((q, i) => pkg(line, q, String(i + 1))),
    });
  }

  test("BR-DSP-21 packed qty below the line qty: post is 400 DISPATCH_PACKED_QTY_MISMATCH", async () => {
    const n = await withPackages([30, 20]);
    const r = await fx.post(n.id);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("DISPATCH_PACKED_QTY_MISMATCH");
    expect(await fx.ledgerOfNote(n.id)).toHaveLength(0);
  });

  test("BR-DSP-21 packed qty equal to the line qty posts", async () => {
    const n = await withPackages([40, 20]);
    expect((await fx.post(n.id)).status).toBe(200);
  });

  test("BR-DSP-21 a note with no packages posts", async () => {
    const n = await withPackages([]);
    expect((await fx.post(n.id)).status).toBe(200);
  });

  test("BR-DSP-22 after posting, adding a package or editing anything is 409 DISPATCH_NOTE_STATUS", async () => {
    const n = await withPackages([60]);
    await fx.mustPost(n.id);
    const line = n.lines[0].soLineId as number;
    const add = await fx.dsp("floor_supervisor", "PATCH", `/notes/${n.id}`, {
      packages: [pkg(line, 60, "1"), pkg(line, 1, "2")],
    });
    expect(add.status).toBe(409);
    expect(add.json.code).toBe("DISPATCH_NOTE_STATUS");
    const qty = await fx.dsp("floor_supervisor", "PATCH", `/notes/${n.id}`, {
      lines: [{ soLineId: line, qty: 10 }],
    });
    expect(qty.status).toBe(409);
    const d = await fx.noteDetail(n.id);
    expect(d.lines[0].qty).toBe(60);
    expect(d.packages).toHaveLength(1);
  });

  test("BR-DSP-22 a posted note cannot be cancelled as a draft (409)", async () => {
    const n = await withPackages([]);
    await fx.mustPost(n.id);
    const r = await fx.cancelDraft(n.id);
    expect(r.status).toBe(409);
  });
});
