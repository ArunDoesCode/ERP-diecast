/**
 * Award (BR-RFQ-25..34, 38, 39) and the RFQ end states that depend on it (BR-RFQ-11, 19, 33, 35..37, 70..72).
 * Spec: docs/specs/rfq/spec.md (v1 frozen). HTTP via createApp(), real DB. Fixtures TEST_rfqa_ prefixed.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/client";
import {
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  rfqItems,
  rfqQuotes,
  rfqs,
} from "../../src/db/schemas/02_procurement-rfq";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { istDay, makeRfqFx } from "../helpers/rfqFixtures";

const fx = makeRfqFx("rfqa");
afterAll(() => fx.cleanup());

const rfqRow = async (id: number) => {
  const [r] = await db.select().from(rfqs).where(eq(rfqs.id, id));
  return r!;
};
const lineRow = async (id: number) => {
  const [r] = await db.select().from(rfqItems).where(eq(rfqItems.id, id));
  return r!;
};
const quoteRow = async (id: number) => {
  const [r] = await db.select().from(rfqQuotes).where(eq(rfqQuotes.id, id));
  return r!;
};
const poRow = async (id: number) => {
  const [r] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id));
  return r!;
};
const poLines = (poId: number) =>
  db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
const setPrLine = (id: number, status: string) =>
  db
    .update(purchaseRequestItems)
    .set({ status: status as never })
    .where(eq(purchaseRequestItems.id, id));

/** Spec example: 1000 kg, S1 24,500 + freight 2,000 (landed 24,700), S2 24,300 + 5,000 (24,800), S3 25,000 (25,000). */
async function threeQuoted(prType?: "misc" | "maintenance") {
  const rfq = await fx.mkRfq({ qtys: [1000], prType });
  const [s1, s2, s3] = rfq.supplierIds as [number, number, number];
  const q1 = await fx.mkQuote(rfq, s1, {
    ref: "BA/Q/118",
    terms: 45,
    lines: [{ rate: 24500, freight: 200000, lead: 7 }],
  });
  const q2 = await fx.mkQuote(rfq, s2, {
    lines: [{ rate: 24300, freight: 500000, lead: 10 }],
  });
  const q3 = await fx.mkQuote(rfq, s3, { lines: [{ rate: 25000, lead: 5 }] });
  return { rfq, s1, s2, s3, q1, q2, q3 };
}

describe("BR-RFQ-25 award picks one eligible quote line per RFQ line", () => {
  test("BR-RFQ-25 award the lowest quote line: 201, one draft PO, the line is awarded", async () => {
    const { rfq, s1, q1 } = await threeQuoted();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(201);
    expect(r.json.data.pos).toHaveLength(1);
    expect(r.json.data.pos[0].supplierId).toBe(s1);
    expect(r.json.data.pos[0].lineCount).toBe(1);
    expect(r.json.data.awards[0].rfqItemId).toBe(rfq.lineIds[0]);
    const l = await lineRow(rfq.lineIds[0]!);
    expect(l.lineStatus).toBe("awarded");
    expect(l.awardedQuoteItemId).toBe(q1.quoteItemIds[0]!);
  });

  test("BR-RFQ-25 a line already awarded -> 409 RFQ_LINE_AWARDED", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 20], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    const q1 = await fx.mkQuote(rfq, s1, {
      lines: [{ rate: 100 }, { rate: 100 }],
    });
    await fx.mkQuote(rfq, s2, { lines: [{ rate: 200 }, { rate: 200 }] });
    const who = await fx.bo();
    expect(
      (
        await fx.award(
          rfq,
          [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
          who,
        )
      ).status,
    ).toBe(201);
    const again = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      who,
    );
    expect(again.status).toBe(409);
    expect(again.json.code).toBe("RFQ_LINE_AWARDED");
  });

  test("BR-RFQ-25 the same RFQ line twice in one save -> 400", async () => {
    const { rfq, q1 } = await threeQuoted();
    const r = await fx.rfqApi("POST", `/${rfq.id}/award`, await fx.bo(), {
      lines: [
        { rfqItemId: rfq.lineIds[0], quoteItemId: q1.quoteItemIds[0] },
        { rfqItemId: rfq.lineIds[0], quoteItemId: q1.quoteItemIds[0] },
      ],
    });
    expect(r.status).toBe(400);
  });

  test("BR-RFQ-25 an empty award -> 400", async () => {
    const { rfq } = await threeQuoted();
    const r = await fx.rfqApi("POST", `/${rfq.id}/award`, await fx.bo(), {
      lines: [],
    });
    expect(r.status).toBe(400);
  });
});

