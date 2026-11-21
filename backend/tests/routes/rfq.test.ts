/**
 * RFQ lifecycle: create from PR lines, edit, send, print, close, cancel, list, permissions
 * (BR-RFQ-01..09, 35..38, 70..72). Spec: docs/specs/rfq/spec.md (v1 frozen). HTTP via createApp(), real DB.
 * Fixtures are TEST_rfq_ prefixed (tests/helpers/rfqFixtures.ts) and removed in afterAll.
 */
import { afterAll, describe, expect, setSystemTime, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { purchaseRequestItems } from "../../src/db/schemas/02_procurement-purchasing";
import {
  rfqItems,
  rfqQuotes,
  rfqs,
} from "../../src/db/schemas/02_procurement-rfq";
import { istDay, makeRfqFx } from "../helpers/rfqFixtures";

const fx = makeRfqFx("rfq");
afterAll(() => fx.cleanup());

const create = async (
  body: Record<string, unknown>,
  who?: Awaited<ReturnType<typeof fx.bo>>,
) => fx.rfqApi("POST", "/createrfq", who ?? (await fx.bo()), body);
const rfqRow = async (id: number) => {
  const [r] = await db.select().from(rfqs).where(eq(rfqs.id, id));
  return r!;
};
const details = async (id: number) =>
  (await fx.rfqApi("GET", `/getrfqdetails/${id}`, await fx.bo())).json.data;
const setPrLine = (id: number, status: string) =>
  db
    .update(purchaseRequestItems)
    .set({ status: status as never })
    .where(eq(purchaseRequestItems.id, id));

describe("BR-RFQ-01 an RFQ is made only from pending PR lines", () => {
  test("BR-RFQ-01 PR line already on a draft PO -> 400 RFQ_LINE_NOT_PENDING", async () => {
    const pr = await fx.newPr();
    await setPrLine(pr.prItemIds[0]!, "po_draft");
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: pr.prItemIds,
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("RFQ_LINE_NOT_PENDING");
  });

  test("BR-RFQ-01 line of a PR that is not approved -> 400 RFQ_LINE_NOT_PENDING", async () => {
    const pr = await fx.newPr({ status: "draft" });
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: pr.prItemIds,
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("RFQ_LINE_NOT_PENDING");
  });

  test("BR-RFQ-01 a line of a partial_ordered PR is accepted", async () => {
    const pr = await fx.newPr({ status: "partial_ordered" });
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: pr.prItemIds,
    });
    expect(r.status).toBe(201);
  });

  test("BR-RFQ-01 same PR line twice -> 400 RFQ_DUPLICATE_ID", async () => {
    const pr = await fx.newPr();
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: [pr.prItemIds[0], pr.prItemIds[0]],
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("RFQ_DUPLICATE_ID");
  });

  test("BR-RFQ-01 zero lines -> 400", async () => {
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: [],
    });
    expect(r.status).toBe(400);
  });

  test("BR-RFQ-01 unknown PR line -> 404, unknown supplier -> 404", async () => {
    const pr = await fx.newPr();
    const sup = await fx.newSupplier();
    const a = await create({
      dueDate: istDay(3),
      supplierIds: [sup],
      prItemIds: [2_000_000_000],
    });
    expect(a.status).toBe(404);
    const b = await create({
      dueDate: istDay(3),
      supplierIds: [2_000_000_000],
      prItemIds: pr.prItemIds,
    });
    expect(b.status).toBe(404);
  });

  test("BR-RFQ-01 pick list holds pending lines only and flags the line on an open RFQ", async () => {
    const pr = await fx.newPr({ qtys: [10, 20, 30] });
    await setPrLine(pr.prItemIds[2]!, "po_draft");
    const who = await fx.bo();
    const before = await fx.rfqApi("GET", `/pr-lines?prId=${pr.prId}`, who);
    expect(before.status).toBe(200);
    const ids = before.json.data.map((l: { id: number }) => l.id).sort();
    expect(ids).toEqual([pr.prItemIds[0], pr.prItemIds[1]].sort());
    for (const l of before.json.data) expect(l.onOpenRfq).toBe(false);
    const rfq = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: [pr.prItemIds[0]],
    });
    const after = await fx.rfqApi("GET", `/pr-lines?prId=${pr.prId}`, who);
    const hit = after.json.data.find(
      (l: { id: number }) => l.id === pr.prItemIds[0],
    );
    expect(hit.onOpenRfq).toBe(true);
    expect(hit.openRfqNumber).toBe(rfq.json.data.rfqNumber);
    const other = after.json.data.find(
      (l: { id: number }) => l.id === pr.prItemIds[1],
    );
    expect(other.onOpenRfq).toBe(false);
    expect(other.openRfqId).toBeNull();
  });
});

