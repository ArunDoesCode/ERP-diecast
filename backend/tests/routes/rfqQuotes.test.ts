/**
 * Quotes and comparison (BR-RFQ-12..24, 70..74 on quotes). Spec: docs/specs/rfq/spec.md (v1 frozen).
 * HTTP via createApp(), real DB. Fixtures TEST_rfqq_ prefixed (tests/helpers/rfqFixtures.ts).
 * Money caps follow the coordinator decision: rate and line value <= 1e13 paise (MAX_MONEY_PAISE), freight <= 1e12.
 */
import { afterAll, describe, expect, setSystemTime, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import {
  purchaseOrderItems,
  purchaseOrders,
} from "../../src/db/schemas/02_procurement-purchasing";
import { rfqQuotes } from "../../src/db/schemas/02_procurement-rfq";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { istDay, type Json, makeRfqFx } from "../helpers/rfqFixtures";

const fx = makeRfqFx("rfqq");
afterAll(() => fx.cleanup());

const quoteRow = async (id: number) => {
  const [r] = await db.select().from(rfqQuotes).where(eq(rfqQuotes.id, id));
  return r!;
};
const comparison = async (
  rfqId: number,
  who?: Awaited<ReturnType<typeof fx.bo>>,
) => fx.rfqApi("GET", `/${rfqId}/comparison`, who ?? (await fx.bo()));
const cell = (cmp: Json, rowIdx: number, supplierId: number) =>
  cmp.json.data.rows[rowIdx].cells.find(
    (c: { supplierId: number }) => c.supplierId === supplierId,
  );
const cancelQuote = async (
  quoteId: number,
  reason = "revised price",
  who?: Awaited<ReturnType<typeof fx.bo>>,
) =>
  fx.rfqApi("POST", `/quotes/${quoteId}/cancel`, who ?? (await fx.bo()), {
    reason,
  });

describe("BR-RFQ-12 quote changes need a live RFQ", () => {
  test("BR-RFQ-12 draft RFQ, enter quote -> 409 RFQ_INVALID_STATUS", async () => {
    const rfq = await fx.mkRfq({ send: false });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_INVALID_STATUS");
  });

  test("BR-RFQ-12 closed RFQ, submit a quote -> 409 RFQ_INVALID_STATUS", async () => {
    const rfq = await fx.mkRfq();
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    await fx.rfqApi("POST", `/${rfq.id}/close`, await fx.bo(), {
      reason: "no acceptable quote",
    });
    const r = await fx.rfqApi(
      "POST",
      `/quotes/${q.quoteId}/submit`,
      await fx.bo(),
      {},
    );
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_INVALID_STATUS");
  });

  test("BR-RFQ-12 closed RFQ, edit a quote -> 409 RFQ_INVALID_STATUS", async () => {
    const rfq = await fx.mkRfq();
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    await fx.rfqApi("POST", `/${rfq.id}/close`, await fx.bo(), {
      reason: "no acceptable quote",
    });
    const r = await fx.rfqApi(
      "PATCH",
      `/quotes/${q.quoteId}`,
      await fx.bo(),
      fx.quoteBody(rfq, null, { lines: [{ rate: 100 }] }),
    );
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_INVALID_STATUS");
  });

  test("BR-RFQ-12 supplier not on the RFQ -> 400 SUPPLIER_NOT_ON_RFQ", async () => {
    const rfq = await fx.mkRfq();
    const r = await fx.enterQuote(rfq, await fx.newSupplier());
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("SUPPLIER_NOT_ON_RFQ");
  });

  test("BR-RFQ-12 PATCH with a line of another RFQ -> 400 QUOTE_LINE_INVALID", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const other = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    const body = fx.quoteBody(rfq, null);
    (body.lines as { rfqItemId: number }[])[0]!.rfqItemId = other.lineIds[0]!;
    const r = await fx.rfqApi(
      "PATCH",
      `/quotes/${q.quoteId}`,
      await fx.bo(),
      body,
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_LINE_INVALID");
  });

  test("BR-RFQ-12 unknown quote -> 404", async () => {
    const r = await fx.rfqApi("GET", "/quotes/2000000000", await fx.bo());
    expect(r.status).toBe(404);
  });
});

describe("BR-RFQ-13 one live quote per supplier per RFQ", () => {
  test("BR-RFQ-13 a second quote while the first is submitted -> 409 QUOTE_EXISTS", async () => {
    const rfq = await fx.mkRfq();
    await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("QUOTE_EXISTS");
  });

  test("BR-RFQ-13 a second quote while the first is a draft -> 409 QUOTE_EXISTS", async () => {
    const rfq = await fx.mkRfq();
    await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("QUOTE_EXISTS");
  });

  test("BR-RFQ-13 after the old quote is cancelled a new one can be entered", async () => {
    const rfq = await fx.mkRfq();
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    expect((await cancelQuote(q.quoteId)).status).toBe(200);
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!);
    expect(r.status).toBe(201);
  });

  test("BR-RFQ-72 two quotes for the same supplier at once: one 201, one 409", async () => {
    const rfq = await fx.mkRfq();
    const [a, b] = await Promise.all([
      fx.enterQuote(rfq, rfq.supplierIds[0]!),
      fx.enterQuote(rfq, rfq.supplierIds[0]!),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });
});

describe("BR-RFQ-14 quote header", () => {
  test("BR-RFQ-14 valid-till before the quote date -> 400 QUOTE_DATES_INVALID", async () => {
    const rfq = await fx.mkRfq();
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      quoteDate: istDay(0),
      validTill: istDay(-1),
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_DATES_INVALID");
  });

  test("BR-RFQ-14 quote date tomorrow -> 400 QUOTE_DATES_INVALID", async () => {
    const rfq = await fx.mkRfq();
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      quoteDate: istDay(1),
      validTill: istDay(10),
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_DATES_INVALID");
  });

  test("BR-RFQ-14 valid-till is required -> 400", async () => {
    const rfq = await fx.mkRfq();
    const body = fx.quoteBody(rfq, rfq.supplierIds[0]!);
    delete body.validTill;
    const r = await fx.rfqApi("POST", `/${rfq.id}/quotes`, await fx.bo(), body);
    expect(r.status).toBe(400);
  });

  test("BR-RFQ-14 valid-till equal to the quote date is accepted", async () => {
    const rfq = await fx.mkRfq();
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      quoteDate: istDay(0),
      validTill: istDay(0),
    });
    expect(r.status).toBe(201);
  });

  test("BR-RFQ-14 supplier quote reference: empty and 101 characters -> 400, 100 -> 201", async () => {
    const rfq = await fx.mkRfq();
    const s = rfq.supplierIds[0]!;
    expect((await fx.enterQuote(rfq, s, { ref: "" })).status).toBe(400);
    expect((await fx.enterQuote(rfq, s, { ref: "x".repeat(101) })).status).toBe(
      400,
    );
    expect((await fx.enterQuote(rfq, s, { ref: "x".repeat(100) })).status).toBe(
      201,
    );
  });

  test("BR-RFQ-14 payment terms default to the supplier's default terms", async () => {
    const sup = await fx.newSupplier({ terms: 30 });
    const rfq = await fx.mkRfq({ supplierIds: [sup] });
    const r = await fx.enterQuote(rfq, sup);
    expect(r.status).toBe(201);
    expect(r.json.data.paymentTermsDays).toBe(30);
  });

  test("BR-RFQ-14 payment terms typed 0 stay 0; 365 ok; 366 -> 400", async () => {
    const sup = await fx.newSupplier({ terms: 30 });
    const rfq = await fx.mkRfq({ supplierIds: [sup] });
    const a = await fx.enterQuote(rfq, sup, { terms: 0 });
    expect(a.status).toBe(201);
    expect(a.json.data.paymentTermsDays).toBe(0);
    await cancelQuote(a.json.data.id);
    expect((await fx.enterQuote(rfq, sup, { terms: 365 })).status).toBe(201);
    const rfq2 = await fx.mkRfq({ supplierIds: [sup] });
    expect((await fx.enterQuote(rfq2, sup, { terms: 366 })).status).toBe(400);
  });
});

