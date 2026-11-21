/**
 * Supplier rating measures via GET /api/supplier-rating/:id/card
 * (BR-SRT-01..24, 30, 32, 33, 36, 42-period rules). Spec: docs/specs/supplier-rating/spec.md v1.
 * Real DB, full app. Fixtures TEST_srt_ prefixed, one fresh supplier per test, removed in afterAll.
 * Percent values are integer tenths (800 = 80.0 %); null = "No data".
 */
import { afterAll, describe, expect, test } from "bun:test";
import { istDay, makeRatingFx } from "../helpers/ratingFixtures";

const fx = makeRatingFx("srt");
afterAll(() => fx.cleanup());

const sup = () => fx.newSupplier();

describe("on-time delivery", () => {
  test("BR-SRT-03 over-delivery counts as one on-time line, never above 100 %", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-30),
      lines: [{ qty: 1000 }],
      grns: [{ day: istDay(-35), lines: [{ line: 0, recv: 1200 }] }],
    });
    const c = await fx.card(s);
    expect(c.onTime.lines).toBe(1);
    expect(c.onTime.onTimeLines).toBe(1);
    expect(c.onTime.pctTenths).toBe(1000);
  });

  for (const status of ["draft", "pending_approval", "approved"] as const) {
    test(`BR-SRT-04 a ${status} PO with a past due date is ignored`, async () => {
      const s = await sup();
      await fx.mkPo(s, {
        status,
        due: istDay(-20),
        sentRecord: false,
        lines: [{}],
      });
      const c = await fx.card(s);
      expect(c.onTime.lines).toBe(0);
      expect(c.onTime.pctTenths).toBeNull();
    });
  }

  test("BR-SRT-04 a cancelled PO that was never sent is ignored", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      status: "cancelled",
      due: istDay(-20),
      cancelledDay: istDay(-10),
      sentRecord: false,
      lines: [{}],
    });
    const c = await fx.card(s);
    expect(c.onTime.lines).toBe(0);
    expect(c.onTime.cancelledAfterDispatchCount).toBe(0);
  });

  test("BR-SRT-04 a dispatched PO counts", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      status: "dispatched",
      due: istDay(-5),
      lines: [{}],
    });
    expect((await fx.card(s)).onTime.lines).toBe(1);
  });

  test("BR-SRT-04 / A-42 a PO cancelled after dispatch, after its due date, is late and counted", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      status: "cancelled",
      due: istDay(-20),
      cancelledDay: istDay(-10),
      lines: [{}],
    });
    const c = await fx.card(s);
    expect(c.onTime.lines).toBe(1);
    expect(c.onTime.lateLines).toBe(1);
    expect(c.onTime.cancelledAfterDispatchCount).toBe(1);
    expect(c.onTime.pctTenths).toBe(0);
  });

  test("BR-SRT-04 / A-42 a PO cancelled after dispatch but before its due date is not late", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      status: "cancelled",
      due: istDay(-10),
      cancelledDay: istDay(-20),
      lines: [{}],
    });
    const c = await fx.card(s);
    expect(c.onTime.lateLines).toBe(0);
  });

  test("BR-SRT-05 the original due date is used, a revised date is never used", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-20),
      revised: istDay(-10),
      lines: [{}],
      grns: [{ day: istDay(-15), lines: [{ line: 0, recv: 1000 }] }],
    });
    const c = await fx.card(s);
    expect(c.onTime.lateLines).toBe(1);
    expect(c.onTime.onTimeLines).toBe(0);
  });

  test("BR-SRT-06 complete on the due date is on time", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-20),
      lines: [{}],
      grns: [{ day: istDay(-20), lines: [{ line: 0, recv: 1000 }] }],
    });
    expect((await fx.card(s)).onTime.onTimeLines).toBe(1);
  });

  test("BR-SRT-06 complete one day after the due date is late (no grace)", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-20),
      lines: [{}],
      grns: [{ day: istDay(-19), lines: [{ line: 0, recv: 1000 }] }],
    });
    const c = await fx.card(s);
    expect(c.onTime.lateLines).toBe(1);
    expect(c.onTime.onTimeLines).toBe(0);
  });

  test("BR-SRT-06 arriving early is on time", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-20),
      lines: [{}],
      grns: [{ day: istDay(-29), lines: [{ line: 0, recv: 1000 }] }],
    });
    expect((await fx.card(s)).onTime.onTimeLines).toBe(1);
  });

  test("BR-SRT-07 two GRNs: the GRN that completes the quantity decides (late by the second)", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-25),
      lines: [{ qty: 1000 }],
      grns: [
        { day: istDay(-30), lines: [{ line: 0, recv: 600 }] },
        { day: istDay(-20), lines: [{ line: 0, recv: 400 }] },
      ],
    });
    const c = await fx.card(s);
    expect(c.onTime.lateLines).toBe(1);
    expect(c.onTime.onTimeLines).toBe(0);
    const l = await fx.lines(s, "measure=on_time");
    expect(l.json.data[0].completionDate).toBe(istDay(-20));
    expect(l.json.data[0].daysLate).toBe(5);
  });

  test("BR-SRT-07 a draft GRN still completes the line (on time)", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-20),
      lines: [{}],
      grns: [
        {
          day: istDay(-25),
          status: "draft",
          lines: [{ line: 0, recv: 1000, qa: "pending" }],
        },
      ],
    });
    expect((await fx.card(s)).onTime.onTimeLines).toBe(1);
  });

  test("BR-SRT-07 a GRN received on time but QA decided later is on time", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-20),
      lines: [{}],
      grns: [
        {
          day: istDay(-22),
          status: "pending_qa",
          lines: [{ line: 0, recv: 1000, qa: "pending" }],
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.onTime.onTimeLines).toBe(1);
    expect(c.rejection.pctTenths).toBeNull();
  });

  test("BR-SRT-07 rejected qty still counts toward completing the line", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-20),
      lines: [{ qty: 1000 }],
      grns: [{ day: istDay(-25), lines: [{ line: 0, recv: 1000, rej: 200 }] }],
    });
    expect((await fx.card(s)).onTime.onTimeLines).toBe(1);
  });

  test("BR-SRT-02 the GRN arrival day is the IST day (00:30 IST is the previous UTC day)", async () => {
    const s = await sup();
    // received at 19:00 UTC on IST day -31 = 00:30 IST on IST day -30; due -31 -> late by 1 day
    await fx.mkPo(s, {
      due: istDay(-31),
      lines: [{}],
      grns: [
        {
          at: new Date(`${istDay(-31)}T19:00:00.000Z`),
          lines: [{ line: 0, recv: 1000 }],
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.onTime.lateLines).toBe(1);
    const l = await fx.lines(s, "measure=on_time");
    expect(l.json.data[0].completionDate).toBe(istDay(-30));
  });

  test("BR-SRT-08 a line past its due date with nothing arrived is late and open", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      status: "dispatched",
      due: istDay(-10),
      lines: [{}],
    });
    const c = await fx.card(s);
    expect(c.onTime.lines).toBe(1);
    expect(c.onTime.lateLines).toBe(1);
    expect(c.onTime.openLateLines).toBe(1);
  });

  test("BR-SRT-08 a line due yesterday with nothing arrived is already late", async () => {
    const s = await sup();
    await fx.mkPo(s, { status: "dispatched", due: istDay(-1), lines: [{}] });
    expect((await fx.card(s)).onTime.openLateLines).toBe(1);
  });

  test("BR-SRT-08 a line due today with nothing arrived is not judged yet", async () => {
    const s = await sup();
    await fx.mkPo(s, { status: "dispatched", due: istDay(0), lines: [{}] });
    const c = await fx.card(s);
    expect(c.onTime.lines).toBe(0);
    expect(c.onTime.pctTenths).toBeNull();
  });

  test("BR-SRT-08 a line that arrives after its due date stays late", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-10),
      lines: [{}],
      grns: [{ day: istDay(-2), lines: [{ line: 0, recv: 1000 }] }],
    });
    const c = await fx.card(s);
    expect(c.onTime.lateLines).toBe(1);
    expect(c.onTime.openLateLines).toBe(0);
  });

  test("BR-SRT-09 a short-closed line closed on or before the due date is on time", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      status: "closed",
      due: istDay(-20),
      shortClosed: true,
      closedDay: istDay(-21),
      lines: [{ qty: 1000 }],
      grns: [{ day: istDay(-25), lines: [{ line: 0, recv: 700 }] }],
    });
    const c = await fx.card(s);
    expect(c.onTime.onTimeLines).toBe(1);
    expect(c.onTime.shortClosedLateCount).toBe(0);
  });

  test("BR-SRT-09 a short-closed line closed after the due date is late and counted", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      status: "closed",
      due: istDay(-20),
      shortClosed: true,
      closedDay: istDay(-15),
      lines: [{ qty: 1000 }],
      grns: [{ day: istDay(-25), lines: [{ line: 0, recv: 700 }] }],
    });
    const c = await fx.card(s);
    expect(c.onTime.lateLines).toBe(1);
    expect(c.onTime.shortClosedLateCount).toBe(1);
    const l = await fx.lines(s, "measure=on_time");
    expect(l.json.data[0].state).toBe("short_closed");
    expect(l.json.data[0].daysLate).toBe(5);
  });

  test("BR-SRT-09 a short-closed line with nothing delivered, closed after due, is late", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      status: "closed",
      due: istDay(-20),
      shortClosed: true,
      closedDay: istDay(-12),
      lines: [{}],
    });
    expect((await fx.card(s)).onTime.lateLines).toBe(1);
  });

  test("BR-SRT-10 on-time % is on-time lines over judged lines, 1 decimal (2 of 3 = 66.7)", async () => {
    const s = await sup();
    await fx.delivered(s, 2, { due: istDay(-30), recv: istDay(-35) });
    await fx.delivered(s, 1, { due: istDay(-30), recv: istDay(-25) });
    const c = await fx.card(s);
    expect(c.onTime.lines).toBe(3);
    expect(c.onTime.pctTenths).toBe(667);
  });

  test("BR-SRT-10 on-time % rounds half up (1 of 16 = 6.25 -> 6.3)", async () => {
    const s = await sup();
    await fx.delivered(s, 1, { due: istDay(-30), recv: istDay(-35) });
    await fx.delivered(s, 15, { due: istDay(-30), recv: istDay(-25) });
    expect((await fx.card(s)).onTime.pctTenths).toBe(63);
  });

  test("BR-SRT-10 8 of 10 judged lines on time = 80.0 %", async () => {
    const s = await sup();
    await fx.delivered(s, 8, { due: istDay(-30), recv: istDay(-35) });
    await fx.delivered(s, 2, { due: istDay(-30), recv: istDay(-25) });
    const c = await fx.card(s);
    expect(c.onTime.pctTenths).toBe(800);
    expect(c.onTime.onTimeLines).toBe(8);
    expect(c.onTime.lateLines).toBe(2);
  });

  test("BR-SRT-10 a line completed before the 12-month window is not judged", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-410),
      created: istDay(-420),
      lines: [{}],
      grns: [{ day: istDay(-400), lines: [{ line: 0, recv: 1000 }] }],
    });
    const c = await fx.card(s);
    expect(c.onTime.lines).toBe(0);
    expect(c.onTime.pctTenths).toBeNull();
  });

  test("BR-SRT-10 a PO raised 14 months ago but completed inside the window is judged", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-60),
      created: istDay(-430),
      lines: [{}],
      grns: [{ day: istDay(-90), lines: [{ line: 0, recv: 1000 }] }],
    });
    expect((await fx.card(s)).onTime.lines).toBe(1);
  });

  test("BR-SRT-01 the window runs from 12 months back to today (IST)", async () => {
    const s = await sup();
    const c = await fx.card(s);
    expect(c.windowTo).toBe(istDay(0));
    const [y, m, d] = istDay(0).split("-").map(Number) as [
      number,
      number,
      number,
    ];
    const from = new Date(Date.UTC(y - 1, m - 1, d + 1))
      .toISOString()
      .slice(0, 10);
    expect(c.windowFrom).toBe(from);
  });

  test("BR-SRT-01 a GRN posted now shows on the next read (nothing stored)", async () => {
    const s = await sup();
    const po = await fx.mkPo(s, {
      status: "dispatched",
      due: istDay(-10),
      lines: [{}],
    });
    expect((await fx.card(s)).onTime.lateLines).toBe(1);
    const { db } = await import("../../src/db/client");
    const { grns, grnItems } = await import(
      "../../src/db/schemas/02_procurement-purchasing"
    );
    const [g] = await db
      .insert(grns)
      .values({
        grnNumber: fx.uid(),
        poId: po.poId,
        supplierId: s,
        status: "accepted",
        receivedDate: new Date(`${istDay(-12)}T06:30:00.000Z`),
      })
      .returning({ id: grns.id });
    await db.insert(grnItems).values({
      grnId: g!.id,
      poItemId: po.poItemIds[0]!,
      receivedQty: 1000,
      acceptedQty: 1000,
      rejectedQty: 0,
      qaStatus: "passed",
    });
    const c = await fx.card(s);
    expect(c.onTime.lateLines).toBe(0);
    expect(c.onTime.onTimeLines).toBe(1);
    // cleanup picks it up through grns.po_id
  });

  test("BR-SRT-32 a PO line without an expected date is left out and counted", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: null,
      lines: [{}],
      grns: [{ day: istDay(-20), lines: [{ line: 0, recv: 1000 }] }],
    });
    const c = await fx.card(s);
    expect(c.onTime.lines).toBe(0);
    expect(c.onTime.pctTenths).toBeNull();
    expect(c.onTime.noDueDateCount).toBe(1);
  });

  test("BR-SRT-30 a supplier with no PO lines has no data in every measure", async () => {
    const s = await sup();
    const c = await fx.card(s);
    expect(c.onTime.pctTenths).toBeNull();
    expect(c.rejection.pctTenths).toBeNull();
    expect(c.priceVariance.pctTenths).toBeNull();
    expect(c.score).toBeNull();
    expect(c.label).toBeNull();
  });
});