describe("BR-RFQ-26 refused quote lines", () => {
  test("BR-RFQ-26 a quote line that is not on that RFQ line -> 400 QUOTE_LINE_INVALID", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 20], suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 100 }, { rate: 100 }],
    });
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q.quoteItemIds[1]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_LINE_INVALID");
  });

  test("BR-RFQ-26 a 'not quoted' line -> 400 QUOTE_LINE_INVALID", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 20], suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 100 }, { quoted: false }],
    });
    const r = await fx.award(
      rfq,
      [{ line: 1, quoteItemId: q.quoteItemIds[1]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_LINE_INVALID");
  });

  test("BR-RFQ-26 a draft quote -> 400 QUOTE_LINE_INVALID", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_LINE_INVALID");
  });

  test("BR-RFQ-26 a cancelled quote -> 400 QUOTE_LINE_INVALID", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    await fx.rfqApi("POST", `/quotes/${q.quoteId}/cancel`, await fx.bo(), {
      reason: "revised price",
    });
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_LINE_INVALID");
  });

  test("BR-RFQ-26 a quote that expired since quoting -> 409 QUOTE_EXPIRED, nothing saved", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, {
      quoteDate: istDay(-5),
      validTill: istDay(-1),
    });
    const r = await fx.award(
      rfq,
      [
        {
          line: 0,
          quoteItemId: q.quoteItemIds[0]!,
          reason: "supplier confirmed rate",
        },
      ],
      await fx.bo(),
    );
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("QUOTE_EXPIRED");
    expect((await lineRow(rfq.lineIds[0]!)).lineStatus).toBe("open");
  });

  test("BR-RFQ-26 a supplier deactivated since quoting -> 409 SUPPLIER_INACTIVE_STALE, nothing saved", async () => {
    const rfq = await fx.mkRfq({ suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    const q1 = await fx.mkQuote(rfq, s1, { lines: [{ rate: 100 }] });
    await fx.mkQuote(rfq, s2, { lines: [{ rate: 200 }] });
    await db
      .update(supplierMaster)
      .set({ isActive: false })
      .where(eq(supplierMaster.id, s1));
    const r = await fx.award(
      rfq,
      [
        {
          line: 0,
          quoteItemId: q1.quoteItemIds[0]!,
          reason: "supplier confirmed rate",
        },
      ],
      await fx.bo(),
    );
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("SUPPLIER_INACTIVE_STALE");
    expect((await lineRow(rfq.lineIds[0]!)).lineStatus).toBe("open");
  });
});

