/**
 * Supplier rating drill-down GET /api/supplier-rating/:id/lines (BR-SRT-27, 32, 13, 12, 17, 18, 41).
 * Spec: docs/specs/supplier-rating/spec.md v1, design/api.md. Real DB, full app.
 * Fixtures TEST_srtn_ prefixed, removed in afterAll.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { istDay, type Json, makeRatingFx } from "../helpers/ratingFixtures";

const fx = makeRatingFx("srtn");
afterAll(() => fx.cleanup());

const rows = (r: { json: Json }) => r.json.data as Json[];

describe("query validation", () => {
  test("BR-SRT-41 measure is required", async () => {
    const s = await fx.newSupplier();
    expect((await fx.lines(s, "page=1")).status).toBe(400);
  });

  test("BR-SRT-41 an unknown measure is 400", async () => {
    const s = await fx.newSupplier();
    expect((await fx.lines(s, "measure=bogus")).status).toBe(400);
  });

  const bad: [string, string][] = [
    ["on_time", "sortBy=receivedDate"],
    ["on_time", "sortBy=poDate"],
    ["rejection", "sortBy=dueDate"],
    ["rejection", "sortBy=poDate"],
    ["price", "sortBy=daysLate"],
    ["price", "sortBy=receivedDate"],
    ["on_time", "sortBy=bogus"],
    ["rejection", "verdict=late"],
    ["price", "verdict=late"],
    ["on_time", "verdict=bogus"],
    ["on_time", "pageSize=101"],
    ["on_time", "pageSize=0"],
    ["on_time", "page=10001"],
    ["on_time", "unknown=1"],
  ];
  for (const [measure, q] of bad) {
    test(`BR-SRT-41 measure=${measure} with ${q} is 400`, async () => {
      const s = await fx.newSupplier();
      expect((await fx.lines(s, `measure=${measure}&${q}`)).status).toBe(400);
    });
  }

  const good: [string, string][] = [
    ["on_time", "sortBy=dueDate"],
    ["on_time", "sortBy=completionDate"],
    ["on_time", "sortBy=daysLate"],
    ["on_time", "sortBy=poNumber"],
    ["on_time", "sortBy=itemSku"],
    ["on_time", "verdict=all"],
    ["on_time", "verdict=late"],
    ["on_time", "verdict=on_time"],
    ["on_time", "verdict=no_due_date"],
    ["rejection", "sortBy=receivedDate"],
    ["rejection", "sortBy=grnNumber"],
    ["rejection", "sortBy=rejectedValuePaise"],
    ["rejection", "sortBy=itemSku"],
    ["price", "sortBy=poDate"],
    ["price", "sortBy=poNumber"],
    ["price", "sortBy=variancePaise"],
    ["price", "sortBy=itemSku"],
    ["on_time", "page=10000&pageSize=100"],
  ];
  for (const [measure, q] of good) {
    test(`BR-SRT-41 measure=${measure} with ${q} is accepted`, async () => {
      const s = await fx.newSupplier();
      const r = await fx.lines(s, `measure=${measure}&${q}&sortDir=desc`);
      expect(r.status).toBe(200);
      expect(rows(r)).toEqual([]);
    });
  }

  test("BR-SRT-29 lines need supplier.rating.view", async () => {
    const s = await fx.newSupplier();
    expect((await fx.lines(s, "measure=on_time", null)).status).toBe(401);
    expect(
      (await fx.lines(s, "measure=on_time", await fx.floor())).status,
    ).toBe(403);
  });
});

describe("on_time lines", () => {
  test("BR-SRT-27 a late line shows PO, item, due, revised and completion dates and days late", async () => {
    const s = await fx.newSupplier();
    const po = await fx.mkPo(s, {
      due: istDay(-20),
      revised: istDay(-10),
      lines: [{ qty: 1000 }],
      grns: [{ day: istDay(-15), lines: [{ line: 0, recv: 1000 }] }],
    });
    const r = await fx.lines(s, "measure=on_time");
    expect(r.status).toBe(200);
    expect(r.json.meta.total).toBe(1);
    const l = rows(r)[0];
    expect(l.poItemId).toBe(po.poItemIds[0]);
    expect(l.poNumber).toBe(po.poNumber);
    expect(l.itemSku).toBe(po.skus[0]);
    expect(l.uom).toBe("kg");
    expect(l.orderedQty).toBe("1000.000");
    expect(l.arrivedQty).toBe("1000.000");
    expect(l.dueDate).toBe(istDay(-20));
    expect(l.revisedDate).toBe(istDay(-10));
    expect(l.completionDate).toBe(istDay(-15));
    expect(l.judgementDate).toBe(istDay(-15));
    expect(l.verdict).toBe("late");
    expect(l.daysLate).toBe(5);
    expect(l.state).toBe("complete");
  });

  test("BR-SRT-27 an on-time line has verdict on_time and no days late beyond zero", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, {
      due: istDay(-20),
      lines: [{}],
      grns: [{ day: istDay(-25), lines: [{ line: 0, recv: 1000 }] }],
    });
    const l = rows(await fx.lines(s, "measure=on_time"))[0];
    expect(l.verdict).toBe("on_time");
    expect(l.state).toBe("complete");
    expect(l.daysLate ?? 0).toBe(0);
  });

  test("BR-SRT-08 an open line past due is listed as open_past_due with days counted to today", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, { status: "dispatched", due: istDay(-10), lines: [{}] });
    const l = rows(await fx.lines(s, "measure=on_time"))[0];
    expect(l.state).toBe("open_past_due");
    expect(l.verdict).toBe("late");
    expect(l.completionDate).toBeNull();
    expect(l.daysLate).toBe(10);
  });

  test("BR-SRT-08 an open line not yet due is not listed", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, { status: "dispatched", due: istDay(5), lines: [{}] });
    expect((await fx.lines(s, "measure=on_time")).json.meta.total).toBe(0);
  });

  test("BR-SRT-09 a short-closed line is listed as short_closed, judged by the close date", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, {
      status: "closed",
      due: istDay(-20),
      shortClosed: true,
      closedDay: istDay(-15),
      lines: [{ qty: 1000 }],
      grns: [{ day: istDay(-25), lines: [{ line: 0, recv: 700 }] }],
    });
    const l = rows(await fx.lines(s, "measure=on_time"))[0];
    expect(l.state).toBe("short_closed");
    expect(l.arrivedQty).toBe("700.000");
    expect(l.judgementDate).toBe(istDay(-15));
    expect(l.daysLate).toBe(5);
  });

  test("A-42 a PO cancelled after dispatch is listed as cancelled_after_dispatch, judged by the cancel date", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, {
      status: "cancelled",
      due: istDay(-20),
      cancelledDay: istDay(-12),
      lines: [{}],
    });
    const l = rows(await fx.lines(s, "measure=on_time"))[0];
    expect(l.state).toBe("cancelled_after_dispatch");
    expect(l.verdict).toBe("late");
    expect(l.judgementDate).toBe(istDay(-12));
    expect(l.daysLate).toBe(8);
  });

  test("BR-SRT-32 a line with no due date is listed as no_due_date with null due, verdict and days late", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, {
      due: null,
      lines: [{}],
      grns: [{ day: istDay(-20), lines: [{ line: 0, recv: 1000 }] }],
    });
    const l = rows(await fx.lines(s, "measure=on_time"))[0];
    expect(l.state).toBe("no_due_date");
    expect(l.dueDate).toBeNull();
    expect(l.verdict).toBeNull();
    expect(l.daysLate).toBeNull();
  });

  describe("verdict filter and counts", () => {
    let s = 0;
    const setup = async () => {
      if (s) return s;
      s = await fx.newSupplier();
      await fx.delivered(s, 2, { due: istDay(-30), recv: istDay(-35) }); // 2 on time
      await fx.delivered(s, 1, { due: istDay(-30), recv: istDay(-25) }); // 1 late complete
      await fx.mkPo(s, { status: "dispatched", due: istDay(-10), lines: [{}] }); // open late
      await fx.mkPo(s, {
        status: "closed",
        due: istDay(-20),
        shortClosed: true,
        closedDay: istDay(-15),
        lines: [{ qty: 1000 }],
        grns: [{ day: istDay(-25), lines: [{ line: 0, recv: 700 }] }],
      }); // short-closed late
      await fx.mkPo(s, { due: null, lines: [{}] }); // no due date
      return s;
    };

    test("BR-SRT-27 verdict=late rows equal the late count of the card, open_past_due rows equal openLateLines", async () => {
      const id = await setup();
      const c = await fx.card(id);
      const r = await fx.lines(id, "measure=on_time&verdict=late&pageSize=100");
      expect(r.json.meta.total).toBe(c.onTime.lateLines);
      expect(c.onTime.lateLines).toBe(3);
      expect(rows(r).filter((x) => x.state === "open_past_due").length).toBe(
        c.onTime.openLateLines,
      );
      expect(rows(r).filter((x) => x.state === "short_closed").length).toBe(
        c.onTime.shortClosedLateCount,
      );
      expect(rows(r).every((x) => x.verdict === "late")).toBe(true);
    });

    test("BR-SRT-27 verdict=on_time lists only on-time lines", async () => {
      const id = await setup();
      const r = await fx.lines(id, "measure=on_time&verdict=on_time");
      expect(r.json.meta.total).toBe(2);
      expect(rows(r).every((x) => x.verdict === "on_time")).toBe(true);
    });

    test("BR-SRT-32 verdict=no_due_date lists only lines without a due date", async () => {
      const id = await setup();
      const r = await fx.lines(id, "measure=on_time&verdict=no_due_date");
      expect(r.json.meta.total).toBe(1);
      expect(rows(r)[0].state).toBe("no_due_date");
    });

    test("BR-SRT-27 verdict=all lists every judged line plus the no-due-date lines", async () => {
      const id = await setup();
      const r = await fx.lines(id, "measure=on_time&verdict=all&pageSize=100");
      expect(r.json.meta.total).toBe(6);
    });

    test("BR-SRT-27 the default sort is days late, descending", async () => {
      const id = await setup();
      const r = await fx.lines(id, "measure=on_time&verdict=late&pageSize=100");
      const d = rows(r).map((x) => x.daysLate as number);
      expect([...d].sort((x, y) => y - x)).toEqual(d);
    });

    test("BR-SRT-27 sortBy without sortDir is ascending", async () => {
      const id = await setup();
      const r = await fx.lines(
        id,
        "measure=on_time&verdict=late&sortBy=daysLate&pageSize=100",
      );
      const d = rows(r).map((x) => x.daysLate as number);
      expect([...d].sort((x, y) => x - y)).toEqual(d);
    });

    test("BR-SRT-27 sortBy=dueDate desc orders by due date", async () => {
      const id = await setup();
      const r = await fx.lines(
        id,
        "measure=on_time&verdict=late&sortBy=dueDate&sortDir=desc&pageSize=100",
      );
      const d = rows(r).map((x) => x.dueDate as string);
      expect([...d].sort().reverse()).toEqual(d);
    });

    test("BR-SRT-27 paging: pageSize 2 gives 2 rows and totalPages from the total", async () => {
      const id = await setup();
      const r = await fx.lines(
        id,
        "measure=on_time&verdict=all&pageSize=2&page=3",
      );
      expect(r.json.meta).toEqual({
        page: 3,
        pageSize: 2,
        total: 6,
        totalPages: 3,
      });
      expect(rows(r)).toHaveLength(2);
    });
  });

  test("BR-SRT-10 a line judged before the window is not listed", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, {
      due: istDay(-410),
      created: istDay(-420),
      lines: [{}],
      grns: [{ day: istDay(-400), lines: [{ line: 0, recv: 1000 }] }],
    });
    expect((await fx.lines(s, "measure=on_time")).json.meta.total).toBe(0);
  });
});

describe("rejection lines", () => {
  test("BR-SRT-27 a decided line shows GRN, PO, arrived and rejected qty, rate and values", async () => {
    const s = await fx.newSupplier();
    const po = await fx.mkPo(s, {
      lines: [{ qty: 1000, rate: 21000 }],
      grns: [{ day: istDay(-35), lines: [{ line: 0, recv: 1000, rej: 20 }] }],
    });
    const r = await fx.lines(s, "measure=rejection");
    expect(r.status).toBe(200);
    expect(r.json.meta.total).toBe(1);
    const l = rows(r)[0];
    expect(l.grnItemId).toBe(po.grnItemIds[0]![0]);
    expect(l.grnNumber).toBe(po.grnNumbers[0]);
    expect(l.poNumber).toBe(po.poNumber);
    expect(l.itemSku).toBe(po.skus[0]);
    expect(l.receivedDate).toBe(istDay(-35));
    expect(l.arrivedQty).toBe("1000.000");
    expect(l.rejectedQty).toBe("20.000");
    expect(l.uom).toBe("kg");
    expect(l.ratePaise).toBe(21000);
    expect(l.rejectedValuePaise).toBe(420000);
    expect(l.arrivedValuePaise).toBe(21000000);
    expect(l.inspection).toBe("decided");
  });

  test("BR-SRT-12 a line pending QA is not listed", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, {
      lines: [{}],
      grns: [
        {
          day: istDay(-35),
          status: "pending_qa",
          lines: [{ line: 0, recv: 1000, rej: 10, qa: "pending" }],
        },
      ],
    });
    expect((await fx.lines(s, "measure=rejection")).json.meta.total).toBe(0);
  });

  test("BR-SRT-13 bypassed and waived lines are listed as not_inspected with their rejected qty", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, {
      lines: [{}, {}],
      grns: [
        {
          day: istDay(-35),
          lines: [
            { line: 0, recv: 1000, rej: 5, qa: "waived" },
            { line: 1, recv: 1000, rej: 0, qa: "passed", bypass: true },
          ],
        },
      ],
    });
    const r = await fx.lines(s, "measure=rejection");
    expect(r.json.meta.total).toBe(2);
    expect(rows(r).every((x) => x.inspection === "not_inspected")).toBe(true);
    expect(
      rows(r)
        .map((x) => x.rejectedQty)
        .sort(),
    ).toEqual(["0.000", "5.000"]);
  });

  test("BR-SRT-33 a draft GRN line and a GRN without a PO are not listed", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, {
      lines: [{}],
      grns: [
        {
          day: istDay(-35),
          status: "draft",
          lines: [{ line: 0, recv: 1000, rej: 10, qa: "failed" }],
        },
        {
          day: istDay(-35),
          noPo: true,
          lines: [{ recv: 1000, rej: 10, qa: "failed" }],
        },
      ],
    });
    expect((await fx.lines(s, "measure=rejection")).json.meta.total).toBe(0);
  });

  test("BR-SRT-27 the default sort is received date, newest first; receivedDate asc reverses it", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, {
      lines: [{}],
      grns: [
        { day: istDay(-50), lines: [{ line: 0, recv: 300 }] },
        { day: istDay(-40), lines: [{ line: 0, recv: 300 }] },
        { day: istDay(-45), lines: [{ line: 0, recv: 300 }] },
      ],
    });
    const dflt = rows(await fx.lines(s, "measure=rejection")).map(
      (x) => x.receivedDate,
    );
    expect(dflt).toEqual([istDay(-40), istDay(-45), istDay(-50)]);
    const asc = rows(
      await fx.lines(s, "measure=rejection&sortBy=receivedDate"),
    ).map((x) => x.receivedDate);
    expect(asc).toEqual([istDay(-50), istDay(-45), istDay(-40)]);
  });

  test("BR-SRT-27 sortBy=rejectedValuePaise desc puts the biggest reject value first", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, {
      lines: [{}, {}, {}],
      grns: [
        {
          day: istDay(-35),
          lines: [
            { line: 0, recv: 1000, rej: 5 },
            { line: 1, recv: 1000, rej: 50 },
            { line: 2, recv: 1000, rej: 20 },
          ],
        },
      ],
    });
    const v = rows(
      await fx.lines(
        s,
        "measure=rejection&sortBy=rejectedValuePaise&sortDir=desc",
      ),
    ).map((x) => x.rejectedValuePaise);
    expect(v).toEqual([1050000, 420000, 105000]);
  });
});

describe("price lines", () => {
  test("BR-SRT-17 / 27 a line against the standard rate shows the reference, its source and the variance", async () => {
    const s = await fx.newSupplier();
    const item = await fx.newItem({ standard: 20000 });
    const po = await fx.mkPo(s, {
      status: "dispatched",
      created: istDay(-20),
      lines: [{ item: item.id, qty: 1000, rate: 21000 }],
    });
    const r = await fx.lines(s, "measure=price");
    expect(r.status).toBe(200);
    const l = rows(r)[0];
    expect(l.poItemId).toBe(po.poItemIds[0]);
    expect(l.poNumber).toBe(po.poNumber);
    expect(l.poDate).toBe(istDay(-20));
    expect(l.itemSku).toBe(item.sku);
    expect(l.uom).toBe("kg");
    expect(l.qty).toBe("1000.000");
    expect(l.ratePaise).toBe(21000);
    expect(l.referenceRatePaise).toBe(20000);
    expect(l.referenceSource).toBe("standard_rate");
    expect(l.variancePaise).toBe(1000);
    expect(l.variancePctTenths).toBe(50);
    expect(l.lineVariancePaise).toBe(1000000);
    expect(l.compared).toBe(true);
    expect(l.notComparedReason).toBeNull();
  });

  test("BR-SRT-17 without a standard rate the previous sent PO of the supplier is the reference", async () => {
    const s = await fx.newSupplier();
    const item = await fx.newItem({ standard: 0 });
    await fx.mkPo(s, {
      status: "dispatched",
      created: istDay(-40),
      lines: [{ item: item.id, rate: 20500 }],
    });
    await fx.mkPo(s, {
      status: "dispatched",
      created: istDay(-20),
      lines: [{ item: item.id, rate: 21000 }],
    });
    const l = rows(await fx.lines(s, "measure=price"));
    const newer = l.find((x) => x.poDate === istDay(-20))!;
    expect(newer.referenceSource).toBe("previous_po");
    expect(newer.referenceRatePaise).toBe(20500);
    expect(newer.compared).toBe(true);
    const older = l.find((x) => x.poDate === istDay(-40))!;
    expect(older.referenceSource).toBe("none");
    expect(older.compared).toBe(false);
    expect(older.notComparedReason).toBe("no_reference");
    expect(older.variancePaise).toBeNull();
    expect(older.variancePctTenths).toBeNull();
  });

  test("BR-SRT-18 a UOM mismatch is listed as not compared (uom_differs)", async () => {
    const s = await fx.newSupplier();
    const item = await fx.newItem({ standard: 20000, uom: "kg" });
    await fx.mkPo(s, {
      status: "dispatched",
      created: istDay(-20),
      lines: [{ item: item.id, rate: 21000, uom: "nos" }],
    });
    const l = rows(await fx.lines(s, "measure=price"))[0];
    expect(l.compared).toBe(false);
    expect(l.notComparedReason).toBe("uom_differs");
  });

  test("BR-SRT-16 a draft PO is not listed", async () => {
    const s = await fx.newSupplier();
    const item = await fx.newItem({ standard: 20000 });
    await fx.mkPo(s, {
      status: "draft",
      sentRecord: false,
      created: istDay(-20),
      lines: [{ item: item.id }],
    });
    expect((await fx.lines(s, "measure=price")).json.meta.total).toBe(0);
  });

  test("BR-SRT-27 the default sort is PO date, newest first; sortBy=variancePaise asc orders by unit variance", async () => {
    const s = await fx.newSupplier();
    const item = await fx.newItem({ standard: 20000 });
    for (const [days, rate] of [
      [-30, 22000],
      [-10, 19000],
      [-20, 21000],
    ] as const)
      await fx.mkPo(s, {
        status: "dispatched",
        created: istDay(days),
        lines: [{ item: item.id, rate }],
      });
    const dflt = rows(await fx.lines(s, "measure=price")).map((x) => x.poDate);
    expect(dflt).toEqual([istDay(-10), istDay(-20), istDay(-30)]);
    const v = rows(
      await fx.lines(s, "measure=price&sortBy=variancePaise&sortDir=asc"),
    ).map((x) => x.variancePaise);
    expect(v).toEqual([-1000, 1000, 2000]);
  });
});
