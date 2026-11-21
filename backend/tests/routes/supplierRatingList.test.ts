/**
 * Supplier rating list, trend, permissions and query bounds
 * (BR-SRT-26, 28, 29, 34, 36..41). Spec: docs/specs/supplier-rating/spec.md v1.
 * Real DB, full app. Fixtures TEST_srtl_ prefixed, removed in afterAll.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
  istDay,
  type Json,
  makeRatingFx,
  monthDay,
  monthKey,
} from "../helpers/ratingFixtures";

const fx = makeRatingFx("srtl");
afterAll(() => fx.cleanup());

const BASE = "/api/supplier-rating";
const ids = [
  `${BASE}/1/card`,
  `${BASE}/1/lines?measure=on_time`,
  `${BASE}/1/trend`,
  `${BASE}/list`,
];

describe("permissions", () => {
  test("BR-SRT-29 no token is 401 on every rating read", async () => {
    for (const p of ids) expect((await fx.get(p, null)).status).toBe(401);
  });

  test("BR-SRT-29 a floor supervisor (supplier.view only) gets 403 naming the key on every rating read", async () => {
    const who = await fx.floor();
    for (const p of ids) {
      const r = await fx.get(p, who);
      expect(r.status).toBe(403);
      expect(r.json.code).toBe("PERMISSION_DENIED");
      expect(JSON.stringify(r.json)).toContain("supplier.rating.view");
    }
  });

  test("BR-SRT-29 QA inspector is refused too", async () => {
    expect((await fx.get(`${BASE}/list`, await fx.qa())).status).toBe(403);
  });

  test("BR-SRT-29 owner, back office and super admin can read", async () => {
    const s = await fx.newSupplier();
    for (const who of [
      await fx.owner(),
      await fx.bo(),
      await fx.superAdmin(),
    ]) {
      expect((await fx.get(`${BASE}/${s}/card`, who)).status).toBe(200);
      expect((await fx.get(`${BASE}/list?pageSize=1`, who)).status).toBe(200);
    }
  });

  test("BR-SRT-40 a role with only the rating key sees supplier names in the list but not the supplier page", async () => {
    const who = await fx.actor("ratingOnly", ["supplier.rating.view"]);
    const name = `${fx.RUN}_nameonly`;
    const s = await fx.newSupplier({ name });
    const list = await fx.get(
      `${BASE}/list?q=${encodeURIComponent(name)}`,
      who,
    );
    expect(list.status).toBe(200);
    expect(list.json.data.some((r: Json) => r.supplierName === name)).toBe(
      true,
    );
    expect((await fx.get(`${BASE}/${s}/card`, who)).status).toBe(200);
    const page = await fx.get(`/api/supplier/${s}/detail`, who);
    expect(page.status).toBe(403);
  });

  test("BR-SRT-29 a role with supplier.view but not the rating key is refused", async () => {
    const who = await fx.actor("viewOnly", ["supplier.view"]);
    expect((await fx.get(`${BASE}/list`, who)).status).toBe(403);
  });
});

describe("not found and bounds", () => {
  test("BR-SRT-34 an unknown supplier is 404 on card, lines and trend", async () => {
    const missing = 2147483647;
    expect((await fx.rating(`/${missing}/card`)).status).toBe(404);
    expect((await fx.lines(missing, "measure=on_time")).status).toBe(404);
    expect((await fx.rating(`/${missing}/trend`)).status).toBe(404);
  });

  test("BR-SRT-34 an inactive supplier is still found", async () => {
    const s = await fx.newSupplier({ active: false });
    const r = await fx.rating(`/${s}/card`);
    expect(r.status).toBe(200);
    expect(r.json.data.supplierId).toBe(s);
    expect(r.json.data.isActive).toBe(false);
  });

  for (const bad of ["3000000000", "0", "-1", "abc", "1.5"]) {
    test(`BR-SRT-41 supplier id ${bad} is 400`, async () => {
      expect((await fx.rating(`/${bad}/card`)).status).toBe(400);
      expect((await fx.rating(`/${bad}/lines?measure=on_time`)).status).toBe(
        400,
      );
      expect((await fx.rating(`/${bad}/trend`)).status).toBe(400);
    });
  }

  for (const q of [
    "pageSize=500",
    "pageSize=0",
    "pageSize=-1",
    "page=0",
    "page=10001",
    "page=abc",
    "sortBy=bogus",
    "sortDir=sideways",
    "status=bogus",
    `q=${"x".repeat(101)}`,
    "unknown=1",
  ]) {
    test(`BR-SRT-41 list with ${q.slice(0, 30)} is 400`, async () => {
      expect((await fx.rating(`/list?${q}`)).status).toBe(400);
    });
  }

  test("BR-SRT-41 page 10000, pageSize 100 and a 100-character q are accepted", async () => {
    expect((await fx.rating("/list?page=10000&pageSize=100")).status).toBe(200);
    expect((await fx.rating(`/list?q=${"x".repeat(100)}`)).status).toBe(200);
  });
});

describe("list", () => {
  const group = `${fx.RUN}_g1`;
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;
  let inactive = 0;
  let ready: Promise<void> | null = null;
  const setup = () => {
    ready ??= (async () => {
      a = await fx.newSupplier({ name: `${group}_a` });
      b = await fx.newSupplier({ name: `${group}_b` });
      c = await fx.newSupplier({ name: `${group}_c` });
      d = await fx.newSupplier({ name: `${group}_d` }); // no POs at all
      inactive = await fx.newSupplier({ name: `${group}_e`, active: false });
      // a: 5 of 5 on time; b: 0 of 5 on time (late); c: 5 on time but 3 of 5 late? keep simple: 3 of 5 on time
      await fx.delivered(a, 5, { due: istDay(-30), recv: istDay(-35) });
      await fx.delivered(b, 5, { due: istDay(-30), recv: istDay(-20) });
      await fx.delivered(c, 3, { due: istDay(-30), recv: istDay(-35) });
      await fx.delivered(c, 2, { due: istDay(-30), recv: istDay(-20) });
      await fx.delivered(inactive, 5, { due: istDay(-30), recv: istDay(-35) });
    })();
    return ready;
  };
  const list = async (query: string) => {
    await setup();
    return fx.rating(`/list?q=${encodeURIComponent(group)}&${query}`);
  };
  const names = (r: { json: Json }) =>
    (r.json.data as Json[]).map((x) => x.supplierName.slice(group.length + 1));

  test("BR-SRT-26 default shows active suppliers only, sorted by name", async () => {
    const r = await list("pageSize=100");
    expect(r.status).toBe(200);
    expect(names(r)).toEqual(["a", "b", "c", "d"]);
  });

  test("BR-SRT-26 status=all includes inactive, status=inactive only inactive", async () => {
    expect(names(await list("pageSize=100&status=all"))).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    expect(names(await list("pageSize=100&status=inactive"))).toEqual(["e"]);
  });

  test("BR-SRT-26 each row carries score, label, the three measures and line counts", async () => {
    const r = await list("pageSize=100");
    const row = (r.json.data as Json[])[0];
    expect(row.supplierId).toBe(a);
    expect(row.score).toBe(100);
    expect(row.label).toBe("good");
    expect(row.onTime.pctTenths).toBe(1000);
    expect(row.rejection.pctTenths).toBe(0);
    expect(row.onTime.lines).toBe(5);
    expect(row.rejection.decidedLines).toBe(5);
    expect(row).toHaveProperty("priceVariance");
  });

  test("BR-SRT-26 a supplier with no PO is listed with null measures", async () => {
    const r = await list("pageSize=100");
    const row = (r.json.data as Json[]).find((x) => x.supplierId === d)!;
    expect(row.onTime.pctTenths).toBeNull();
    expect(row.rejection.pctTenths).toBeNull();
    expect(row.priceVariance.pctTenths).toBeNull();
    expect(row.score).toBeNull();
  });

  test("BR-SRT-26 sort by onTimePct desc, with no-data suppliers last", async () => {
    expect(
      names(await list("pageSize=100&sortBy=onTimePct&sortDir=desc")),
    ).toEqual(["a", "c", "b", "d"]);
  });

  test("BR-SRT-26 sort by onTimePct asc, no-data suppliers still last", async () => {
    expect(
      names(await list("pageSize=100&sortBy=onTimePct&sortDir=asc")),
    ).toEqual(["b", "c", "a", "d"]);
  });

  test("BR-SRT-26 sortBy without sortDir is ascending", async () => {
    expect(names(await list("pageSize=100&sortBy=onTimePct"))).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  test("BR-SRT-26 sort by name desc", async () => {
    expect(names(await list("pageSize=100&sortBy=name&sortDir=desc"))).toEqual([
      "d",
      "c",
      "b",
      "a",
    ]);
  });

  for (const sortBy of [
    "score",
    "rejectionPct",
    "priceVariancePct",
    "judgedLines",
    "decidedLines",
  ]) {
    test(`BR-SRT-26 sortBy=${sortBy} is accepted`, async () => {
      expect((await list(`sortBy=${sortBy}&sortDir=desc`)).status).toBe(200);
    });
  }

  test("BR-SRT-26 sort by judgedLines desc puts the supplier with most judged lines first", async () => {
    const r = await list("pageSize=100&sortBy=judgedLines&sortDir=desc");
    const first = (r.json.data as Json[])[0];
    expect(first.onTime.lines).toBeGreaterThanOrEqual(5);
  });

  test("BR-SRT-26 paging: meta carries page, pageSize, total, totalPages", async () => {
    const r = await list("pageSize=3&page=2&status=all");
    expect(r.json.meta).toEqual({
      page: 2,
      pageSize: 3,
      total: 5,
      totalPages: 2,
    });
    expect(names(r)).toEqual(["d", "e"]);
  });

  test("BR-SRT-41 q matches % literally", async () => {
    const x = await fx.newSupplier({ name: `${fx.RUN}_lit50%x` });
    await fx.newSupplier({ name: `${fx.RUN}_lit50Zx` });
    const r = await fx.rating(
      `/list?q=${encodeURIComponent(`${fx.RUN}_lit50%`)}`,
    );
    expect(r.status).toBe(200);
    expect((r.json.data as Json[]).map((x2) => x2.supplierId)).toEqual([x]);
  });

  test("BR-SRT-41 q matches _ literally", async () => {
    const x = await fx.newSupplier({ name: `${fx.RUN}_u_a` });
    await fx.newSupplier({ name: `${fx.RUN}_uXa` });
    const r = await fx.rating(`/list?q=${encodeURIComponent(`${fx.RUN}_u_a`)}`);
    expect((r.json.data as Json[]).map((x2) => x2.supplierId)).toEqual([x]);
  });

  test("BR-SRT-41 a q shorter than 2 characters applies no filter", async () => {
    await setup();
    const all = await fx.rating("/list?pageSize=1");
    const one = await fx.rating("/list?pageSize=1&q=a");
    expect(one.status).toBe(200);
    expect(one.json.meta.total).toBe(all.json.meta.total);
  });
});

describe("trend", () => {
  test("BR-SRT-28 twelve IST months, oldest first, current month last", async () => {
    const s = await fx.newSupplier();
    const m = await fx.trend(s);
    expect(m).toHaveLength(12);
    expect(m.map((x) => x.month)).toEqual(
      Array.from({ length: 12 }, (_, i) => monthKey(11 - i)),
    );
    expect(m[11].month).toBe(istDay(0).slice(0, 7));
  });

  test("BR-SRT-23 an empty month shows no data and no score", async () => {
    const s = await fx.newSupplier();
    for (const mo of await fx.trend(s)) {
      expect(mo.onTime.pctTenths).toBeNull();
      expect(mo.rejection.pctTenths).toBeNull();
      expect(mo.priceVariance.pctTenths).toBeNull();
      expect(mo.score).toBeNull();
      expect(mo.label).toBeNull();
    }
  });

  test("BR-SRT-28 a month with 2 judged and 2 decided lines shows its score (75, watch) without the 5-line minimum", async () => {
    const s = await fx.newSupplier();
    const day = monthDay(3, 15);
    await fx.mkPo(s, {
      due: monthDay(3, 20),
      created: monthDay(5, 10),
      lines: [{}],
      grns: [{ day, lines: [{ line: 0, recv: 1000 }] }],
    });
    await fx.mkPo(s, {
      due: monthDay(3, 10),
      created: monthDay(5, 10),
      lines: [{}],
      grns: [{ day, lines: [{ line: 0, recv: 1000 }] }],
    });
    const m = (await fx.trend(s))[11 - 3];
    expect(m.month).toBe(monthKey(3));
    expect(m.onTime.lines).toBe(2);
    expect(m.onTime.pctTenths).toBe(500);
    expect(m.rejection.pctTenths).toBe(0);
    expect(m.score).toBe(75);
    expect(m.label).toBe("watch");
    expect(m.notEnoughData).toBeNull();
    // the headline still needs 5 lines
    const c = await fx.card(s);
    expect(c.score).toBeNull();
    expect(c.notEnoughData).not.toBeNull();
  });

  test("BR-SRT-36 a month with judged lines but no decided GRN line shows on-time, no score, no label", async () => {
    const s = await fx.newSupplier();
    await fx.mkPo(s, {
      due: monthDay(2, 20),
      created: monthDay(4, 10),
      lines: [{}, {}],
      grns: [
        {
          day: monthDay(2, 15),
          status: "pending_qa",
          lines: [
            { line: 0, recv: 1000, qa: "pending" },
            { line: 1, recv: 1000, qa: "pending" },
          ],
        },
      ],
    });
    const m = (await fx.trend(s))[11 - 2];
    expect(m.onTime.pctTenths).toBe(1000);
    expect(m.onTime.lines).toBe(2);
    expect(m.rejection.pctTenths).toBeNull();
    expect(m.score).toBeNull();
    expect(m.label).toBeNull();
  });

  test("BR-SRT-37 / 38 / 39 on-time by judgement month, rejection by GRN month, price by PO month", async () => {
    const s = await fx.newSupplier();
    const item = await fx.newItem({ standard: 20000 });
    await fx.mkPo(s, {
      created: monthDay(5, 10), // price month
      due: monthDay(4, 28),
      lines: [{ item: item.id, qty: 1000, rate: 21000 }],
      grns: [
        // GRN in month 4: decided, rejects -> rejection month; completes only part of the qty
        {
          day: monthDay(4, 28),
          lines: [{ line: 0, recv: 600, rej: 10, qa: "failed" }],
        },
        // GRN in month 3 completes the line -> judgement month, late; QA pending
        {
          day: monthDay(3, 3),
          status: "pending_qa",
          lines: [{ line: 0, recv: 400, qa: "pending" }],
        },
      ],
    });
    const m = await fx.trend(s);
    const at = (ago: number) => m[11 - ago];
    expect(at(5).priceVariance.pctTenths).toBe(50);
    expect(at(4).priceVariance.pctTenths).toBeNull();
    expect(at(4).rejection.pctTenths).not.toBeNull();
    expect(at(3).rejection.pctTenths).toBeNull();
    expect(at(3).onTime.lines).toBe(1);
    expect(at(3).onTime.pctTenths).toBe(0);
    expect(at(4).onTime.lines).toBe(0);
    expect(at(5).onTime.lines).toBe(0);
  });
});