describe("BR-RFQ-27 award above the lowest needs a reason", () => {
  test("BR-RFQ-27 award to S2 (landed 24,800, not lowest) without reason -> 400 AWARD_REASON_REQUIRED, nothing saved", async () => {
    const { rfq, q2 } = await threeQuoted();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q2.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("AWARD_REASON_REQUIRED");
    expect((await lineRow(rfq.lineIds[0]!)).lineStatus).toBe("open");
    expect((await rfqRow(rfq.id)).status).toBe("sent");
  });

  test("BR-RFQ-27 reason of 2 characters -> 400", async () => {
    const { rfq, q2 } = await threeQuoted();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q2.quoteItemIds[0]!, reason: "ab" }],
      await fx.bo(),
    );
    expect(r.status).toBe(400);
  });

  test("BR-RFQ-27 with a reason the award is saved with reason, who, when and lowest vs chosen landed rate (BR-RFQ-71)", async () => {
    const { rfq, q2 } = await threeQuoted();
    const who = await fx.bo();
    const r = await fx.award(
      rfq,
      [
        {
          line: 0,
          quoteItemId: q2.quoteItemIds[0]!,
          reason: "S1 failed last 2 lots",
        },
      ],
      who,
    );
    expect(r.status).toBe(201);
    const l = await lineRow(rfq.lineIds[0]!);
    expect(l.awardReason).toBe("S1 failed last 2 lots");
    expect(l.awardedAt).not.toBeNull();
    expect(l.awardLowestLandedPaise).toBe(24700);
    expect(l.awardChosenLandedPaise).toBe(24800);
    const d = await fx.rfqApi("GET", `/getrfqdetails/${rfq.id}`, who);
    const line = d.json.data.lines[0];
    expect(line.awardReason).toBe("S1 failed last 2 lots");
    expect(line.awardedAt).toBeTruthy();
  });

  test("BR-RFQ-27 award to the lowest needs no reason", async () => {
    const { rfq, q1 } = await threeQuoted();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(201);
    expect((await lineRow(rfq.lineIds[0]!)).awardReason).toBeNull();
  });
});