describe("BR-RFQ-02 a PR line sits on one open RFQ only", () => {
  test("BR-RFQ-02 a line on a draft RFQ cannot go on a second RFQ -> 409 PR_LINE_ON_OPEN_RFQ", async () => {
    const rfq = await fx.mkRfq({ send: false });
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: rfq.prItemIds,
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("PR_LINE_ON_OPEN_RFQ");
  });

  test("BR-RFQ-02 a line on a sent RFQ cannot go on a second RFQ -> 409", async () => {
    const rfq = await fx.mkRfq();
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: rfq.prItemIds,
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("PR_LINE_ON_OPEN_RFQ");
  });

  test("BR-RFQ-02 adding the line to a second draft RFQ by edit -> 409", async () => {
    const first = await fx.mkRfq({ send: false });
    const second = await fx.mkRfq({ send: false });
    const r = await fx.rfqApi("PATCH", "/updaterfq", await fx.bo(), {
      id: second.id,
      addPrItemIds: first.prItemIds,
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("PR_LINE_ON_OPEN_RFQ");
  });

  test("BR-RFQ-02 cancel frees the line for a new RFQ", async () => {
    const rfq = await fx.mkRfq();
    const c = await fx.rfqApi("POST", `/${rfq.id}/cancel`, await fx.bo(), {
      reason: "not needed now",
    });
    expect(c.status).toBe(200);
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: rfq.prItemIds,
    });
    expect(r.status).toBe(201);
  });

  test("BR-RFQ-02 a line on an open RFQ cannot be drafted into a PO -> 409 PR_LINE_ON_OPEN_RFQ", async () => {
    const rfq = await fx.mkRfq();
    const sup = await fx.newSupplier();
    const r = await fx.createPo(await fx.bo(), sup, [
      fx.poLine(rfq.prItemIds[0]!),
    ]);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("PR_LINE_ON_OPEN_RFQ");
  });
});

describe("BR-RFQ-03 qty and uom come from the PR line", () => {
  test("BR-RFQ-03 RFQ line qty is the PR line's remaining qty and the item's uom", async () => {
    const pr = await fx.newPr({ qtys: [1000] });
    await db
      .update(purchaseRequestItems)
      .set({ issuedQty: 400 })
      .where(eq(purchaseRequestItems.id, pr.prItemIds[0]!));
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: pr.prItemIds,
    });
    expect(r.status).toBe(201);
    expect(Number(r.json.data.lines[0].qty)).toBe(600);
    expect(r.json.data.lines[0].uom).toBe("kg");
  });

  test("BR-RFQ-03 a qty in the create body -> 400", async () => {
    const pr = await fx.newPr();
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: pr.prItemIds,
      qty: 900,
    });
    expect(r.status).toBe(400);
  });

  test("BR-RFQ-03 PATCH with a qty -> 400, line qty unchanged", async () => {
    const rfq = await fx.mkRfq({ send: false, qtys: [1000] });
    const r = await fx.rfqApi("PATCH", "/updaterfq", await fx.bo(), {
      id: rfq.id,
      qty: 900,
    });
    expect(r.status).toBe(400);
    const [l] = await db
      .select()
      .from(rfqItems)
      .where(eq(rfqItems.id, rfq.lineIds[0]!));
    expect(Number(l!.qty)).toBe(1000);
  });
});