describe("BR-RFQ-15 quote lines", () => {
  test("BR-RFQ-15 a priced line is saved with rate, GST, lead days and freight", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1, qtys: [1000] });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 24500, gst: 18, lead: 7, freight: 200000 }],
    });
    expect(r.status).toBe(201);
    const l = r.json.data.lines[0];
    expect(l.isQuoted).toBe(true);
    expect(l.ratePaise).toBe(24500);
    expect(Number(l.gstPercent)).toBe(18);
    expect(l.leadDays).toBe(7);
    expect(l.freightPaise).toBe(200000);
  });

  test("BR-RFQ-15 rate 0 -> 400 QUOTE_LINE_INVALID", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 0 }],
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_LINE_INVALID");
  });

  test("BR-RFQ-15 GST 17 is not a slab -> 400 QUOTE_LINE_INVALID", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ gst: 17 }],
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_LINE_INVALID");
  });

  test("BR-RFQ-15 priced with no rate -> 400 QUOTE_LINE_INVALID", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const body = fx.quoteBody(rfq, rfq.supplierIds[0]!);
    delete (body.lines as Record<string, unknown>[])[0]!.ratePaise;
    const r = await fx.rfqApi("POST", `/${rfq.id}/quotes`, await fx.bo(), body);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_LINE_INVALID");
  });

  test("BR-RFQ-15 a 'not quoted' line is saved without value fields; a missing line counts as not quoted", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1, qtys: [10, 20] });
    const body = fx.quoteBody(rfq, rfq.supplierIds[0]!, {
      lines: [{}, { quoted: false }],
    });
    const r = await fx.rfqApi("POST", `/${rfq.id}/quotes`, await fx.bo(), body);
    expect(r.status).toBe(201);
    const nq = r.json.data.lines.find(
      (l: Json) => l.rfqItemId === rfq.lineIds[1],
    );
    expect(nq.isQuoted).toBe(false);
    expect(nq.ratePaise).toBeNull();
    expect(nq.lineValuePaise).toBeNull();

    const rfq2 = await fx.mkRfq({ suppliers: 1, qtys: [10, 20] });
    const body2 = fx.quoteBody(rfq2, rfq2.supplierIds[0]!);
    (body2.lines as unknown[]).pop();
    const r2 = await fx.rfqApi(
      "POST",
      `/${rfq2.id}/quotes`,
      await fx.bo(),
      body2,
    );
    expect(r2.status).toBe(201);
    const missing = r2.json.data.lines.find(
      (l: Json) => l.rfqItemId === rfq2.lineIds[1],
    );
    expect(missing.isQuoted).toBe(false);
  });

  test("BR-RFQ-15 lead days 366, negative freight, the same line twice -> 400", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const s = rfq.supplierIds[0]!;
    const lead = await fx.enterQuote(rfq, s, { lines: [{ lead: 366 }] });
    expect(lead.status).toBe(400);
    const frt = await fx.enterQuote(rfq, s, { lines: [{ freight: -1 }] });
    expect(frt.status).toBe(400);
    const body = fx.quoteBody(rfq, s);
    const ls = body.lines as unknown[];
    ls.push(ls[0]);
    const dup = await fx.rfqApi(
      "POST",
      `/${rfq.id}/quotes`,
      await fx.bo(),
      body,
    );
    expect(dup.status).toBe(400);
    expect(dup.json.code).toBe("QUOTE_LINE_INVALID");
  });

  test("BR-RFQ-15 GST defaults to 0 and freight to 0 when left out (no supplier price list)", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const body = fx.quoteBody(rfq, rfq.supplierIds[0]!);
    const l = (body.lines as Record<string, unknown>[])[0]!;
    delete l.gstPercent;
    delete l.freightPaise;
    const r = await fx.rfqApi("POST", `/${rfq.id}/quotes`, await fx.bo(), body);
    expect(r.status).toBe(201);
    expect(Number(r.json.data.lines[0].gstPercent)).toBe(0);
    expect(r.json.data.lines[0].freightPaise).toBe(0);
  });

  test("BR-RFQ-15 PATCH replaces the lines of a draft quote", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    const r = await fx.rfqApi(
      "PATCH",
      `/quotes/${q.quoteId}`,
      await fx.bo(),
      fx.quoteBody(rfq, null, { lines: [{ rate: 30000 }] }),
    );
    expect(r.status).toBe(200);
    expect(r.json.data.lines[0].ratePaise).toBe(30000);
  });
});