describe("BR-RFQ-28 award makes one draft PO per winning supplier", () => {
  test("BR-RFQ-28 2 lines to S1 and 1 to S2: two draft POs, rate, GST and payment terms from the quote, no expected delivery", async () => {
    const rfq = await fx.mkRfq({ qtys: [100, 200, 300], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    const q1 = await fx.mkQuote(rfq, s1, {
      terms: 45,
      lines: [
        { rate: 24500, gst: 18 },
        { rate: 30000, gst: 12 },
        { rate: 50000 },
      ],
    });
    const q2 = await fx.mkQuote(rfq, s2, {
      terms: 15,
      lines: [{ rate: 26000 }, { rate: 31000 }, { rate: 40000, gst: 5 }],
    });
    const r = await fx.award(
      rfq,
      [
        { line: 0, quoteItemId: q1.quoteItemIds[0]! },
        { line: 1, quoteItemId: q1.quoteItemIds[1]! },
        { line: 2, quoteItemId: q2.quoteItemIds[2]! },
      ],
      await fx.bo(),
    );
    expect(r.status).toBe(201);
    const pos = r.json.data.pos as {
      poId: number;
      supplierId: number;
      lineCount: number;
    }[];
    expect(pos).toHaveLength(2);
    const p1 = pos.find((p) => p.supplierId === s1)!;
    const p2 = pos.find((p) => p.supplierId === s2)!;
    expect(p1.lineCount).toBe(2);
    expect(p2.lineCount).toBe(1);
    const h1 = await poRow(p1.poId);
    expect(h1.status).toBe("draft");
    expect(h1.expectedDeliveryDate).toBeNull();
    expect(h1.paymentTermsDays).toBe(45);
    expect((await poRow(p2.poId)).paymentTermsDays).toBe(15);
    const l1 = (await poLines(p1.poId)).sort(
      (a, b) => a.unitPricePaise - b.unitPricePaise,
    );
    expect(l1.map((l) => [l.unitPricePaise, Number(l.gstPercent)])).toEqual([
      [24500, 18],
      [30000, 12],
    ]);
    const l2 = await poLines(p2.poId);
    expect(l2).toHaveLength(1);
    expect(l2[0]!.unitPricePaise).toBe(40000);
    expect(Number(l2[0]!.gstPercent)).toBe(5);
    expect(Number(l2[0]!.qty)).toBe(300);
    for (const a of r.json.data.awards) expect(a.source).toBe("quote");
  });
});

describe("BR-RFQ-29 contract rate beats the quote rate", () => {
  test("BR-RFQ-29 S1 quote 24,500, contract 24,400 -> PO line 24,400, linked, source contract", async () => {
    const { rfq, s1, q1 } = await threeQuoted();
    const c = await fx.mkContract({
      supplierId: s1,
      items: [{ itemId: rfq.itemIds[0]!, rate: 24400 }],
    });
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(201);
    expect(r.json.data.awards[0].ratePaise).toBe(24400);
    expect(r.json.data.awards[0].source).toBe("contract");
    const [line] = await poLines(r.json.data.pos[0].poId);
    expect(line!.unitPricePaise).toBe(24400);
    expect(line!.contractItemId).toBe(c.lineIds[0]!);
    expect(line!.contractRatePaise).toBe(24400);
  });

  test("BR-RFQ-29 S1 quote 24,300 (below contract) -> PO line still 24,400", async () => {
    const rfq = await fx.mkRfq({ qtys: [1000], suppliers: 1 });
    const s1 = rfq.supplierIds[0]!;
    const q = await fx.mkQuote(rfq, s1, { lines: [{ rate: 24300 }] });
    await fx.mkContract({
      supplierId: s1,
      items: [{ itemId: rfq.itemIds[0]!, rate: 24400 }],
    });
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(201);
    const [line] = await poLines(r.json.data.pos[0].poId);
    expect(line!.unitPricePaise).toBe(24400);
  });

  test("BR-RFQ-29 a contract of another supplier does not apply", async () => {
    const { rfq, s2, q1 } = await threeQuoted();
    await fx.mkContract({
      supplierId: s2,
      items: [{ itemId: rfq.itemIds[0]!, rate: 20000 }],
    });
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      await fx.bo(),
    );
    const [line] = await poLines(r.json.data.pos[0].poId);
    expect(line!.unitPricePaise).toBe(24500);
    expect(line!.contractItemId).toBeNull();
  });

  test("BR-RFQ-29/32/52 award that passes the contract cap -> 409 CONTRACT_QTY_EXCEEDED, nothing saved", async () => {
    const rfq = await fx.mkRfq({ qtys: [1000], suppliers: 1 });
    const s1 = rfq.supplierIds[0]!;
    const q = await fx.mkQuote(rfq, s1, { lines: [{ rate: 24500 }] });
    await fx.mkContract({
      supplierId: s1,
      items: [{ itemId: rfq.itemIds[0]!, agreedQty: 500 }],
    });
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("CONTRACT_QTY_EXCEEDED");
    expect((await lineRow(rfq.lineIds[0]!)).lineStatus).toBe("open");
    expect((await rfqRow(rfq.id)).status).toBe("sent");
  });
});

describe("BR-RFQ-30 freight goes to the PO notes", () => {
  test("BR-RFQ-30 freight 2,000 on the quote -> a note line, not part of the PO amount", async () => {
    const { rfq, q1 } = await threeQuoted();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(201);
    const po = await poRow(r.json.data.pos[0].poId);
    expect(po.notes).toContain("Freight ₹2,000.00");
    expect(po.notes).toContain("as per BA/Q/118");
    expect(po.subtotalPaise).toBe(1000 * 24500);
  });

  test("BR-RFQ-30 no freight line when the quote has none", async () => {
    const { rfq, q3 } = await threeQuoted();
    const r = await fx.award(
      rfq,
      [
        {
          line: 0,
          quoteItemId: q3.quoteItemIds[0]!,
          reason: "closest to plant",
        },
      ],
      await fx.bo(),
    );
    const po = await poRow(r.json.data.pos[0].poId);
    expect(po.notes ?? "").not.toContain("Freight");
  });
});

describe("BR-RFQ-31 links between PO line, quote line and RFQ line", () => {
  test("BR-RFQ-31 the PO line keeps its quote line; the RFQ line keeps the PO number", async () => {
    const { rfq, s1, q1 } = await threeQuoted();
    const who = await fx.bo();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      who,
    );
    const { poId, poNumber } = r.json.data.pos[0];
    const [line] = await poLines(poId);
    expect(line!.quoteItemId).toBe(q1.quoteItemIds[0]!);
    const d = await fx.rfqApi("GET", `/getrfqdetails/${rfq.id}`, who);
    const l = d.json.data.lines[0];
    expect(l.poId).toBe(poId);
    expect(l.poNumber).toBe(poNumber);
    expect(l.poStatus).toBe("draft");
    expect(l.awardedSupplierId).toBe(s1);
    expect(l.awardedQuoteItemId).toBe(q1.quoteItemIds[0]);
    const items = await fx.poItems(poId, who);
    expect(items[0].quoteItemId).toBe(q1.quoteItemIds[0]);
  });
});