describe("BR-RFQ-04 1 to 10 active suppliers, each once", () => {
  test("BR-RFQ-04 inactive supplier -> 400 SUPPLIER_INACTIVE", async () => {
    const pr = await fx.newPr();
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier({ active: false })],
      prItemIds: pr.prItemIds,
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("SUPPLIER_INACTIVE");
  });

  test("BR-RFQ-04 same supplier twice -> 400 RFQ_DUPLICATE_ID", async () => {
    const pr = await fx.newPr();
    const s = await fx.newSupplier();
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [s, s],
      prItemIds: pr.prItemIds,
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("RFQ_DUPLICATE_ID");
  });

  test("BR-RFQ-04 zero suppliers -> 400 RFQ_SUPPLIER_LIMIT", async () => {
    const pr = await fx.newPr();
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [],
      prItemIds: pr.prItemIds,
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("RFQ_SUPPLIER_LIMIT");
  });

  test("BR-RFQ-04 eleven suppliers -> 400 RFQ_SUPPLIER_LIMIT, ten -> 201", async () => {
    const sups: number[] = [];
    for (let i = 0; i < 11; i++) sups.push(await fx.newSupplier());
    const pr = await fx.newPr();
    const bad = await create({
      dueDate: istDay(3),
      supplierIds: sups,
      prItemIds: pr.prItemIds,
    });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe("RFQ_SUPPLIER_LIMIT");
    const ok = await create({
      dueDate: istDay(3),
      supplierIds: sups.slice(0, 10),
      prItemIds: pr.prItemIds,
    });
    expect(ok.status).toBe(201);
  });
});

describe("BR-RFQ-05 draft, number, due date, notes", () => {
  test("BR-RFQ-05 saved as draft with RFQ-<yyyy>-<mm>-<seq> number and createdBy", async () => {
    const pr = await fx.newPr();
    const who = await fx.bo();
    const r = await create(
      {
        dueDate: istDay(3),
        notes: "n",
        supplierIds: [await fx.newSupplier()],
        prItemIds: pr.prItemIds,
      },
      who,
    );
    expect(r.status).toBe(201);
    expect(r.json.data.status).toBe("draft");
    expect(r.json.data.rfqNumber).toMatch(/^RFQ-\d{4}-\d{2}-\d+$/);
    expect((await rfqRow(r.json.data.id)).createdBy).toBe(who.id);
  });

  test("BR-RFQ-05 two RFQs in a month get increasing sequence numbers, never reused", async () => {
    const a = await fx.mkRfq({ send: false });
    const b = await fx.mkRfq({ send: false });
    const seqOf = (n: string) => Number(n.split("-")[3]);
    expect(a.rfqNumber.split("-").slice(0, 3)).toEqual(
      b.rfqNumber.split("-").slice(0, 3),
    );
    expect(seqOf(b.rfqNumber)).toBeGreaterThan(seqOf(a.rfqNumber));
    await fx.rfqApi("POST", `/${b.id}/cancel`, await fx.bo(), {
      reason: "not needed now",
    });
    const c = await fx.mkRfq({ send: false });
    expect(seqOf(c.rfqNumber)).toBeGreaterThan(seqOf(b.rfqNumber));
  });

  test("BR-RFQ-05 the number carries the IST month (02:00 IST on 1 Oct 2026 -> RFQ-2026-10-)", async () => {
    setSystemTime(new Date("2026-09-30T20:30:00.000Z"));
    try {
      const pr = await fx.newPr();
      const r = await create({
        dueDate: "2026-10-01",
        supplierIds: [await fx.newSupplier()],
        prItemIds: pr.prItemIds,
      });
      expect(r.status).toBe(201);
      expect(r.json.data.rfqNumber).toMatch(/^RFQ-2026-10-\d+$/);
      const pr2 = await fx.newPr();
      const past = await create({
        dueDate: "2026-09-30",
        supplierIds: [await fx.newSupplier()],
        prItemIds: pr2.prItemIds,
      });
      expect(past.status).toBe(400);
      expect(past.json.code).toBe("RFQ_DUE_DATE_PAST");
    } finally {
      setSystemTime();
    }
  });

  test("BR-RFQ-05 due date yesterday -> 400 RFQ_DUE_DATE_PAST, today -> 201", async () => {
    const pr = await fx.newPr({ qtys: [5, 5] });
    const sup = await fx.newSupplier();
    const bad = await create({
      dueDate: istDay(-1),
      supplierIds: [sup],
      prItemIds: [pr.prItemIds[0]],
    });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe("RFQ_DUE_DATE_PAST");
    const ok = await create({
      dueDate: istDay(0),
      supplierIds: [sup],
      prItemIds: [pr.prItemIds[1]],
    });
    expect(ok.status).toBe(201);
  });

  test("BR-RFQ-05 notes over 2000 characters -> 400", async () => {
    const pr = await fx.newPr();
    const r = await create({
      dueDate: istDay(3),
      notes: "x".repeat(2001),
      supplierIds: [await fx.newSupplier()],
      prItemIds: pr.prItemIds,
    });
    expect(r.status).toBe(400);
  });
});