describe("BR-RFQ-16 values are computed, never typed", () => {
  test("BR-RFQ-16 1000 kg x 24,500 with freight 2,00,000 -> value, tax and landed rate", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1, qtys: [1000] });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 24500, gst: 18, freight: 200000 }],
    });
    const l = r.json.data.lines[0];
    expect(l.lineValuePaise).toBe(24_500_000);
    expect(l.lineTaxPaise).toBe(4_410_000);
    expect(l.landedRatePaise).toBe(24700);
  });

  test("BR-RFQ-16 rounding: 3 kg x 1001, GST 18, freight 10 -> value 3003, tax 541, landed 1004", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1, qtys: [3] });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 1001, gst: 18, freight: 10 }],
    });
    const l = r.json.data.lines[0];
    expect(l.lineValuePaise).toBe(3003);
    expect(l.lineTaxPaise).toBe(541);
    expect(l.landedRatePaise).toBe(1004);
  });

  test("BR-RFQ-16 a typed value, tax or landed field -> 400", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    for (const f of ["lineValuePaise", "lineTaxPaise", "landedRatePaise"]) {
      const body = fx.quoteBody(rfq, rfq.supplierIds[0]!);
      (body.lines as Record<string, unknown>[])[0]![f] = 1;
      const r = await fx.rfqApi(
        "POST",
        `/${rfq.id}/quotes`,
        await fx.bo(),
        body,
      );
      expect(r.status).toBe(400);
    }
  });

  test("BR-RFQ-73 a fractional rate 245.5 -> 400, nothing saved", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 245.5 }],
    });
    expect(r.status).toBe(400);
    const rows = await db
      .select()
      .from(rfqQuotes)
      .where(eq(rfqQuotes.rfqId, rfq.id));
    expect(rows).toEqual([]);
  });
});