describe("BR-RFQ-32 and BR-RFQ-11 all or nothing; cancelled PR lines", () => {
  test("BR-RFQ-32 two lines, second PR line cancelled -> 409 RFQ_LINE_STALE, no PO, first line not awarded", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 20], suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 100 }, { rate: 100 }],
    });
    await setPrLine(rfq.prItemIds[1]!, "cancelled");
    const r = await fx.award(
      rfq,
      [
        { line: 0, quoteItemId: q.quoteItemIds[0]! },
        { line: 1, quoteItemId: q.quoteItemIds[1]! },
      ],
      await fx.bo(),
    );
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_LINE_STALE");
    expect((await lineRow(rfq.lineIds[0]!)).lineStatus).toBe("open");
    expect((await rfqRow(rfq.id)).status).toBe("sent");
    const made = await db
      .select()
      .from(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.quoteItemId, q.quoteItemIds));
    expect(made).toEqual([]);
  });

  test("BR-RFQ-11 award of a line whose PR line was cancelled -> 409 RFQ_LINE_STALE", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 20], suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 100 }, { rate: 100 }],
    });
    await setPrLine(rfq.prItemIds[1]!, "cancelled");
    const r = await fx.award(
      rfq,
      [{ line: 1, quoteItemId: q.quoteItemIds[1]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_LINE_STALE");
  });

  test("BR-RFQ-11 award line 1 only: line 1 awarded, cancelled line 2 dropped, RFQ awarded", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 20], suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 100 }, { rate: 100 }],
    });
    await setPrLine(rfq.prItemIds[1]!, "cancelled");
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.status).toBe(201);
    expect((await lineRow(rfq.lineIds[0]!)).lineStatus).toBe("awarded");
    expect((await lineRow(rfq.lineIds[1]!)).lineStatus).toBe("dropped");
    expect((await rfqRow(rfq.id)).status).toBe("awarded");
  });
});

describe("BR-RFQ-33 the PO follows the PO module", () => {
  test("BR-RFQ-33 PO cancelled: the RFQ line stays awarded and shows the PO cancelled", async () => {
    const { rfq, q1 } = await threeQuoted();
    const who = await fx.bo();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      who,
    );
    const { poId } = r.json.data.pos[0];
    const del = await fx.poApi("DELETE", `/deletepo/${poId}`, who, {
      reason: "wrong supplier",
    });
    expect(del.status).toBe(200);
    expect((await lineRow(rfq.lineIds[0]!)).lineStatus).toBe("awarded");
    const d = await fx.rfqApi("GET", `/getrfqdetails/${rfq.id}`, who);
    expect(d.json.data.lines[0].poStatus).toBe("cancelled");
    expect(d.json.data.lines[0].poId).toBe(poId);
    const [pr] = await db
      .select()
      .from(purchaseRequestItems)
      .where(eq(purchaseRequestItems.id, rfq.prItemIds[0]!));
    expect(pr!.status).toBe("cancelled");
  });
});

describe("BR-RFQ-34 and 38 the RFQ ends when every line is awarded or dropped", () => {
  test("BR-RFQ-34 last line awarded: RFQ awarded, completedAt set, other submitted quotes not_awarded, quotes kept", async () => {
    const { rfq, q1, q2, q3 } = await threeQuoted();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.json.data.rfq.status).toBe("awarded");
    const row = await rfqRow(rfq.id);
    expect(row.status).toBe("awarded");
    expect(row.completedAt).not.toBeNull();
    expect((await quoteRow(q2.quoteId)).status).toBe("not_awarded");
    expect((await quoteRow(q3.quoteId)).status).toBe("not_awarded");
    expect((await quoteRow(q1.quoteId)).status).toBe("submitted");
  });

  test("BR-RFQ-38 a draft quote still open when the RFQ is awarded becomes cancelled 'RFQ ended'", async () => {
    const rfq = await fx.mkRfq({ suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    const q1 = await fx.mkQuote(rfq, s1, { lines: [{ rate: 100 }] });
    const draft = await fx.mkQuote(rfq, s2, { submit: false });
    await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      await fx.bo(),
    );
    const d = await quoteRow(draft.quoteId);
    expect(d.status).toBe("cancelled");
    expect(d.cancelReason).toBe("RFQ ended");
  });

  test("BR-RFQ-25/34 award some lines: RFQ partially_awarded and still takes quotes (BR-RFQ-12)", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 20], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    const q1 = await fx.mkQuote(rfq, s1, {
      lines: [{ rate: 100 }, { rate: 100 }],
    });
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      await fx.bo(),
    );
    expect(r.json.data.rfq.status).toBe("partially_awarded");
    expect((await rfqRow(rfq.id)).status).toBe("partially_awarded");
    const late = await fx.enterQuote(rfq, s2);
    expect(late.status).toBe(201);
  });
});