describe("rejection", () => {
  test("BR-SRT-11 1000 kg arrived, 20 rejected = 2.0 %", async () => {
    const s = await sup();
    await fx.delivered(s, 1, { rej: 20 });
    const c = await fx.card(s);
    expect(c.rejection.pctTenths).toBe(20);
    expect(c.rejection.decidedLines).toBe(1);
  });

  test("BR-SRT-11 rejection is by value (qty x PO rate), so kg and pieces are not added", async () => {
    const s = await sup();
    // kg: 1000 @ 21000, 20 rejected -> 420,000 of 21,000,000. pcs: 100 @ 5000, 5 rejected -> 25,000 of 500,000.
    // by value: 445,000 / 21,500,000 = 2.07 % -> 2.1 ; by qty it would be 25 / 1100 = 2.3
    await fx.mkPo(s, {
      lines: [
        { qty: 1000, rate: 21000, uom: "kg" },
        { qty: 100, rate: 5000, uom: "pcs" },
      ],
      grns: [
        {
          day: istDay(-35),
          lines: [
            { line: 0, recv: 1000, rej: 20 },
            { line: 1, recv: 100, rej: 5 },
          ],
        },
      ],
    });
    expect((await fx.card(s)).rejection.pctTenths).toBe(21);
  });

  test("BR-SRT-12 passed and failed lines are decided; pending lines are left out", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      lines: [{}, {}, {}],
      grns: [
        {
          day: istDay(-35),
          lines: [
            { line: 0, recv: 1000, rej: 0, qa: "passed" },
            { line: 1, recv: 1000, rej: 100, qa: "failed" },
            { line: 2, recv: 1000, rej: 500, qa: "pending" },
          ],
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.rejection.decidedLines).toBe(2);
    expect(c.rejection.pctTenths).toBe(50);
  });

  test("BR-SRT-12 a supplier whose GRN lines are all pending QA has no rejection data", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      lines: [{}],
      grns: [
        {
          day: istDay(-35),
          status: "pending_qa",
          lines: [{ line: 0, recv: 1000, rej: 100, qa: "pending" }],
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.rejection.pctTenths).toBeNull();
    expect(c.rejection.decidedLines).toBe(0);
  });

  test("BR-SRT-13 bypassed and waived lines are not decided and are shown as not inspected with their rejected qty", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      lines: [{}, {}, {}, {}],
      grns: [
        {
          day: istDay(-35),
          lines: [
            { line: 0, recv: 1000, rej: 0, qa: "passed" },
            { line: 1, recv: 1000, rej: 0, qa: "passed" },
            { line: 2, recv: 1000, rej: 0, qa: "passed", bypass: true },
            { line: 3, recv: 1000, rej: 5, qa: "waived" },
          ],
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.rejection.decidedLines).toBe(2);
    expect(c.rejection.notInspectedLines).toBe(2);
    expect(c.rejection.notInspectedRejectedQty).toEqual([
      { uom: "kg", qty: "5.000" },
    ]);
    expect(c.rejection.pctTenths).toBe(0);
  });

  test("BR-SRT-13 not-inspected lines do not count toward the 5-line minimum", async () => {
    const s = await sup();
    await fx.delivered(s, 4, { due: istDay(-30), recv: istDay(-35) });
    await fx.mkPo(s, {
      lines: [{}, {}],
      grns: [
        {
          day: istDay(-35),
          lines: [
            { line: 0, recv: 1000, qa: "waived" },
            { line: 1, recv: 1000, qa: "passed", bypass: true },
          ],
        },
      ],
    });
    // 4 decided + 2 not inspected -> 4 decided: below the minimum, no score
    const c = await fx.card(s);
    expect(c.rejection.decidedLines).toBe(4);
    expect(c.score).toBeNull();
    expect(c.notEnoughData?.decidedLines).toBe(4);
  });

  test("BR-SRT-14 a post-acceptance GRN correction does not change rejection %", async () => {
    const s = await sup();
    const po = await fx.delivered(s, 1, { rej: 20 });
    const before = (await fx.card(s)).rejection.pctTenths;
    await fx.addCorrection(po.grnItemIds[0]![0]!, 10);
    const after = (await fx.card(s)).rejection.pctTenths;
    expect(before).toBe(20);
    expect(after).toBe(20);
  });

  test("BR-SRT-15 counts the GRN lines that had any rejected qty", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      lines: [{}, {}, {}, {}],
      grns: [
        {
          day: istDay(-35),
          lines: [
            { line: 0, recv: 1000, rej: 20 },
            { line: 1, recv: 1000, rej: 5 },
            { line: 2, recv: 1000, rej: 0 },
            { line: 3, recv: 1000, rej: 0 },
          ],
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.rejection.linesWithRejects).toBe(2);
    expect(c.rejection.decidedLines).toBe(4);
  });

  test("BR-SRT-33 a draft GRN is left out of rejection % but still completes the line for on-time", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-20),
      lines: [{}],
      grns: [
        {
          day: istDay(-19),
          status: "draft",
          lines: [{ line: 0, recv: 1000, rej: 50, qa: "failed" }],
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.rejection.pctTenths).toBeNull();
    expect(c.rejection.decidedLines).toBe(0);
    expect(c.onTime.lines).toBe(1);
  });

  test("BR-SRT-33 a GRN not linked to a PO is part of no measure", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      status: "approved",
      sentRecord: false,
      lines: [{}],
      grns: [
        {
          noPo: true,
          day: istDay(-35),
          lines: [{ recv: 1000, rej: 100, qa: "failed" }],
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.rejection.pctTenths).toBeNull();
    expect(c.rejection.decidedLines).toBe(0);
  });

  test("BR-SRT-11 a GRN received before the 12-month window is left out", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-410),
      created: istDay(-420),
      lines: [{}],
      grns: [{ day: istDay(-400), lines: [{ line: 0, recv: 1000, rej: 100 }] }],
    });
    expect((await fx.card(s)).rejection.pctTenths).toBeNull();
  });

  test("BR-SRT-23 a supplier with POs but no GRN shows rejection as no data, not 0 or 100", async () => {
    const s = await sup();
    await fx.mkPo(s, { status: "dispatched", due: istDay(-5), lines: [{}] });
    const c = await fx.card(s);
    expect(c.rejection.pctTenths).toBeNull();
  });
});