describe("BR-RFQ-74 money limits on quotes", () => {
  test("BR-RFQ-74 freight 1,000,000,000,001 -> 400 AMOUNT_TOO_LARGE, nothing saved", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ freight: 1_000_000_000_001 }],
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("AMOUNT_TOO_LARGE");
    const rows = await db
      .select()
      .from(rfqQuotes)
      .where(eq(rfqQuotes.rfqId, rfq.id));
    expect(rows).toEqual([]);
  });

  test("BR-RFQ-74 freight exactly 1,000,000,000,000 is accepted", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ freight: 1_000_000_000_000 }],
    });
    expect(r.status).toBe(201);
  });

  test("BR-RFQ-74 line value above 1e13 paise (1000 kg x 10,000,000,001) -> 400 AMOUNT_TOO_LARGE", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1, qtys: [1000] });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 10_000_000_001 }],
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("AMOUNT_TOO_LARGE");
  });

  test("BR-RFQ-74 line value exactly 1e13 paise (1000 kg x 10,000,000,000) is accepted", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1, qtys: [1000] });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 10_000_000_000 }],
    });
    expect(r.status).toBe(201);
    expect(r.json.data.lines[0].lineValuePaise).toBe(10_000_000_000_000);
  });

  test("BR-RFQ-74 rate above 1e13 paise -> 400", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1, qtys: [1] });
    const r = await fx.enterQuote(rfq, rfq.supplierIds[0]!, {
      lines: [{ rate: 10_000_000_000_001 }],
    });
    expect(r.status).toBe(400);
  });
});

describe("BR-RFQ-17 late is judged at submit", () => {
  test("BR-RFQ-17 typed before the due date, submitted two days after it -> submitted and late", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1, dueInDays: 2 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    setSystemTime(new Date(Date.now() + 4 * 86400000));
    try {
      const r = await fx.rfqApi(
        "POST",
        `/quotes/${q.quoteId}/submit`,
        await fx.bo(),
        {},
      );
      expect(r.status).toBe(200);
      expect(r.json.data.status).toBe("submitted");
      expect(r.json.data.isLate).toBe(true);
    } finally {
      setSystemTime();
    }
  });

  test("BR-RFQ-17 submitted on the due day -> not late", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1, dueInDays: 2 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    setSystemTime(new Date(Date.now() + 2 * 86400000));
    try {
      const r = await fx.rfqApi(
        "POST",
        `/quotes/${q.quoteId}/submit`,
        await fx.bo(),
        {},
      );
      expect(r.status).toBe(200);
      expect(r.json.data.isLate).toBe(false);
    } finally {
      setSystemTime();
    }
  });
});