describe("BR-RFQ-35..37 close, cancel and final states after an award", () => {
  test("BR-RFQ-35 1 of 2 lines awarded, close: other line dropped, its PR line free for a PO", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 20], suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 100 }, { rate: 100 }],
    });
    const who = await fx.bo();
    await fx.award(rfq, [{ line: 0, quoteItemId: q.quoteItemIds[0]! }], who);
    const c = await fx.rfqApi("POST", `/${rfq.id}/close`, who, {
      reason: "no acceptable quote",
    });
    expect(c.status).toBe(200);
    expect(c.json.data.status).toBe("closed");
    expect((await lineRow(rfq.lineIds[0]!)).lineStatus).toBe("awarded");
    expect((await lineRow(rfq.lineIds[1]!)).lineStatus).toBe("dropped");
    const po = await fx.createPo(who, await fx.newSupplier(), [
      fx.poLine(rfq.prItemIds[1]!),
    ]);
    expect(po.status).toBe(201);
  });

  test("BR-RFQ-36 a partially awarded RFQ cannot be cancelled -> 409 RFQ_HAS_AWARD", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 20], suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 100 }, { rate: 100 }],
    });
    const who = await fx.bo();
    await fx.award(rfq, [{ line: 0, quoteItemId: q.quoteItemIds[0]! }], who);
    const r = await fx.rfqApi("POST", `/${rfq.id}/cancel`, who, {
      reason: "bought elsewhere",
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_HAS_AWARD");
    expect((await rfqRow(rfq.id)).status).toBe("partially_awarded");
  });

  test("BR-RFQ-37 an awarded RFQ is final: no quote, close, cancel, send, edit; it still prints (BR-RFQ-08)", async () => {
    const { rfq, s1, q1 } = await threeQuoted();
    const who = await fx.bo();
    await fx.award(rfq, [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }], who);
    expect((await fx.enterQuote(rfq, s1)).json.code).toBe("RFQ_INVALID_STATUS");
    for (const [p, b] of [
      ["close", { reason: "no acceptable quote" }],
      ["cancel", { reason: "bought elsewhere" }],
      ["send", {}],
    ] as const) {
      expect((await fx.rfqApi("POST", `/${rfq.id}/${p}`, who, b)).status).toBe(
        409,
      );
    }
    const e = await fx.rfqApi("PATCH", "/updaterfq", who, {
      id: rfq.id,
      notes: "late",
    });
    expect(e.status).toBe(409);
    expect((await fx.rfqApi("GET", `/${rfq.id}/print`, who)).status).toBe(200);
    const again = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      who,
    );
    expect(again.status).toBe(409);
  });

  test("BR-RFQ-19 cancel a quote with an awarded line -> 409 QUOTE_AWARDED", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 20], suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 100 }, { rate: 100 }],
    });
    const who = await fx.bo();
    await fx.award(rfq, [{ line: 0, quoteItemId: q.quoteItemIds[0]! }], who);
    const r = await fx.rfqApi("POST", `/quotes/${q.quoteId}/cancel`, who, {
      reason: "revised price",
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("QUOTE_AWARDED");
    expect((await quoteRow(q.quoteId)).status).toBe("submitted");
  });
});