describe("price variance", () => {
  const priced = async (
    s: number,
    o: {
      standard?: number;
      rate?: number;
      qty?: number;
      uom?: string;
      itemUom?: string;
      status?: "draft" | "dispatched";
      created?: string;
      item?: number;
    } = {},
  ) => {
    const item =
      o.item !== undefined
        ? { id: o.item }
        : await fx.newItem({
            uom: o.itemUom ?? "kg",
            standard: o.standard ?? 0,
          });
    const po = await fx.mkPo(s, {
      status: o.status ?? "dispatched",
      sentRecord: o.status !== "draft",
      due: istDay(0),
      created: o.created ?? istDay(-20),
      lines: [
        {
          item: item.id,
          qty: o.qty ?? 1000,
          rate: o.rate ?? 21000,
          uom: o.uom ?? "kg",
        },
      ],
    });
    return { item, po };
  };

  test("BR-SRT-17 / 19 rate 210 against standard 200 = +5.0 %", async () => {
    const s = await sup();
    await priced(s, { standard: 20000, rate: 21000 });
    const c = await fx.card(s);
    expect(c.priceVariance.pctTenths).toBe(50);
    expect(c.priceVariance.comparedLines).toBe(1);
  });

  test("BR-SRT-19 paying below the reference is a negative variance (-2.5 %)", async () => {
    const s = await sup();
    await priced(s, { standard: 20000, rate: 19500 });
    expect((await fx.card(s)).priceVariance.pctTenths).toBe(-25);
  });

  test("BR-SRT-19 variance is weighted by value across lines", async () => {
    const s = await sup();
    await priced(s, { standard: 20000, rate: 21000, qty: 1000 });
    await priced(s, { standard: 20000, rate: 19000, qty: 500 });
    // (1000*1000 - 1000*500) / (20000*1500) = 1.667 % -> 1.7
    expect((await fx.card(s)).priceVariance.pctTenths).toBe(17);
  });

  test("BR-SRT-19 a negative half rounds away from zero (-0.05 % -> -0.1)", async () => {
    const s = await sup();
    await priced(s, { standard: 20000, rate: 19990 });
    expect((await fx.card(s)).priceVariance.pctTenths).toBe(-1);
  });

  test("BR-SRT-17 without a standard rate the same supplier's previous sent PO rate is the reference", async () => {
    const s = await sup();
    const first = await priced(s, {
      standard: 0,
      rate: 20500,
      created: istDay(-40),
    });
    await priced(s, { item: first.item.id, rate: 21000, created: istDay(-20) });
    const c = await fx.card(s);
    // second line: (21000-20500)/20500 = 2.44 % -> 2.4 ; first line has no reference
    expect(c.priceVariance.pctTenths).toBe(24);
    expect(c.priceVariance.comparedLines).toBe(1);
    expect(c.priceVariance.notComparedLines).toBe(1);
  });

  test("BR-SRT-17 a standard rate of 0 means none; with no earlier PO the line is not compared", async () => {
    const s = await sup();
    await priced(s, { standard: 0, rate: 21000 });
    const c = await fx.card(s);
    expect(c.priceVariance.pctTenths).toBeNull();
    expect(c.priceVariance.comparedLines).toBe(0);
    expect(c.priceVariance.notComparedLines).toBe(1);
  });

  test("BR-SRT-17 the previous-PO fallback uses only this supplier's POs", async () => {
    const s = await sup();
    const other = await sup();
    const it = await fx.newItem({ standard: 0 });
    await priced(other, { item: it.id, rate: 10000, created: istDay(-40) });
    await priced(s, { item: it.id, rate: 21000, created: istDay(-20) });
    expect((await fx.card(s)).priceVariance.comparedLines).toBe(0);
  });

  test("BR-SRT-18 a line whose UOM differs from the reference UOM is not compared", async () => {
    const s = await sup();
    await priced(s, {
      standard: 20000,
      rate: 21000,
      itemUom: "kg",
      uom: "nos",
    });
    const c = await fx.card(s);
    expect(c.priceVariance.pctTenths).toBeNull();
    expect(c.priceVariance.notComparedLines).toBe(1);
    expect(c.priceVariance.comparedLines).toBe(0);
  });

  test("BR-SRT-16 a draft PO is not a price line", async () => {
    const s = await sup();
    await priced(s, { standard: 20000, rate: 21000, status: "draft" });
    const c = await fx.card(s);
    expect(c.priceVariance.pctTenths).toBeNull();
    expect(
      c.priceVariance.comparedLines + c.priceVariance.notComparedLines,
    ).toBe(0);
  });

  test("BR-SRT-16 a PO created before the 12-month window is not a price line", async () => {
    const s = await sup();
    await priced(s, { standard: 20000, rate: 21000, created: istDay(-400) });
    expect((await fx.card(s)).priceVariance.pctTenths).toBeNull();
  });

  test("BR-SRT-20 price variance is not part of the score", async () => {
    const s = await sup();
    // 5 on-time lines, 0 rejection -> score 100 whatever the price
    const it = await fx.newItem({ standard: 10000 });
    await fx.mkPo(s, {
      due: istDay(-30),
      lines: Array.from({ length: 5 }, () => ({ item: it.id, rate: 30000 })),
      grns: [
        {
          day: istDay(-35),
          lines: Array.from({ length: 5 }, (_, i) => ({ line: i, recv: 1000 })),
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.priceVariance.pctTenths).toBe(2000);
    expect(c.score).toBe(100);
  });
});

describe("score, minimum lines and label", () => {
  /** 5 on-time lines, each 100 kg with `rej` kg rejected: rejection % = rej. */
  async function scored(rej: number) {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-30),
      lines: Array.from({ length: 5 }, () => ({ qty: 100 })),
      grns: [
        {
          day: istDay(-35),
          lines: Array.from({ length: 5 }, (_, i) => ({
            line: i,
            recv: 100,
            rej,
          })),
        },
      ],
    });
    return fx.card(s);
  }

  test("BR-SRT-21 on-time 80 %, rejection 2 % gives score 89 and label good", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-30),
      lines: Array.from({ length: 8 }, () => ({ qty: 100 })),
      grns: [
        {
          day: istDay(-35),
          lines: Array.from({ length: 8 }, (_, i) => ({
            line: i,
            recv: 100,
            rej: 2,
          })),
        },
      ],
    });
    await fx.mkPo(s, {
      due: istDay(-30),
      lines: Array.from({ length: 2 }, () => ({ qty: 100 })),
      grns: [
        {
          day: istDay(-25),
          lines: Array.from({ length: 2 }, (_, i) => ({
            line: i,
            recv: 100,
            rej: 2,
          })),
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.onTime.pctTenths).toBe(800);
    expect(c.rejection.pctTenths).toBe(20);
    expect(c.score).toBe(89);
    expect(c.label).toBe("good");
    expect(c.notEnoughData).toBeNull();
  });

  test("BR-SRT-21 the score rounds half up from the displayed values (100 % on time, 1.0 % rejected -> 99.5 -> 100)", async () => {
    const c = await scored(1);
    expect(c.onTime.pctTenths).toBe(1000);
    expect(c.rejection.pctTenths).toBe(10);
    expect(c.score).toBe(100);
  });

  for (const [rej, score, label] of [
    [40, 80, "good"],
    [42, 79, "watch"],
    [80, 60, "watch"],
    [82, 59, "poor"],
  ] as const) {
    test(`BR-SRT-24 score ${score} is labelled ${label}`, async () => {
      const c = await scored(rej);
      expect(c.score).toBe(score);
      expect(c.label).toBe(label);
    });
  }

  test("BR-SRT-22 fewer than 5 judged lines: no score, counts shown, on-time % still shown", async () => {
    const s = await sup();
    await fx.delivered(s, 3, { due: istDay(-30), recv: istDay(-35) });
    const c = await fx.card(s);
    expect(c.score).toBeNull();
    expect(c.label).toBeNull();
    expect(c.notEnoughData).toEqual({
      judgedLines: 3,
      decidedLines: 3,
      required: 5,
    });
    expect(c.onTime.pctTenths).toBe(1000);
    expect(c.rejection.pctTenths).toBe(0);
  });

  test("BR-SRT-22 exactly 5 judged and 5 decided lines show a score", async () => {
    const s = await sup();
    await fx.delivered(s, 5, { due: istDay(-30), recv: istDay(-35) });
    const c = await fx.card(s);
    expect(c.score).toBe(100);
    expect(c.label).toBe("good");
    expect(c.notEnoughData).toBeNull();
  });

  test("BR-SRT-22 5 judged lines but only 3 decided GRN lines: no score", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-30),
      lines: Array.from({ length: 5 }, () => ({})),
      grns: [
        {
          day: istDay(-35),
          lines: [
            { line: 0, recv: 1000, qa: "passed" },
            { line: 1, recv: 1000, qa: "passed" },
            { line: 2, recv: 1000, qa: "passed" },
            { line: 3, recv: 1000, qa: "pending" },
            { line: 4, recv: 1000, qa: "pending" },
          ],
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.score).toBeNull();
    expect(c.notEnoughData).toEqual({
      judgedLines: 5,
      decidedLines: 3,
      required: 5,
    });
  });

  test("BR-SRT-36 on-time data without any decided GRN line gives no score and no label", async () => {
    const s = await sup();
    await fx.mkPo(s, {
      due: istDay(-30),
      lines: Array.from({ length: 6 }, () => ({})),
      grns: [
        {
          day: istDay(-35),
          status: "pending_qa",
          lines: Array.from({ length: 6 }, (_, i) => ({
            line: i,
            recv: 1000,
            qa: "pending" as const,
          })),
        },
      ],
    });
    const c = await fx.card(s);
    expect(c.onTime.pctTenths).toBe(1000);
    expect(c.rejection.pctTenths).toBeNull();
    expect(c.score).toBeNull();
    expect(c.label).toBeNull();
  });
});