describe("BR-RFQ-18 submit freezes a quote", () => {
  test("BR-RFQ-18 submit stores who and when (BR-RFQ-71)", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const who = await fx.bo();
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    const r = await fx.rfqApi("POST", `/quotes/${q.quoteId}/submit`, who, {});
    expect(r.status).toBe(200);
    const row = await quoteRow(q.quoteId);
    expect(row.status).toBe("submitted");
    expect(row.submittedBy).toBe(who.id);
    expect(row.submittedAt).not.toBeNull();
  });

  test("BR-RFQ-18 every line 'not quoted', submit -> 400 QUOTE_EMPTY", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, {
      submit: false,
      lines: [{ quoted: false }],
    });
    const r = await fx.rfqApi(
      "POST",
      `/quotes/${q.quoteId}/submit`,
      await fx.bo(),
      {},
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_EMPTY");
    expect((await quoteRow(q.quoteId)).status).toBe("draft");
  });

  test("BR-RFQ-18 a submitted quote cannot be edited -> 409 QUOTE_NOT_EDITABLE, rate unchanged", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    const r = await fx.rfqApi(
      "PATCH",
      `/quotes/${q.quoteId}`,
      await fx.bo(),
      fx.quoteBody(rfq, null, { lines: [{ rate: 1 }] }),
    );
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("QUOTE_NOT_EDITABLE");
    const d = await fx.rfqApi("GET", `/quotes/${q.quoteId}`, await fx.bo());
    expect(d.json.data.lines[0].ratePaise).toBe(24500);
  });

  test("BR-RFQ-18 submitting a submitted quote -> 409 QUOTE_NOT_EDITABLE", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    const r = await fx.rfqApi(
      "POST",
      `/quotes/${q.quoteId}/submit`,
      await fx.bo(),
      {},
    );
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("QUOTE_NOT_EDITABLE");
  });
});

describe("BR-RFQ-19 cancel a quote", () => {
  test("BR-RFQ-19 cancel a draft with a reason stores who, when, why (BR-RFQ-71)", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const who = await fx.bo();
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    const r = await cancelQuote(q.quoteId, "revised price", who);
    expect(r.status).toBe(200);
    const row = await quoteRow(q.quoteId);
    expect(row.status).toBe("cancelled");
    expect(row.cancelledBy).toBe(who.id);
    expect(row.cancelledAt).not.toBeNull();
    expect(row.cancelReason).toBe("revised price");
  });

  test("BR-RFQ-19 cancel a submitted quote (rfq.manage and rfq.award) -> 200", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    const r = await cancelQuote(q.quoteId);
    expect(r.status).toBe(200);
    expect((await quoteRow(q.quoteId)).status).toBe("cancelled");
  });

  test("BR-RFQ-19 cancel a submitted quote with rfq.manage but not rfq.award -> 403 naming rfq.award", async () => {
    const who = await fx.actor("mgr", ["rfq.view", "rfq.manage"]);
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    const r = await cancelQuote(q.quoteId, "revised price", who);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
    expect(r.json.key).toBe("rfq.award");
    expect((await quoteRow(q.quoteId)).status).toBe("submitted");
  });

  test("BR-RFQ-19 cancel a draft with rfq.manage only is allowed", async () => {
    const who = await fx.actor("mgr", ["rfq.view", "rfq.manage"]);
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    const r = await cancelQuote(q.quoteId, "revised price", who);
    expect(r.status).toBe(200);
  });

  test("BR-RFQ-19 already cancelled -> 409 QUOTE_INVALID_STATUS", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    await cancelQuote(q.quoteId);
    const r = await cancelQuote(q.quoteId);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("QUOTE_INVALID_STATUS");
  });

  test("BR-RFQ-19 reason of 2 characters -> 400, quote unchanged", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    const r = await cancelQuote(q.quoteId, "ab");
    expect(r.status).toBe(400);
    expect((await quoteRow(q.quoteId)).status).toBe("submitted");
  });

  test("BR-RFQ-72 two cancels of one quote at once: one 200, one 409", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    const [a, b] = await Promise.all([
      cancelQuote(q.quoteId),
      cancelQuote(q.quoteId),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });
});