describe("BR-RFQ-39 a PO from an award goes through normal approval", () => {
  test("BR-RFQ-39 submit the award PO -> approval request; approver approves -> PO approved", async () => {
    const approver = await fx.owner2();
    await fx.maintenancePoPolicy(approver.id, -96101);
    const { rfq, q1 } = await threeQuoted("maintenance");
    const buyer = await fx.bo();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      buyer,
    );
    expect(r.status).toBe(201);
    const { poId } = r.json.data.pos[0];
    const s = await fx.submitPo(buyer, poId);
    expect(s.status).toBe(201);
    expect((await poRow(poId)).status).toBe("pending_approval");
    const a = await fx.approve(approver, s.json.data.id);
    expect(a.status).toBe(200);
    expect((await poRow(poId)).status).toBe("approved");
  });
});

describe("BR-RFQ-70..72 permissions, audit, races", () => {
  test("BR-RFQ-70 rfq.award without po.manage -> 403 naming po.manage, nothing saved", async () => {
    const who = await fx.actor("awardOnly", ["rfq.view", "rfq.award"]);
    const { rfq, q1 } = await threeQuoted();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      who,
    );
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
    expect(r.json.key).toBe("po.manage");
    expect((await lineRow(rfq.lineIds[0]!)).lineStatus).toBe("open");
  });

  test("BR-RFQ-70 po.manage without rfq.award -> 403 naming rfq.award", async () => {
    const who = await fx.actor("poOnly", ["rfq.view", "po.manage"]);
    const { rfq, q1 } = await threeQuoted();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      who,
    );
    expect(r.status).toBe(403);
    expect(r.json.key).toBe("rfq.award");
  });

  test("BR-RFQ-70 neither key -> 403 naming rfq.award first; no login -> 401", async () => {
    const who = await fx.actor("neither", ["rfq.view"]);
    const { rfq, q1 } = await threeQuoted();
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      who,
    );
    expect(r.status).toBe(403);
    expect(r.json.key).toBe("rfq.award");
    const anon = await fx.rfqApi("POST", `/${rfq.id}/award`, null, {
      lines: [],
    });
    expect(anon.status).toBe(401);
  });

  test("BR-RFQ-70 owner and super-admin can award", async () => {
    const a = await threeQuoted();
    expect(
      (
        await fx.award(
          a.rfq,
          [{ line: 0, quoteItemId: a.q1.quoteItemIds[0]! }],
          await fx.owner(),
        )
      ).status,
    ).toBe(201);
    const b = await threeQuoted();
    expect(
      (
        await fx.award(
          b.rfq,
          [{ line: 0, quoteItemId: b.q1.quoteItemIds[0]! }],
          await fx.superAdmin(),
        )
      ).status,
    ).toBe(201);
  });

  test("BR-RFQ-71 an award by owner stores the awarding user", async () => {
    const { rfq, q1 } = await threeQuoted();
    const who = await fx.owner();
    await fx.award(rfq, [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }], who);
    const l = (await lineRow(rfq.lineIds[0]!)) as unknown as {
      awardedBy: number;
    };
    expect(l.awardedBy).toBe(who.id);
  });

  test("BR-RFQ-72 two users award the same line at once: one 201 and one PO, the other 409", async () => {
    const { rfq, q1 } = await threeQuoted();
    const [a, b] = await Promise.all([
      fx.award(
        rfq,
        [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
        await fx.bo(),
      ),
      fx.award(
        rfq,
        [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
        await fx.owner(),
      ),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const made = await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.quoteItemId, q1.quoteItemIds[0]!));
    expect(made).toHaveLength(1);
    const links = await db
      .select()
      .from(prPoItemLinks)
      .where(eq(prPoItemLinks.prItemId, rfq.prItemIds[0]!));
    expect(links).toHaveLength(1);
  });

  test("BR-RFQ-70 award on an unknown RFQ -> 404", async () => {
    const r = await fx.rfqApi("POST", "/2000000000/award", await fx.bo(), {
      lines: [{ rfqItemId: 1, quoteItemId: 1 }],
    });
    expect(r.status).toBe(404);
  });
});