describe("BR-RFQ-06 only a draft RFQ can be edited", () => {
  test("BR-RFQ-06 edit due date, notes, suppliers and lines of a draft", async () => {
    const rfq = await fx.mkRfq({ send: false, suppliers: 2 });
    const extra = await fx.newSupplier();
    const pr = await fx.newPr({ qtys: [50] });
    const r = await fx.rfqApi("PATCH", "/updaterfq", await fx.bo(), {
      id: rfq.id,
      dueDate: istDay(9),
      notes: "changed",
      addSupplierIds: [extra],
      removeSupplierIds: [rfq.supplierIds[0]],
      addPrItemIds: pr.prItemIds,
    });
    expect(r.status).toBe(200);
    const d = await details(rfq.id);
    expect(d.rfq.notes).toBe("changed");
    expect(d.rfq.dueDate).toBe(istDay(9));
    expect(
      d.suppliers.map((s: { supplierId: number }) => s.supplierId).sort(),
    ).toEqual([rfq.supplierIds[1], extra].sort());
    expect(d.lines).toHaveLength(2);
  });

  test("BR-RFQ-06 a sent RFQ cannot take a new supplier -> 409 RFQ_NOT_EDITABLE", async () => {
    const rfq = await fx.mkRfq();
    const r = await fx.rfqApi("PATCH", "/updaterfq", await fx.bo(), {
      id: rfq.id,
      addSupplierIds: [await fx.newSupplier()],
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_NOT_EDITABLE");
  });

  test("BR-RFQ-06 removing the only line -> 400 RFQ_EMPTY", async () => {
    const rfq = await fx.mkRfq({ send: false });
    const r = await fx.rfqApi("PATCH", "/updaterfq", await fx.bo(), {
      id: rfq.id,
      removePrItemIds: rfq.prItemIds,
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("RFQ_EMPTY");
  });

  test("BR-RFQ-06 removing every supplier -> 400 RFQ_EMPTY", async () => {
    const rfq = await fx.mkRfq({ send: false, suppliers: 1 });
    const r = await fx.rfqApi("PATCH", "/updaterfq", await fx.bo(), {
      id: rfq.id,
      removeSupplierIds: rfq.supplierIds,
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("RFQ_EMPTY");
  });

  test("BR-RFQ-06 an edit with only an id -> 400", async () => {
    const rfq = await fx.mkRfq({ send: false });
    const r = await fx.rfqApi("PATCH", "/updaterfq", await fx.bo(), {
      id: rfq.id,
    });
    expect(r.status).toBe(400);
  });
});

describe("BR-RFQ-07 send", () => {
  test("BR-RFQ-07 send moves draft to sent and stores who and when (BR-RFQ-71)", async () => {
    const rfq = await fx.mkRfq({ send: false });
    const who = await fx.bo();
    const r = await fx.rfqApi("POST", `/${rfq.id}/send`, who, {});
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("sent");
    const row = await rfqRow(rfq.id);
    expect(row.status).toBe("sent");
    expect(row.sentBy).toBe(who.id);
    expect(row.sentAt).not.toBeNull();
  });

  test("BR-RFQ-07 send again -> 409 RFQ_INVALID_STATUS", async () => {
    const rfq = await fx.mkRfq();
    const r = await fx.rfqApi("POST", `/${rfq.id}/send`, await fx.bo(), {});
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_INVALID_STATUS");
  });

  test("BR-RFQ-72 two sends at once: one 200, one 409", async () => {
    const rfq = await fx.mkRfq({ send: false });
    const who = await fx.bo();
    const [a, b] = await Promise.all([
      fx.rfqApi("POST", `/${rfq.id}/send`, who, {}),
      fx.rfqApi("POST", `/${rfq.id}/send`, who, {}),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});

describe("BR-RFQ-08 print", () => {
  test("BR-RFQ-08 one sheet per supplier, own supplier only, no rates, no notes", async () => {
    const rfq = await fx.mkRfq({ notes: "SECRET internal note", qtys: [1000] });
    const r = await fx.rfqApi("GET", `/${rfq.id}/print`, await fx.bo());
    expect(r.status).toBe(200);
    const data = r.json.data;
    expect(data.rfqNumber).toBe(rfq.rfqNumber);
    expect(data.sheets).toHaveLength(3);
    for (const sheet of data.sheets) {
      expect(sheet.lines).toHaveLength(1);
      expect(Number(sheet.lines[0].qty)).toBe(1000);
      expect(sheet.lines[0].uom).toBe("kg");
      const others = rfq.supplierIds.filter((s) => s !== sheet.supplier.id);
      expect(others).toHaveLength(2);
      const text = JSON.stringify(sheet);
      expect(text).not.toMatch(/rate|price|paise/i);
    }
    expect(JSON.stringify(data)).not.toContain("SECRET");
    // sheets name the suppliers, but a sheet carries only its own supplier
    const names = data.sheets.map(
      (s: { supplier: { name: string } }) => s.supplier.name,
    );
    for (const sheet of data.sheets) {
      const text = JSON.stringify(sheet);
      for (const n of names)
        if (n !== sheet.supplier.name) expect(text).not.toContain(n);
    }
  });

  test("BR-RFQ-08 draft RFQ does not print -> 409 RFQ_INVALID_STATUS", async () => {
    const rfq = await fx.mkRfq({ send: false });
    const r = await fx.rfqApi("GET", `/${rfq.id}/print`, await fx.bo());
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_INVALID_STATUS");
  });

  test("BR-RFQ-08 cancelled RFQ does not print -> 409; closed RFQ reprints -> 200", async () => {
    const a = await fx.mkRfq();
    await fx.rfqApi("POST", `/${a.id}/cancel`, await fx.bo(), {
      reason: "not needed now",
    });
    const pa = await fx.rfqApi("GET", `/${a.id}/print`, await fx.bo());
    expect(pa.status).toBe(409);
    expect(pa.json.code).toBe("RFQ_INVALID_STATUS");
    const b = await fx.mkRfq();
    await fx.rfqApi("POST", `/${b.id}/close`, await fx.bo(), {
      reason: "no acceptable quote",
    });
    const pb = await fx.rfqApi("GET", `/${b.id}/print`, await fx.bo());
    expect(pb.status).toBe(200);
  });
});

describe("BR-RFQ-09 send re-checks lines and suppliers", () => {
  test("BR-RFQ-09 PR line cancelled between draft and send -> 409 RFQ_LINE_STALE", async () => {
    const rfq = await fx.mkRfq({ send: false });
    await setPrLine(rfq.prItemIds[0]!, "cancelled");
    const r = await fx.rfqApi("POST", `/${rfq.id}/send`, await fx.bo(), {});
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_LINE_STALE");
    expect((await rfqRow(rfq.id)).status).toBe("draft");
  });

  test("BR-RFQ-09 supplier deactivated between draft and send -> 409 SUPPLIER_INACTIVE_STALE", async () => {
    const { supplierMaster } = await import(
      "../../src/db/schemas/02_procurement-suppliers"
    );
    const rfq = await fx.mkRfq({ send: false });
    await db
      .update(supplierMaster)
      .set({ isActive: false })
      .where(eq(supplierMaster.id, rfq.supplierIds[1]!));
    const r = await fx.rfqApi("POST", `/${rfq.id}/send`, await fx.bo(), {});
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("SUPPLIER_INACTIVE_STALE");
    expect((await rfqRow(rfq.id)).status).toBe("draft");
  });
});

describe("BR-RFQ-10, 11 information on the RFQ detail", () => {
  test("BR-RFQ-10 an active contract of an RFQ supplier shows its rate on the detail", async () => {
    const rfq = await fx.mkRfq({ qtys: [1000] });
    const c = await fx.mkContract({
      supplierId: rfq.supplierIds[0]!,
      items: [{ itemId: rfq.itemIds[0]!, rate: 24400 }],
    });
    const d = await details(rfq.id);
    const lr = d.lineRates.find(
      (x: { rfqItemId: number }) => x.rfqItemId === rfq.lineIds[0],
    );
    expect(lr.contract).toEqual([
      expect.objectContaining({
        supplierId: rfq.supplierIds[0],
        contractNumber: c.contractNumber,
        ratePaise: 24400,
      }),
    ]);
  });

  test("BR-RFQ-11 a PR line cancelled after send stays on the RFQ marked prLineCancelled", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 20] });
    await setPrLine(rfq.prItemIds[1]!, "cancelled");
    const d = await details(rfq.id);
    expect(d.lines).toHaveLength(2);
    const l2 = d.lines.find((l: { id: number }) => l.id === rfq.lineIds[1]);
    const l1 = d.lines.find((l: { id: number }) => l.id === rfq.lineIds[0]);
    expect(l2.prLineCancelled).toBe(true);
    expect(l1.prLineCancelled).toBe(false);
  });
});

describe("BR-RFQ-35 close", () => {
  test("BR-RFQ-35 close drops open lines, frees the PR line for a PO, stores who, when, why (BR-RFQ-71)", async () => {
    const rfq = await fx.mkRfq({ qtys: [100] });
    const who = await fx.bo();
    const r = await fx.rfqApi("POST", `/${rfq.id}/close`, who, {
      reason: "no acceptable quote",
    });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("closed");
    const row = await rfqRow(rfq.id);
    expect(row.closedBy).toBe(who.id);
    expect(row.closedAt).not.toBeNull();
    expect(row.closeReason).toBe("no acceptable quote");
    const [line] = await db
      .select()
      .from(rfqItems)
      .where(eq(rfqItems.id, rfq.lineIds[0]!));
    expect(line!.lineStatus).toBe("dropped");
    const po = await fx.createPo(who, await fx.newSupplier(), [
      fx.poLine(rfq.prItemIds[0]!),
    ]);
    expect(po.status).toBe(201);
  });

  test("BR-RFQ-35 the PR line is free for a new RFQ after close", async () => {
    const rfq = await fx.mkRfq();
    await fx.rfqApi("POST", `/${rfq.id}/close`, await fx.bo(), {
      reason: "no acceptable quote",
    });
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: rfq.prItemIds,
    });
    expect(r.status).toBe(201);
  });

  test("BR-RFQ-35 a draft RFQ cannot be closed -> 409 RFQ_INVALID_STATUS", async () => {
    const rfq = await fx.mkRfq({ send: false });
    const r = await fx.rfqApi("POST", `/${rfq.id}/close`, await fx.bo(), {
      reason: "no acceptable quote",
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_INVALID_STATUS");
  });

  test("BR-RFQ-35 reason of 2 characters -> 400, RFQ unchanged", async () => {
    const rfq = await fx.mkRfq();
    const r = await fx.rfqApi("POST", `/${rfq.id}/close`, await fx.bo(), {
      reason: "ab",
    });
    expect(r.status).toBe(400);
    expect((await rfqRow(rfq.id)).status).toBe("sent");
  });
});

describe("BR-RFQ-36 cancel", () => {
  test("BR-RFQ-36 cancel a draft with a reason, stores who, when, why (BR-RFQ-71)", async () => {
    const rfq = await fx.mkRfq({ send: false });
    const who = await fx.bo();
    const r = await fx.rfqApi("POST", `/${rfq.id}/cancel`, who, {
      reason: "bought elsewhere",
    });
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("cancelled");
    const row = await rfqRow(rfq.id);
    expect(row.cancelledBy).toBe(who.id);
    expect(row.cancelledAt).not.toBeNull();
    expect(row.cancelReason).toBe("bought elsewhere");
  });

  test("BR-RFQ-36 cancel a sent RFQ: its PR lines are free and its quotes become cancelled", async () => {
    const rfq = await fx.mkRfq();
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    const r = await fx.rfqApi("POST", `/${rfq.id}/cancel`, await fx.bo(), {
      reason: "bought elsewhere",
    });
    expect(r.status).toBe(200);
    const [row] = await db
      .select()
      .from(rfqQuotes)
      .where(eq(rfqQuotes.id, q.quoteId));
    expect(row!.status).toBe("cancelled");
    const again = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: rfq.prItemIds,
    });
    expect(again.status).toBe(201);
  });

  test("BR-RFQ-36 reason of 2 characters -> 400", async () => {
    const rfq = await fx.mkRfq({ send: false });
    const r = await fx.rfqApi("POST", `/${rfq.id}/cancel`, await fx.bo(), {
      reason: "no",
    });
    expect(r.status).toBe(400);
  });

  test("BR-RFQ-36 cancelling twice -> 409 RFQ_INVALID_STATUS", async () => {
    const rfq = await fx.mkRfq({ send: false });
    const who = await fx.bo();
    await fx.rfqApi("POST", `/${rfq.id}/cancel`, who, {
      reason: "bought elsewhere",
    });
    const r = await fx.rfqApi("POST", `/${rfq.id}/cancel`, who, {
      reason: "bought elsewhere",
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_INVALID_STATUS");
  });
});

describe("BR-RFQ-37 closed and cancelled RFQs are final", () => {
  test("BR-RFQ-37 closed RFQ: no quote, no send, no second close, no cancel; number kept", async () => {
    const rfq = await fx.mkRfq();
    const who = await fx.bo();
    await fx.rfqApi("POST", `/${rfq.id}/close`, who, {
      reason: "no acceptable quote",
    });
    const q = await fx.enterQuote(rfq, rfq.supplierIds[0]!);
    expect(q.status).toBe(409);
    expect(q.json.code).toBe("RFQ_INVALID_STATUS");
    for (const [path, body] of [
      ["send", {}],
      ["close", { reason: "again again" }],
      ["cancel", { reason: "again again" }],
    ] as const) {
      const r = await fx.rfqApi("POST", `/${rfq.id}/${path}`, who, body);
      expect(r.status).toBe(409);
    }
    expect((await rfqRow(rfq.id)).rfqNumber).toBe(rfq.rfqNumber);
  });

  test("BR-RFQ-37 cancelled RFQ cannot be edited -> 409 RFQ_NOT_EDITABLE", async () => {
    const rfq = await fx.mkRfq({ send: false });
    await fx.rfqApi("POST", `/${rfq.id}/cancel`, await fx.bo(), {
      reason: "bought elsewhere",
    });
    const r = await fx.rfqApi("PATCH", "/updaterfq", await fx.bo(), {
      id: rfq.id,
      notes: "late edit",
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_NOT_EDITABLE");
  });
});

describe("BR-RFQ-38 draft quotes end with the RFQ", () => {
  test("BR-RFQ-38 close: a draft quote becomes cancelled 'RFQ ended', a submitted one not_awarded (BR-RFQ-34)", async () => {
    const rfq = await fx.mkRfq();
    const draft = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    const sub = await fx.mkQuote(rfq, rfq.supplierIds[1]!);
    await fx.rfqApi("POST", `/${rfq.id}/close`, await fx.bo(), {
      reason: "no acceptable quote",
    });
    const [d] = await db
      .select()
      .from(rfqQuotes)
      .where(eq(rfqQuotes.id, draft.quoteId));
    expect(d!.status).toBe("cancelled");
    expect(d!.cancelReason).toBe("RFQ ended");
    const [s] = await db
      .select()
      .from(rfqQuotes)
      .where(eq(rfqQuotes.id, sub.quoteId));
    expect(s!.status).toBe("not_awarded");
  });

  test("BR-RFQ-38 cancel: a draft quote becomes cancelled 'RFQ ended'", async () => {
    const rfq = await fx.mkRfq();
    const draft = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    await fx.rfqApi("POST", `/${rfq.id}/cancel`, await fx.bo(), {
      reason: "bought elsewhere",
    });
    const [d] = await db
      .select()
      .from(rfqQuotes)
      .where(eq(rfqQuotes.id, draft.quoteId));
    expect(d!.status).toBe("cancelled");
    expect(d!.cancelReason).toBe("RFQ ended");
  });
});

describe("list and detail", () => {
  test("getrfqs filters by status and supplier, searches the number, pages, counts", async () => {
    const rfq = await fx.mkRfq({ qtys: [1, 2], suppliers: 2 });
    await fx.mkQuote(rfq, rfq.supplierIds[0]!, { lines: [{}, {}] });
    const who = await fx.bo();
    const r = await fx.rfqApi(
      "GET",
      `/getrfqs?status=sent&supplierId=${rfq.supplierIds[0]}&pageSize=5`,
      who,
    );
    expect(r.status).toBe(200);
    expect(r.json.meta.pageSize).toBe(5);
    const row = r.json.data.find((x: { id: number }) => x.id === rfq.id);
    expect(row.status).toBe("sent");
    expect(row.supplierCount).toBe(2);
    expect(row.lineCount).toBe(2);
    expect(row.quotedCount).toBe(1);
    const q = await fx.rfqApi("GET", `/getrfqs?q=${rfq.rfqNumber}`, who);
    expect(q.json.data.map((x: { id: number }) => x.id)).toContain(rfq.id);
    const none = await fx.rfqApi(
      "GET",
      `/getrfqs?status=draft&supplierId=${rfq.supplierIds[0]}`,
      who,
    );
    expect(none.json.data).toEqual([]);
  });

  test("getrfqdetails of an unknown id -> 404", async () => {
    const r = await fx.rfqApi(
      "GET",
      "/getrfqdetails/2000000000",
      await fx.bo(),
    );
    expect(r.status).toBe(404);
  });
});

describe("BR-RFQ-70 every endpoint needs a login and its key", () => {
  const endpoints: [string, string, unknown?][] = [
    ["GET", "/pr-lines"],
    ["GET", "/getrfqs"],
    ["GET", "/getrfqdetails/1"],
    ["POST", "/createrfq", {}],
    ["PATCH", "/updaterfq", {}],
    ["POST", "/1/send", {}],
    ["POST", "/1/cancel", { reason: "abc" }],
    ["POST", "/1/close", { reason: "abc" }],
    ["GET", "/1/print"],
    ["GET", "/quotes/1"],
    ["POST", "/1/quotes", {}],
    ["PATCH", "/quotes/1", {}],
    ["POST", "/quotes/1/submit", {}],
    ["POST", "/quotes/1/cancel", { reason: "abc" }],
    ["GET", "/1/comparison"],
    ["POST", "/1/award", {}],
  ];
  test("BR-RFQ-70 no login -> 401 on every route", async () => {
    for (const [m, p, b] of endpoints)
      expect((await fx.rfqApi(m, p, null, b)).status).toBe(401);
  });

  test("BR-RFQ-70 floor supervisor (no RFQ key) -> 403 PERMISSION_DENIED on every route", async () => {
    const who = await fx.floor();
    for (const [m, p, b] of endpoints) {
      const r = await fx.rfqApi(m, p, who, b);
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("PERMISSION_DENIED");
    }
  });

  test("BR-RFQ-70 rfq.view only: can list and read, cannot create, send, cancel or close", async () => {
    const who = await fx.actor("viewer", ["rfq.view"]);
    const rfq = await fx.mkRfq({ send: false });
    expect((await fx.rfqApi("GET", "/getrfqs", who)).status).toBe(200);
    expect(
      (await fx.rfqApi("GET", `/getrfqdetails/${rfq.id}`, who)).status,
    ).toBe(200);
    expect((await fx.rfqApi("POST", "/createrfq", who, {})).status).toBe(403);
    expect((await fx.rfqApi("POST", `/${rfq.id}/send`, who, {})).status).toBe(
      403,
    );
    expect((await fx.rfqApi("GET", "/pr-lines", who)).status).toBe(403);
    expect(
      (await fx.rfqApi("POST", `/${rfq.id}/cancel`, who, { reason: "abc def" }))
        .status,
    ).toBe(403);
    expect((await rfqRow(rfq.id)).status).toBe("draft");
  });

  test("BR-RFQ-70 rfq.manage without rfq.view cannot read the list", async () => {
    const who = await fx.actor("manager", ["rfq.manage"]);
    expect((await fx.rfqApi("GET", "/getrfqs", who)).status).toBe(403);
    expect((await fx.rfqApi("GET", "/pr-lines", who)).status).toBe(200);
  });

  test("BR-RFQ-70 the 403 names the missing key", async () => {
    const r = await fx.rfqApi("POST", "/createrfq", await fx.floor(), {});
    expect(r.status).toBe(403);
    expect(r.json.key).toBe("rfq.manage");
  });
});

describe("BR-RFQ-73 / schema: unknown keys and bad ids", () => {
  test("BR-RFQ-73 createrfq with an unknown key -> 400", async () => {
    const pr = await fx.newPr();
    const r = await create({
      dueDate: istDay(3),
      supplierIds: [await fx.newSupplier()],
      prItemIds: pr.prItemIds,
      extra: 1,
    });
    expect(r.status).toBe(400);
  });
});