describe("BR-RFQ-20..24 comparison", () => {
  async function priceThree(opts: { sameLanded?: boolean } = {}) {
    const rfq = await fx.mkRfq({ qtys: [1000] });
    const [s1, s2, s3] = rfq.supplierIds as [number, number, number];
    await fx.mkQuote(rfq, s1, {
      lines: [{ rate: 24500, freight: 200000, lead: 7 }],
    });
    await fx.mkQuote(rfq, s2, {
      lines: opts.sameLanded
        ? [{ rate: 24200, freight: 500000, lead: 10 }]
        : [{ rate: 24300, freight: 500000, lead: 10 }],
    });
    await fx.mkQuote(rfq, s3, {
      lines: [{ rate: 25000, freight: 0, lead: 5 }],
    });
    return { rfq, s1, s2, s3 };
  }

  test("BR-RFQ-20 every supplier of the RFQ is shown on every line with its values", async () => {
    const { rfq, s1, s2, s3 } = await priceThree();
    const c = await comparison(rfq.id);
    expect(c.status).toBe(200);
    expect(c.json.data.rows).toHaveLength(1);
    expect(c.json.data.rows[0].cells).toHaveLength(3);
    const a = cell(c, 0, s1);
    expect(a.state).toBe("priced");
    expect(a.ratePaise).toBe(24500);
    expect(Number(a.gstPercent)).toBe(18);
    expect(a.freightPaise).toBe(200000);
    expect(a.landedRatePaise).toBe(24700);
    expect(a.leadDays).toBe(7);
    expect(a.validTill).toBe(istDay(30));
    expect(a.paymentTermsDays).toBe(0);
    expect(a.isLate).toBe(false);
    expect(cell(c, 0, s2).landedRatePaise).toBe(24800);
    expect(cell(c, 0, s3).landedRatePaise).toBe(25000);
  });

  test("BR-RFQ-21 lowest is by landed rate: S1 24,700 beats S2 (cheapest rate, landed 24,800)", async () => {
    const { rfq, s1, s2, s3 } = await priceThree();
    const c = await comparison(rfq.id);
    expect(cell(c, 0, s1).isLowest).toBe(true);
    expect(cell(c, 0, s2).isLowest).toBe(false);
    expect(cell(c, 0, s3).isLowest).toBe(false);
  });

  test("BR-RFQ-22 an expired quote is greyed 'expired' and does not compete", async () => {
    const rfq = await fx.mkRfq({ qtys: [1000], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    await fx.mkQuote(rfq, s1, {
      quoteDate: istDay(-5),
      validTill: istDay(-1),
      lines: [{ rate: 20000 }],
    });
    await fx.mkQuote(rfq, s2, { lines: [{ rate: 24000 }] });
    const c = await comparison(rfq.id);
    expect(cell(c, 0, s1).state).toBe("expired");
    expect(cell(c, 0, s1).eligible).toBe(false);
    expect(cell(c, 0, s1).isLowest).toBe(false);
    expect(cell(c, 0, s2).isLowest).toBe(true);
  });

  test("BR-RFQ-22 a deactivated supplier is 'inactive' and does not compete", async () => {
    const rfq = await fx.mkRfq({ qtys: [1000], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    await fx.mkQuote(rfq, s1, { lines: [{ rate: 20000 }] });
    await fx.mkQuote(rfq, s2, { lines: [{ rate: 24000 }] });
    await db
      .update(supplierMaster)
      .set({ isActive: false })
      .where(eq(supplierMaster.id, s1));
    const c = await comparison(rfq.id);
    expect(cell(c, 0, s1).state).toBe("inactive");
    expect(cell(c, 0, s1).isLowest).toBe(false);
    expect(cell(c, 0, s2).isLowest).toBe(true);
  });

  test("BR-RFQ-22 a 'not quoted' line does not compete and shows not_quoted", async () => {
    const rfq = await fx.mkRfq({ qtys: [10, 10], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    await fx.mkQuote(rfq, s1, { lines: [{ rate: 100 }, { quoted: false }] });
    await fx.mkQuote(rfq, s2, { lines: [{ rate: 200 }, { rate: 300 }] });
    const c = await comparison(rfq.id);
    expect(cell(c, 1, s1).state).toBe("not_quoted");
    expect(cell(c, 1, s2).isLowest).toBe(true);
    expect(cell(c, 0, s1).isLowest).toBe(true);
  });

  test("BR-RFQ-23 a tie on landed rate goes to fewer lead days", async () => {
    const rfq = await fx.mkRfq({ qtys: [1000], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    await fx.mkQuote(rfq, s2, { lines: [{ rate: 24700, lead: 10 }] });
    await fx.mkQuote(rfq, s1, { lines: [{ rate: 24700, lead: 7 }] });
    const c = await comparison(rfq.id);
    expect(cell(c, 0, s1).isLowest).toBe(true);
    expect(cell(c, 0, s2).isLowest).toBe(false);
  });

  test("BR-RFQ-23 a tie on landed rate and lead days goes to the earlier submit", async () => {
    const rfq = await fx.mkRfq({ qtys: [1000], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    await fx.mkQuote(rfq, s2, { lines: [{ rate: 24700, lead: 7 }] });
    await new Promise((r) => setTimeout(r, 20));
    await fx.mkQuote(rfq, s1, { lines: [{ rate: 24700, lead: 7 }] });
    const c = await comparison(rfq.id);
    expect(cell(c, 0, s2).isLowest).toBe(true);
    expect(cell(c, 0, s1).isLowest).toBe(false);
  });

  test("BR-RFQ-24 a draft quote is not shown: 'no_quote'", async () => {
    const rfq = await fx.mkRfq({ qtys: [1000], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    await fx.mkQuote(rfq, s1, { lines: [{ rate: 24000 }] });
    await fx.mkQuote(rfq, s2, { lines: [{ rate: 20000 }], submit: false });
    const c = await comparison(rfq.id);
    expect(cell(c, 0, s2).state).toBe("no_quote");
    expect(cell(c, 0, s2).ratePaise).toBeNull();
    expect(cell(c, 0, s1).isLowest).toBe(true);
  });

  test("BR-RFQ-24 a cancelled quote never competes and is listed with who, when and why", async () => {
    const rfq = await fx.mkRfq({ qtys: [1000], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    const who = await fx.bo();
    const q1 = await fx.mkQuote(rfq, s1, { lines: [{ rate: 20000 }] });
    await fx.mkQuote(rfq, s2, { lines: [{ rate: 24000 }] });
    await cancelQuote(q1.quoteId, "revised price", who);
    const c = await comparison(rfq.id);
    expect(cell(c, 0, s1).state).toBe("no_quote");
    expect(cell(c, 0, s1).ratePaise).toBeNull();
    expect(cell(c, 0, s2).isLowest).toBe(true);
    expect(c.json.data.cancelledQuotes).toEqual([
      expect.objectContaining({
        quoteId: q1.quoteId,
        supplierId: s1,
        cancelledBy: who.id,
        cancelReason: "revised price",
      }),
    ]);
    expect(c.json.data.cancelledQuotes[0].cancelledAt).toBeTruthy();
  });

  test("BR-RFQ-20 last PO rate and contract rate shown to po.manage / contract.view holders", async () => {
    const rfq = await fx.mkRfq({ qtys: [1000], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    const contract = await fx.mkContract({
      supplierId: s1,
      items: [{ itemId: rfq.itemIds[0]!, rate: 24400 }],
    });
    // last PO rate for the item: an earlier approved-or-later PO line
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        poNumber: fx.uid(),
        supplierId: s2,
        status: "dispatched",
        createdBy: (await fx.owner()).id,
      })
      .returning({ id: purchaseOrders.id });
    await db.insert(purchaseOrderItems).values({
      poId: po!.id,
      itemId: rfq.itemIds[0]!,
      qty: 10,
      receivedQty: 0,
      unitPricePaise: 24300,
      gstPercent: 18,
      uom: "kg",
    });
    await fx.mkQuote(rfq, s1);
    for (const who of [await fx.bo(), await fx.owner()]) {
      const c = await comparison(rfq.id, who);
      const row = c.json.data.rows[0];
      expect(row.lastPoRatePaise).toBe(24300);
      expect(row.contract).toEqual([
        expect.objectContaining({
          supplierId: s1,
          contractNumber: contract.contractNumber,
          ratePaise: 24400,
        }),
      ]);
    }
    const onlyPo = await fx.actor("poOnly", ["rfq.view", "po.manage"]);
    const c1 = await comparison(rfq.id, onlyPo);
    expect(c1.json.data.rows[0].lastPoRatePaise).toBe(24300);
    const onlyContract = await fx.actor("cOnly", ["rfq.view", "contract.view"]);
    const c2 = await comparison(rfq.id, onlyContract);
    expect(c2.json.data.rows[0].contract).toHaveLength(1);
  });

  test("BR-RFQ-20 a user with rfq.view only sees quotes but no last PO rate and no contract rate", async () => {
    const rfq = await fx.mkRfq({ qtys: [1000], suppliers: 1 });
    await fx.mkContract({
      supplierId: rfq.supplierIds[0]!,
      items: [{ itemId: rfq.itemIds[0]!, rate: 24400 }],
    });
    await fx.mkQuote(rfq, rfq.supplierIds[0]!);
    const who = await fx.actor("viewer", ["rfq.view"]);
    const c = await comparison(rfq.id, who);
    expect(c.status).toBe(200);
    expect(cell(c, 0, rfq.supplierIds[0]!).ratePaise).toBe(24500);
    const row = c.json.data.rows[0];
    expect(row.lastPoRatePaise).toBeUndefined();
    expect(row.contract).toBeUndefined();
    const d = await fx.rfqApi("GET", `/getrfqdetails/${rfq.id}`, who);
    expect(d.status).toBe(200);
    expect(d.json.data.lineRates).toBeUndefined();
  });

  test("BR-RFQ-70 floor supervisor opens the comparison -> 403", async () => {
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const r = await comparison(rfq.id, await fx.floor());
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("PERMISSION_DENIED");
  });

  test("BR-RFQ-20 comparison of an unknown RFQ -> 404", async () => {
    expect((await comparison(2_000_000_000)).status).toBe(404);
  });
});

describe("BR-RFQ-70 quote endpoints are guarded", () => {
  test("BR-RFQ-70 rfq.view only: can read a quote, cannot enter, edit, submit", async () => {
    const who = await fx.actor("viewer", ["rfq.view"]);
    const rfq = await fx.mkRfq({ suppliers: 1 });
    const q = await fx.mkQuote(rfq, rfq.supplierIds[0]!, { submit: false });
    expect((await fx.rfqApi("GET", `/quotes/${q.quoteId}`, who)).status).toBe(
      200,
    );
    expect(
      (
        await fx.rfqApi(
          "POST",
          `/${rfq.id}/quotes`,
          who,
          fx.quoteBody(rfq, rfq.supplierIds[0]!),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await fx.rfqApi(
          "PATCH",
          `/quotes/${q.quoteId}`,
          who,
          fx.quoteBody(rfq, null),
        )
      ).status,
    ).toBe(403);
    expect(
      (await fx.rfqApi("POST", `/quotes/${q.quoteId}/submit`, who, {})).status,
    ).toBe(403);
    expect((await quoteRow(q.quoteId)).status).toBe("draft");
  });
});

describe("A-44 quote lines on RFQ lines already awarded", () => {
  async function partlyAwarded() {
    const rfq = await fx.mkRfq({ qtys: [10, 20], suppliers: 2 });
    const [s1, s2] = rfq.supplierIds as [number, number];
    const q1 = await fx.mkQuote(rfq, s1, {
      lines: [{ rate: 100 }, { rate: 100 }],
    });
    const who = await fx.bo();
    const a = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q1.quoteItemIds[0]! }],
      who,
    );
    expect(a.status).toBe(201);
    return { rfq, s2, who };
  }

  test("A-44 a quote may price an awarded line: saved", async () => {
    const { rfq, s2 } = await partlyAwarded();
    const r = await fx.enterQuote(rfq, s2, {
      lines: [{ rate: 90 }, { rate: 90 }],
    });
    expect(r.status).toBe(201);
    expect(r.json.data.lines).toHaveLength(2);
  });

  test("A-44 a quote line on an awarded line is never award-eligible", async () => {
    const { rfq, s2, who } = await partlyAwarded();
    const q2 = await fx.mkQuote(rfq, s2, {
      lines: [{ rate: 90 }, { rate: 90 }],
    });
    const r = await fx.award(
      rfq,
      [{ line: 0, quoteItemId: q2.quoteItemIds[0]! }],
      who,
    );
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("RFQ_LINE_AWARDED");
  });

  test("BR-RFQ-18 a quote whose only priced line is an awarded line cannot be submitted -> 400 QUOTE_EMPTY", async () => {
    const { rfq, s2 } = await partlyAwarded();
    const q = await fx.mkQuote(rfq, s2, {
      submit: false,
      lines: [{ rate: 90 }, { quoted: false }],
    });
    const r = await fx.rfqApi(
      "POST",
      `/quotes/${q.quoteId}/submit`,
      await fx.bo(),
      {},
    );
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("QUOTE_EMPTY");
    expect((await quoteRow(q.quoteId)).status).toBe("draft");
  });

  test("BR-RFQ-18 a quote that also prices a still-open line can be submitted", async () => {
    const { rfq, s2 } = await partlyAwarded();
    const q = await fx.mkQuote(rfq, s2, {
      submit: false,
      lines: [{ rate: 90 }, { rate: 90 }],
    });
    const r = await fx.rfqApi(
      "POST",
      `/quotes/${q.quoteId}/submit`,
      await fx.bo(),
      {},
    );
    expect(r.status).toBe(200);
  });
});
