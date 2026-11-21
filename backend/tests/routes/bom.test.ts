/**
 * HTTP-level tests for the BOM module: BR-BOM-01..28 (docs/specs/bom/spec.md v1).
 * Runs through the real app against the test DB. Fixtures are TEST_bom_ prefixed
 * and removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { roles } from "../../src/db/schemas/01_auth";
import {
  bomHistory,
  bomLines,
  bomPartSeq,
  boms,
} from "../../src/db/schemas/02_procurement-bom";
import {
  itemMaster,
  serviceMaster,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  supplierMaster,
  supplierServices,
} from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const RUN = `TEST_bom_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;
const EMAIL_PREFIX = "test_bom_";

type Actor = { id: number; token: string; name: string };
const actors: Record<string, Actor> = {};
const itemIds: number[] = [];
const partIds: number[] = [];
const vendorIds: number[] = [];
const serviceIds: number[] = [];

function must<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`Fixture setup: ${what} returned no row`);
  return row;
}

async function makeActor(key: string, roleName: string) {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  const name = `${RUN}_${key}`;
  const [emp] = await db
    .insert(employees)
    .values({
      name,
      email: `${EMAIL_PREFIX}${Date.now()}_${key}@diecast.test`,
      roleId: must(role, roleName).id,
      isActive: true,
    })
    .returning({ id: employees.id });
  const id = must(emp, key).id;
  const token = await signAccessToken({
    userId: id,
    userName: name,
    role: roleName,
    allowedPages: [],
  });
  actors[key] = { id, token, name };
}

async function call(
  actor: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (actor) headers.Authorization = `Bearer ${actors[actor]?.token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(`/api/bom${path.replace(/^\/(?=\?|$)/, "")}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

async function mkItem(
  opts: {
    category?: string;
    uom?: string;
    isActive?: boolean;
    asPart?: boolean;
  } = {},
) {
  const sku = uid();
  const [row] = await db
    .insert(itemMaster)
    .values({
      sku,
      name: sku,
      category:
        opts.category ?? (opts.asPart ? "Manufactured part" : "Raw Material"),
      uom: opts.uom ?? "pcs",
      isActive: opts.isActive ?? true,
    })
    .returning({ id: itemMaster.id, sku: itemMaster.sku });
  const r = must(row, "item");
  itemIds.push(r.id);
  if (opts.asPart) partIds.push(r.id);
  return r;
}
const mkPart = (uom = "pcs") => mkItem({ asPart: true, uom });
const mkRaw = (uom = "pcs") => mkItem({ uom });

let alloyId: number;
let vendorId: number;
let serviceId: number;
let otherServiceId: number;
let rawVendorId: number;

const line = (componentItemId: number, qtyPerPiece = 1, extra = {}) => ({
  componentItemId,
  qtyPerPiece,
  buyAsIs: false,
  ...extra,
});

const castingBlock = (over: Record<string, unknown> = {}) => ({
  alloyItemId: alloyId,
  netWeightKg: 0.85,
  shotWeightKg: 2,
  cavities: 2,
  meltLossPct: 3,
  castingRejectPct: 5,
  ...over,
});

const jobWorkBlock = (
  sentItemId: number,
  over: Record<string, unknown> = {},
) => ({
  sentItemId,
  sendQty: 1,
  returnQty: 1,
  jobWorkerId: vendorId,
  serviceId,
  jobWorkLossPct: 2,
  ...over,
});

async function create(
  partId: number,
  body: Record<string, unknown>,
  actor = "bo",
) {
  return call(actor, "POST", "", { partId, ...body });
}

async function detail(id: number, actor = "owner") {
  const r = await call(actor, "GET", `/${id}`);
  return r.json.data;
}

async function release(id: number, reason?: string, version?: number) {
  const v = version ?? (await detail(id)).version;
  const body: Record<string, unknown> = { version: v };
  if (reason !== undefined) body.reason = reason;
  return call("owner", "POST", `/${id}/release`, body);
}

/** Released casting part with one BUSH insert line (qty 2). */
async function activeCasting(over: Record<string, unknown> = {}) {
  const part = await mkPart();
  const bush = await mkRaw();
  const res = await create(part.id, {
    kind: "casting",
    casting: castingBlock(over),
    lines: [line(bush.id, 2)],
  });
  expect(res.status).toBe(201);
  const rel = await release(res.json.data.id);
  expect(rel.status).toBe(200);
  return { part, bush, bomId: res.json.data.id as number };
}

async function activeAssembly(lines: ReturnType<typeof line>[]) {
  const part = await mkPart();
  const res = await create(part.id, { kind: "assembly", lines });
  expect(res.status).toBe(201);
  const rel = await release(res.json.data.id);
  expect(rel.status).toBe(200);
  return { part, bomId: res.json.data.id as number };
}

/** Draft assembly with one line; returns ids. */
async function draftAssembly() {
  const part = await mkPart();
  const comp = await mkRaw();
  const res = await create(part.id, {
    kind: "assembly",
    lines: [line(comp.id, 1)],
  });
  expect(res.status).toBe(201);
  return { part, comp, bomId: res.json.data.id as number, version: 1 };
}

/** Active assembly A and an open draft B (copy). */
async function activeWithDraft() {
  const a = await activeAssembly([line((await mkRaw()).id, 1)]);
  const st = await call("bo", "POST", `/parts/${a.part.id}/revisions`);
  expect(st.status).toBe(201);
  return { ...a, draftId: st.json.data.id as number };
}

function keysDeep(o: unknown, out: string[] = []): string[] {
  if (Array.isArray(o)) {
    for (const x of o) keysDeep(x, out);
  } else if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  return out;
}

beforeAll(async () => {
  await makeActor("owner", "owner");
  await makeActor("bo", "back_office");
  await makeActor("fs", "floor_supervisor");
  await makeActor("qa", "qa_inspector");

  alloyId = (await mkRaw("kg")).id;

  const mkVendor = async (type: "service_provider" | "raw_material") => {
    const [v] = await db
      .insert(supplierMaster)
      .values({ name: uid(), type, isActive: true })
      .returning({ id: supplierMaster.id });
    const id = must(v, "vendor").id;
    vendorIds.push(id);
    return id;
  };
  vendorId = await mkVendor("service_provider");
  rawVendorId = await mkVendor("raw_material");

  const mkService = async () => {
    const [s] = await db
      .insert(serviceMaster)
      .values({ code: uid(), name: uid(), defaultUom: "pcs", isActive: true })
      .returning({ id: serviceMaster.id });
    const id = must(s, "service").id;
    serviceIds.push(id);
    return id;
  };
  serviceId = await mkService();
  otherServiceId = await mkService();
  await db.insert(supplierServices).values([
    {
      supplierId: vendorId,
      serviceId,
      serviceUnitPricePaise: 2500,
      taxPercentage: 18,
    },
    {
      supplierId: rawVendorId,
      serviceId,
      serviceUnitPricePaise: 2500,
      taxPercentage: 18,
    },
  ]);
});

afterAll(async () => {
  const bomRows =
    partIds.length > 0
      ? await db
          .select({ id: boms.id })
          .from(boms)
          .where(inArray(boms.partId, partIds))
      : [];
  const bomIds = bomRows.map((b) => b.id);
  if (partIds.length > 0)
    await db.delete(bomHistory).where(inArray(bomHistory.partId, partIds));
  if (bomIds.length > 0)
    await db.delete(bomLines).where(inArray(bomLines.bomId, bomIds));
  if (partIds.length > 0) {
    await db.delete(boms).where(inArray(boms.partId, partIds));
    await db.delete(bomPartSeq).where(inArray(bomPartSeq.partId, partIds));
  }
  if (vendorIds.length > 0)
    await db
      .delete(supplierServices)
      .where(inArray(supplierServices.supplierId, vendorIds));
  if (vendorIds.length > 0)
    await db
      .delete(supplierMaster)
      .where(inArray(supplierMaster.id, vendorIds));
  if (serviceIds.length > 0)
    await db.delete(serviceMaster).where(inArray(serviceMaster.id, serviceIds));
  if (itemIds.length > 0)
    await db.delete(itemMaster).where(inArray(itemMaster.id, itemIds));
  await db.delete(employees).where(like(employees.name, `${RUN}_%`));
});

describe("BR-BOM-01 create", () => {
  test("BR-BOM-01 casting BOM for a Manufactured part in pcs is a draft rev A, createdBy me", async () => {
    const part = await mkPart();
    const res = await create(part.id, {
      kind: "casting",
      casting: castingBlock(),
      lines: [],
    });
    expect(res.status).toBe(201);
    expect(res.json.data.status).toBe("draft");
    expect(res.json.data.version).toBe(1);
    const d = await detail(res.json.data.id);
    expect(d.number).toBe(`BOM-${part.sku}-A`);
    expect(d.revision).toBe("A");
    const [row] = await db
      .select({ createdBy: boms.createdBy })
      .from(boms)
      .where(eq(boms.id, res.json.data.id));
    expect(row?.createdBy).toBe(actors.bo?.id as number);
  });

  test("BR-BOM-01 part in kg is refused", async () => {
    const part = await mkPart("kg");
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line((await mkRaw()).id)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-01 part of another category (Raw Material) is refused", async () => {
    const part = await mkRaw();
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line((await mkRaw()).id)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-01 casting BOM for a set item is refused", async () => {
    const part = await mkPart("set");
    const res = await create(part.id, {
      kind: "casting",
      casting: castingBlock(),
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-01 assembly BOM for a set item is allowed", async () => {
    const part = await mkPart("set");
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line((await mkRaw()).id)],
    });
    expect(res.status).toBe(201);
  });

  test("BR-BOM-01 inactive part is refused", async () => {
    const part = await mkItem({ asPart: true, isActive: false });
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line((await mkRaw()).id)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-01 unknown kind phantom is refused", async () => {
    const part = await mkPart();
    const res = await create(part.id, { kind: "phantom", lines: [] });
    expect(res.status).toBe(400);
  });
});

describe("BR-BOM-02 revision letters", () => {
  test("BR-BOM-02 deleted draft letter is never reused (A deleted, next is B)", async () => {
    const part = await mkPart();
    const a = await create(part.id, { kind: "assembly", lines: [] });
    expect(a.status).toBe(201);
    const del = await call("bo", "DELETE", `/${a.json.data.id}`);
    expect(del.status).toBe(200);
    const b = await create(part.id, { kind: "assembly", lines: [] });
    expect(b.status).toBe(201);
    const d = await detail(b.json.data.id);
    expect(d.revision).toBe("B");
    expect(d.number).toBe(`BOM-${part.sku}-B`);
  });

  test("BR-BOM-02 letters run A, B, C across revisions", async () => {
    const a = await activeAssembly([line((await mkRaw()).id)]);
    const b = await call("bo", "POST", `/parts/${a.part.id}/revisions`);
    expect(b.status).toBe(201);
    expect((await detail(b.json.data.id)).revision).toBe("B");
    await call("bo", "DELETE", `/${b.json.data.id}`);
    const c = await call("bo", "POST", `/parts/${a.part.id}/revisions`);
    expect(c.status).toBe(201);
    expect((await detail(c.json.data.id)).revision).toBe("C");
  });

  test("BR-BOM-02 after Z comes AA", async () => {
    const a = await activeAssembly([line((await mkRaw()).id)]);
    await db
      .update(bomPartSeq)
      .set({ lastRevisionNo: 26 })
      .where(eq(bomPartSeq.partId, a.part.id));
    const next = await call("bo", "POST", `/parts/${a.part.id}/revisions`);
    expect(next.status).toBe(201);
    expect((await detail(next.json.data.id)).revision).toBe("AA");
  });
});

describe("BR-BOM-03 component lines", () => {
  const base = async () => {
    const part = await mkPart();
    return { part, comp: await mkRaw() };
  };

  test("BR-BOM-03 decimal qty (0.020) is accepted", async () => {
    const { part, comp } = await base();
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line(comp.id, 0.02)],
    });
    expect(res.status).toBe(201);
  });

  test("BR-BOM-03 same item twice is refused", async () => {
    const { part, comp } = await base();
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line(comp.id, 1), line(comp.id, 2)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-03 the part as its own line is refused", async () => {
    const { part } = await base();
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line(part.id, 1)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-03 the casting alloy as a line is refused", async () => {
    const { part } = await base();
    const res = await create(part.id, {
      kind: "casting",
      casting: castingBlock(),
      lines: [line(alloyId, 1)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-03 qty 0 is refused", async () => {
    const { part, comp } = await base();
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line(comp.id, 0)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-03 qty with 4 decimals is refused", async () => {
    const { part, comp } = await base();
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line(comp.id, 0.0005)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-03 more than 50 lines is refused", async () => {
    const part = await mkPart();
    const lines = [];
    for (let i = 0; i < 51; i++) lines.push(line((await mkRaw()).id));
    const res = await create(part.id, { kind: "assembly", lines });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-03 inactive component is refused", async () => {
    const { part } = await base();
    const dead = await mkItem({ isActive: false });
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line(dead.id)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-03 a service id sent as a line is refused", async () => {
    const { part } = await base();
    // pick a service id that is not also an item id
    const [maxItem] = await db
      .select({ id: itemMaster.id })
      .from(itemMaster)
      .orderBy(itemMaster.id)
      .limit(1);
    expect(maxItem).toBeDefined();
    const all = await db.select({ id: itemMaster.id }).from(itemMaster);
    const maxId = Math.max(...all.map((r) => r.id));
    const extra: number[] = [];
    let sid = serviceId;
    for (let i = 0; i < 300 && sid <= maxId; i++) {
      const [s] = await db
        .insert(serviceMaster)
        .values({ code: uid(), name: uid(), defaultUom: "pcs" })
        .returning({ id: serviceMaster.id });
      sid = must(s, "svc").id;
      extra.push(sid);
      serviceIds.push(sid);
    }
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line(sid, 1)],
    });
    expect(res.status).toBe(400);
  });
});

describe("BR-BOM-04 casting data", () => {
  const tryCast = async (over: Record<string, unknown>) => {
    const part = await mkPart();
    return create(part.id, { kind: "casting", casting: castingBlock(over) });
  };

  test("BR-BOM-04 shot below net x cavities is refused (1.600 for 2 x 0.850)", async () => {
    expect((await tryCast({ shotWeightKg: 1.6 })).status).toBe(400);
  });

  test("BR-BOM-04 shot exactly net x cavities is accepted", async () => {
    expect((await tryCast({ shotWeightKg: 1.7 })).status).toBe(201);
  });

  test("BR-BOM-04 alloy in pcs is refused", async () => {
    const pcs = await mkRaw("pcs");
    expect((await tryCast({ alloyItemId: pcs.id })).status).toBe(400);
  });

  test("BR-BOM-04 casting reject 50 is refused", async () => {
    expect((await tryCast({ castingRejectPct: 50 })).status).toBe(400);
  });

  test("BR-BOM-04 melt loss 50 is refused", async () => {
    expect((await tryCast({ meltLossPct: 50 })).status).toBe(400);
  });

  test("BR-BOM-04 cavities 0 and 65 are refused", async () => {
    expect((await tryCast({ cavities: 0 })).status).toBe(400);
    expect((await tryCast({ cavities: 65 })).status).toBe(400);
  });

  test("BR-BOM-04 inactive alloy is refused", async () => {
    const dead = await mkItem({ uom: "kg", isActive: false });
    expect((await tryCast({ alloyItemId: dead.id })).status).toBe(400);
  });
});

describe("BR-BOM-05 computed casting figures", () => {
  test("BR-BOM-05 poured 1.000, yield 85.0 %, alloy per good piece 0.882", async () => {
    const { bomId } = await activeCasting();
    const d = await detail(bomId);
    expect(d.casting.computed.pouredWeightKg).toBeCloseTo(1.0, 3);
    expect(d.casting.computed.yieldPct).toBeCloseTo(85.0, 1);
    expect(d.casting.computed.alloyPerGoodPieceKg).toBeCloseTo(0.882, 3);
  });
});

describe("BR-BOM-06 inserts per poured piece", () => {
  test("BR-BOM-06 1000 good pieces at 5 % reject pour 1053 and need 2106 inserts", async () => {
    const { part, bush } = await activeCasting();
    const res = await call("owner", "GET", `/needs?partId=${part.id}&qty=1000`);
    expect(res.status).toBe(200);
    const root = res.json.data.rows.find(
      (r: { itemId: number; parentIndex: number | null }) =>
        r.itemId === part.id,
    );
    expect(root.pourQty).toBe(1053);
    const buy = res.json.data.toBuy.find(
      (r: { itemId: number }) => r.itemId === bush.id,
    );
    expect(buy.qty).toBe(2106);
  });
});

describe("BR-BOM-07 job-work BOM", () => {
  const jw = async (
    over: Record<string, unknown> = {},
    lines: unknown[] = [],
    sent?: { id: number },
  ) => {
    const part = await mkPart();
    const s = sent ?? (await mkRaw());
    return create(part.id, {
      kind: "job_work",
      jobWork: jobWorkBlock(s.id, over),
      lines,
    });
  };

  test("BR-BOM-07 valid job-work BOM is accepted", async () => {
    expect((await jw()).status).toBe(201);
  });

  test("BR-BOM-07 any component line is refused", async () => {
    const res = await jw({}, [line((await mkRaw()).id)]);
    expect(res.status).toBe(400);
  });

  test("BR-BOM-07 service not on the job worker's list is refused", async () => {
    expect((await jw({ serviceId: otherServiceId })).status).toBe(400);
  });

  test("BR-BOM-07 job worker of type raw_material is refused", async () => {
    expect((await jw({ jobWorkerId: rawVendorId })).status).toBe(400);
  });

  test("BR-BOM-07 sent item in kg is refused", async () => {
    expect((await jw({}, [], await mkRaw("kg"))).status).toBe(400);
  });

  test("BR-BOM-07 sent item equal to the part is refused", async () => {
    const part = await mkPart();
    const res = await create(part.id, {
      kind: "job_work",
      jobWork: jobWorkBlock(part.id),
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-07 send qty 0 and loss 50 are refused", async () => {
    expect((await jw({ sendQty: 0 })).status).toBe(400);
    expect((await jw({ jobWorkLossPct: 50 })).status).toBe(400);
  });
});

describe("BR-BOM-08 kind fields", () => {
  test("BR-BOM-08 assembly with no lines can be saved but not released", async () => {
    const part = await mkPart();
    const res = await create(part.id, { kind: "assembly", lines: [] });
    expect(res.status).toBe(201);
    const rel = await release(res.json.data.id);
    expect(rel.status).toBe(400);
    expect(rel.json.code).toBe("BOM_RELEASE_INVALID");
  });

  test("BR-BOM-08 assembly with casting fields is refused", async () => {
    const part = await mkPart();
    const res = await create(part.id, {
      kind: "assembly",
      casting: castingBlock(),
      lines: [line((await mkRaw()).id)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-08 casting BOM with job-work fields is refused", async () => {
    const part = await mkPart();
    const res = await create(part.id, {
      kind: "casting",
      casting: castingBlock(),
      jobWork: jobWorkBlock((await mkRaw()).id),
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-08 kind can change on a draft; old kind's fields still sent is refused", async () => {
    const part = await mkPart();
    const c = await create(part.id, {
      kind: "casting",
      casting: castingBlock(),
    });
    const bad = await call("bo", "PATCH", `/${c.json.data.id}`, {
      version: 1,
      kind: "assembly",
      casting: castingBlock(),
      lines: [line((await mkRaw()).id)],
    });
    expect(bad.status).toBe(400);
    const ok = await call("bo", "PATCH", `/${c.json.data.id}`, {
      version: 1,
      kind: "assembly",
      lines: [line((await mkRaw()).id)],
    });
    expect(ok.status).toBe(200);
    expect((await detail(c.json.data.id)).kind).toBe("assembly");
  });
});

describe("BR-BOM-09 walking levels", () => {
  test("BR-BOM-09 tree walks a line with an active BOM, tags buy_as_is and no_bom", async () => {
    const sub = await activeCasting();
    const buyAsIsPart = await activeCasting();
    const plain = await mkRaw();
    const { bomId } = await activeAssembly([
      line(sub.part.id, 1),
      line(buyAsIsPart.part.id, 1, { buyAsIs: true }),
      line(plain.id, 1),
    ]);
    const t = await call("owner", "GET", `/${bomId}/tree`);
    expect(t.status).toBe(200);
    // biome-ignore lint/suspicious/noExplicitAny: tree node
    const kids: any[] = t.json.data.children;
    const by = (id: number) => kids.find((k) => k.itemId === id);
    expect(by(sub.part.id).treatment).toBe("cast");
    expect(by(sub.part.id).children.length).toBeGreaterThan(0);
    expect(by(buyAsIsPart.part.id).treatment).toBe("buy_as_is");
    expect(by(buyAsIsPart.part.id).children.length).toBe(0);
    expect(by(plain.id).treatment).toBe("no_bom");
  });
});

describe("BR-BOM-10 loops, depth, size", () => {
  test("BR-BOM-10 a draft that would loop through an active revision is refused with the path", async () => {
    const p = await mkPart();
    const q = await activeAssembly([line(p.id, 1)]);
    const res = await create(p.id, {
      kind: "assembly",
      lines: [line(q.part.id, 1)],
    });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("BOM_LOOP");
    expect(res.json.details?.path).toBeDefined();
  });

  test("BR-BOM-10 more than 10 levels is refused", async () => {
    let child: number = (await mkRaw()).id;
    let refused: { status: number; json: { code?: string } } | null = null;
    let ok = 0;
    for (let i = 0; i < 14; i++) {
      const part = await mkPart();
      const res = await create(part.id, {
        kind: "assembly",
        lines: [line(child, 1)],
      });
      if (res.status !== 201) {
        refused = res;
        break;
      }
      const rel = await release(res.json.data.id);
      if (rel.status !== 200) {
        refused = rel;
        break;
      }
      ok++;
      child = part.id;
    }
    expect(ok).toBeGreaterThanOrEqual(8);
    expect(refused).not.toBeNull();
    expect(refused?.status).toBe(400);
    expect(refused?.json.code).toBe("BOM_TOO_DEEP");
  });

  test("BR-BOM-10 a tree above 1,000 nodes is refused on save, tree and needs", async () => {
    const leaves = [];
    for (let i = 0; i < 50; i++) leaves.push((await mkRaw()).id);
    const subs: number[] = [];
    for (let i = 0; i < 50; i++) {
      const s = await activeAssembly(leaves.map((l) => line(l, 1)));
      subs.push(s.part.id);
    }
    const root = await mkPart();
    const save = await create(root.id, {
      kind: "assembly",
      lines: subs.map((s) => line(s, 1)),
    });
    expect(save.status).toBe(400);
    expect(save.json.code).toBe("BOM_TOO_LARGE");

    // the same tree already stored as an active revision: tree and needs stop too
    const [row] = await db
      .insert(boms)
      .values({
        partId: root.id,
        revisionNo: 1,
        kind: "assembly",
        status: "active",
        createdBy: actors.owner?.id as number,
      })
      .returning({ id: boms.id });
    const rootBom = must(row, "root bom").id;
    await db.insert(bomLines).values(
      subs.map((s, i) => ({
        bomId: rootBom,
        componentItemId: s,
        qtyPerPiece: "1.000",
        lineNo: i + 1,
      })),
    );
    const tree = await call("owner", "GET", `/${rootBom}/tree`);
    expect(tree.status).toBe(400);
    expect(tree.json.code).toBe("BOM_TOO_LARGE");
    const needs = await call("owner", "GET", `/needs?partId=${root.id}&qty=1`);
    expect(needs.status).toBe(400);
    expect(needs.json.code).toBe("BOM_TOO_LARGE");
  }, 120_000);
});

describe("BR-BOM-11 only drafts change", () => {
  test("BR-BOM-11 PATCH on an active revision is 409 and nothing changes", async () => {
    const { bomId } = await activeCasting();
    const before = await detail(bomId);
    const res = await call("bo", "PATCH", `/${bomId}`, {
      version: before.version,
      kind: "casting",
      casting: castingBlock({ netWeightKg: 0.9, shotWeightKg: 2 }),
      lines: [],
    });
    expect(res.status).toBe(409);
    const after = await detail(bomId);
    expect(after.casting.netWeightKg).toBe(before.casting.netWeightKg);
    expect(after.version).toBe(before.version);
  });

  test("BR-BOM-11 PATCH on a retired revision is 409", async () => {
    const { bomId, part } = await activeCasting();
    await call("owner", "POST", `/${bomId}/retire`, { reason: "die scrapped" });
    const d = await detail(bomId);
    const res = await call("bo", "PATCH", `/${bomId}`, {
      version: d.version,
      kind: "assembly",
      lines: [line((await mkRaw()).id)],
    });
    expect(res.status).toBe(409);
    expect(part.id).toBeGreaterThan(0);
  });
});

describe("BR-BOM-12 release", () => {
  test("BR-BOM-12 first release needs no reason, stores released by/at", async () => {
    const { bomId } = await activeCasting();
    const d = await detail(bomId);
    expect(d.status).toBe("active");
    expect(d.releasedByName).toBe(actors.owner?.name as string);
    expect(d.releasedAt).toBeTruthy();
  });

  test("BR-BOM-12 replacing release without a reason, or with a too short one, is 400", async () => {
    const { part, bomId } = await activeCasting();
    const st = await call("bo", "POST", `/parts/${part.id}/revisions`);
    const draftId = st.json.data.id;
    const none = await release(draftId);
    expect(none.status).toBe(400);
    expect(none.json.code).toBe("BOM_RELEASE_INVALID");
    const short = await release(draftId, "  ab ");
    expect(short.status).toBe(400);
    expect((await detail(draftId)).status).toBe("draft");
    expect((await detail(bomId)).status).toBe("active");
  });

  test("BR-BOM-12 release with a reason returns only id, status, version, retiredPreviousId", async () => {
    const { part, bomId } = await activeCasting();
    const st = await call("bo", "POST", `/parts/${part.id}/revisions`);
    const rel = await release(st.json.data.id, "  3 bushes  ");
    expect(rel.status).toBe(200);
    expect(Object.keys(rel.json.data).sort()).toEqual([
      "id",
      "retiredPreviousId",
      "status",
      "version",
    ]);
    expect(rel.json.data.status).toBe("active");
    expect(rel.json.data.retiredPreviousId).toBe(bomId);
    const d = await detail(st.json.data.id);
    expect(d.changeReason).toBe("3 bushes");
  });

  test("BR-BOM-12 deleted draft A makes rev B the first release: no reason needed", async () => {
    const part = await mkPart();
    const a = await create(part.id, { kind: "assembly", lines: [] });
    await call("bo", "DELETE", `/${a.json.data.id}`);
    const b = await create(part.id, {
      kind: "assembly",
      lines: [line((await mkRaw()).id)],
    });
    const rel = await release(b.json.data.id);
    expect(rel.status).toBe(200);
  });

  test("BR-BOM-12 an item deactivated since the draft was saved blocks release; every problem listed", async () => {
    const part = await mkPart();
    const x = await mkRaw();
    const y = await mkRaw();
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line(x.id), line(y.id)],
    });
    await db
      .update(itemMaster)
      .set({ isActive: false })
      .where(inArray(itemMaster.id, [x.id, y.id]));
    const rel = await release(res.json.data.id);
    expect(rel.status).toBe(400);
    expect(rel.json.code).toBe("BOM_RELEASE_INVALID");
    expect(rel.json.details.problems.length).toBeGreaterThanOrEqual(2);
    expect((await detail(res.json.data.id)).status).toBe("draft");
  });

  test("BR-BOM-12 inactive part blocks release of its draft", async () => {
    const d = await draftAssembly();
    await db
      .update(itemMaster)
      .set({ isActive: false })
      .where(eq(itemMaster.id, d.part.id));
    const rel = await release(d.bomId);
    expect(rel.status).toBe(400);
  });
});

describe("BR-BOM-13 change summary", () => {
  test("BR-BOM-13 first revision says firstRevision", async () => {
    const d = await draftAssembly();
    const s = await call("bo", "GET", `/${d.bomId}/change-summary`);
    expect(s.status).toBe(200);
    expect(s.json.data.firstRevision).toBe(true);
    expect(s.json.data.against).toBeNull();
    expect(s.json.data.version).toBe(1);
  });

  test("BR-BOM-13 lists changed line qty and header field with old -> new", async () => {
    const { part, bush } = await activeCasting();
    const st = await call("bo", "POST", `/parts/${part.id}/revisions`);
    const id = st.json.data.id;
    const patch = await call("bo", "PATCH", `/${id}`, {
      version: st.json.data.version,
      kind: "casting",
      casting: castingBlock({ meltLossPct: 4 }),
      lines: [line(bush.id, 3)],
    });
    expect(patch.status).toBe(200);
    const s = await call("owner", "GET", `/${id}/change-summary`);
    expect(s.json.data.firstRevision).toBe(false);
    expect(s.json.data.against.revision).toBe("A");
    const ch = s.json.data.lines.changed.find(
      (c: { componentItemId: number }) => c.componentItemId === bush.id,
    );
    expect(ch.qtyOld).toBe(2);
    expect(ch.qtyNew).toBe(3);
    const hdr = s.json.data.header.find((h: { field: string }) =>
      /melt/i.test(h.field),
    );
    expect(Number(hdr.old)).toBe(3);
    expect(Number(hdr.new)).toBe(4);
    expect(s.json.data.version).toBe(patch.json.data.version);
  });

  test("BR-BOM-13 lists added and removed lines", async () => {
    const a = await activeAssembly([line((await mkRaw()).id, 1)]);
    const [first] = await db
      .select({ c: bomLines.componentItemId })
      .from(bomLines)
      .where(eq(bomLines.bomId, a.bomId));
    const added = await mkRaw();
    const st = await call("bo", "POST", `/parts/${a.part.id}/revisions`);
    await call("bo", "PATCH", `/${st.json.data.id}`, {
      version: st.json.data.version,
      kind: "assembly",
      lines: [line(added.id, 1)],
    });
    const s = await call("owner", "GET", `/${st.json.data.id}/change-summary`);
    expect(
      s.json.data.lines.added.map(
        (l: { componentItemId: number }) => l.componentItemId,
      ),
    ).toEqual([added.id]);
    expect(
      s.json.data.lines.removed.map(
        (l: { componentItemId: number }) => l.componentItemId,
      ),
    ).toEqual([first?.c]);
  });

  test("BR-BOM-13 identical draft shows no changes and can still be released", async () => {
    const { part } = await activeCasting();
    const st = await call("bo", "POST", `/parts/${part.id}/revisions`);
    const s = await call("owner", "GET", `/${st.json.data.id}/change-summary`);
    expect(s.json.data.against.revision).toBe("A");
    expect(s.json.data.header).toEqual([]);
    expect(s.json.data.lines.added).toEqual([]);
    expect(s.json.data.lines.removed).toEqual([]);
    expect(s.json.data.lines.changed).toEqual([]);
    expect(s.json.data.canRelease).toBe(true);
    const rel = await release(st.json.data.id, "no change, re-issue");
    expect(rel.status).toBe(200);
  });
});

describe("BR-BOM-14 revisions", () => {
  test("BR-BOM-14 start revision copies the active revision into the next draft", async () => {
    const { part, bomId } = await activeCasting();
    const st = await call("bo", "POST", `/parts/${part.id}/revisions`);
    expect(st.status).toBe(201);
    expect(st.json.data.status).toBe("draft");
    const a = await detail(bomId);
    const b = await detail(st.json.data.id);
    expect(b.revision).toBe("B");
    expect(b.casting.netWeightKg).toBe(a.casting.netWeightKg);
    expect(
      b.lines.map((l: { componentItemId: number }) => l.componentItemId),
    ).toEqual(
      a.lines.map((l: { componentItemId: number }) => l.componentItemId),
    );
  });

  test("BR-BOM-14 a second start revision is 409 naming the open draft", async () => {
    const x = await activeWithDraft();
    const again = await call("bo", "POST", `/parts/${x.part.id}/revisions`);
    expect(again.status).toBe(409);
    expect(again.json.code).toBe("BOM_DRAFT_OPEN");
    expect(again.json.details.draftId).toBe(x.draftId);
  });

  test("BR-BOM-14 create on a part with only retired revisions is 409 BOM_ALREADY_EXISTS", async () => {
    const x = await activeAssembly([line((await mkRaw()).id)]);
    await call("owner", "POST", `/${x.bomId}/retire`, {
      reason: "die scrapped",
    });
    const res = await create(x.part.id, { kind: "assembly", lines: [] });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("BOM_ALREADY_EXISTS");
  });

  test("BR-BOM-14 start revision on a part with only a retired revision copies it", async () => {
    const x = await activeCasting();
    await call("owner", "POST", `/${x.bomId}/retire`, {
      reason: "die scrapped",
    });
    const st = await call("bo", "POST", `/parts/${x.part.id}/revisions`);
    expect(st.status).toBe(201);
    const b = await detail(st.json.data.id);
    expect(b.revision).toBe("B");
    expect(b.casting).not.toBeNull();
  });

  test("BR-BOM-14 start revision on a part with no BOM is 404", async () => {
    const part = await mkPart();
    const st = await call("bo", "POST", `/parts/${part.id}/revisions`);
    expect(st.status).toBe(404);
  });

  test("BR-BOM-14 create on a part that has a draft is 409", async () => {
    const d = await draftAssembly();
    const res = await create(d.part.id, { kind: "assembly", lines: [] });
    expect(res.status).toBe(409);
  });
});

describe("BR-BOM-15 delete", () => {
  test("BR-BOM-15 delete a draft: gone, audit row stays, part is free for a new draft", async () => {
    const x = await activeWithDraft();
    const del = await call("bo", "DELETE", `/${x.draftId}`);
    expect(del.status).toBe(200);
    expect(del.json.data).toEqual({ id: x.draftId, deleted: true });
    expect((await call("owner", "GET", `/${x.draftId}`)).status).toBe(404);
    const hist = await call("owner", "GET", `/parts/${x.part.id}/history`);
    expect(
      hist.json.data.some((h: { action: string }) => h.action === "delete"),
    ).toBe(true);
    const again = await call("bo", "POST", `/parts/${x.part.id}/revisions`);
    expect(again.status).toBe(201);
  });

  test("BR-BOM-15 delete an active revision is 409", async () => {
    const x = await activeCasting();
    const del = await call("bo", "DELETE", `/${x.bomId}`);
    expect(del.status).toBe(409);
    expect(del.json.code).toBe("BOM_NOT_DRAFT");
  });

  test("BR-BOM-15 delete a retired revision is 409", async () => {
    const x = await activeCasting();
    await call("owner", "POST", `/${x.bomId}/retire`, {
      reason: "die scrapped",
    });
    expect((await call("bo", "DELETE", `/${x.bomId}`)).status).toBe(409);
  });
});

describe("BR-BOM-16 retire", () => {
  test("BR-BOM-16 retire with a reason makes the revision retired", async () => {
    const x = await activeCasting();
    const res = await call("owner", "POST", `/${x.bomId}/retire`, {
      reason: "  die scrapped ",
    });
    expect(res.status).toBe(200);
    expect(res.json.data.status).toBe("retired");
    const d = await detail(x.bomId);
    expect(d.retireReason).toBe("die scrapped");
    expect(d.retiredByName).toBe(actors.owner?.name as string);
  });

  test("BR-BOM-16 retire needs a reason of 3-500 chars after trimming", async () => {
    const x = await activeCasting();
    for (const reason of [undefined, "", "  ab ", "x".repeat(501)]) {
      const res = await call("owner", "POST", `/${x.bomId}/retire`, {
        reason,
      });
      expect(res.status).toBe(400);
    }
    expect((await detail(x.bomId)).status).toBe("active");
  });

  test("BR-BOM-16 retire of a non-active revision is 409", async () => {
    const d = await draftAssembly();
    const res = await call("owner", "POST", `/${d.bomId}/retire`, {
      reason: "die scrapped",
    });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("BOM_NOT_ACTIVE");
  });

  test("BR-BOM-16 a BOM using the retired part then treats it as bought (no_bom); where-used lists it before", async () => {
    const sub = await activeCasting();
    const parent = await activeAssembly([line(sub.part.id, 1)]);
    const before = await call(
      "owner",
      "GET",
      `/items/${sub.part.id}/where-used`,
    );
    expect(
      before.json.data.some((r: { bomId: number }) => r.bomId === parent.bomId),
    ).toBe(true);
    await call("owner", "POST", `/${sub.bomId}/retire`, {
      reason: "die scrapped",
    });
    const tree = await call("owner", "GET", `/${parent.bomId}/tree`);
    expect(tree.json.data.children[0].treatment).toBe("no_bom");
  });

  test("BR-BOM-16 retire is refused (403) for back office without bom.release", async () => {
    const x = await activeCasting();
    const res = await call("bo", "POST", `/${x.bomId}/retire`, {
      reason: "die scrapped",
    });
    expect(res.status).toBe(403);
  });
});

describe("BR-BOM-17 one active revision", () => {
  test("BR-BOM-17 release of B retires A in one step", async () => {
    const x = await activeCasting();
    const st = await call("bo", "POST", `/parts/${x.part.id}/revisions`);
    const rel = await release(st.json.data.id, "new die insert");
    expect(rel.status).toBe(200);
    expect((await detail(x.bomId)).status).toBe("retired");
    expect((await detail(st.json.data.id)).status).toBe("active");
    const rows = await db
      .select({ id: boms.id })
      .from(boms)
      .where(eq(boms.partId, x.part.id));
    const act = await db
      .select({ id: boms.id, status: boms.status })
      .from(boms)
      .where(eq(boms.partId, x.part.id));
    expect(rows.length).toBe(2);
    expect(act.filter((r) => r.status === "active").length).toBe(1);
  });

  test("BR-BOM-17 two releases at once: one wins, the other is 409 and stays draft", async () => {
    const x = await activeCasting();
    const st = await call("bo", "POST", `/parts/${x.part.id}/revisions`);
    const id = st.json.data.id;
    const body = { version: st.json.data.version, reason: "race" };
    const [r1, r2] = await Promise.all([
      call("owner", "POST", `/${id}/release`, body),
      call("owner", "POST", `/${id}/release`, body),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const act = await db
      .select({ status: boms.status })
      .from(boms)
      .where(eq(boms.partId, x.part.id));
    expect(act.filter((r) => r.status === "active").length).toBe(1);
  });
});

describe("BR-BOM-18 needs preview", () => {
  async function hsg() {
    const rc = await activeCasting();
    const mcPart = await mkPart();
    const mc = await create(mcPart.id, {
      kind: "job_work",
      jobWork: jobWorkBlock(rc.part.id),
    });
    expect(mc.status).toBe(201);
    expect((await release(mc.json.data.id)).status).toBe(200);
    return { rc, mcPart, mcBomId: mc.json.data.id as number };
  }

  test("BR-BOM-18 1000 job-work pieces send 1021, pour 1075, alloy 900.100 kg, inserts 2150", async () => {
    const { rc, mcPart } = await hsg();
    const res = await call(
      "owner",
      "GET",
      `/needs?partId=${mcPart.id}&qty=1000`,
    );
    expect(res.status).toBe(200);
    expect(res.json.data.partId).toBe(mcPart.id);
    expect(res.json.data.qty).toBe(1000);
    // biome-ignore lint/suspicious/noExplicitAny: row shape from contract
    const rows: any[] = res.json.data.rows;
    const rcRow = rows.find((r) => r.itemId === rc.part.id);
    expect(rcRow.qty).toBe(1021);
    expect(rcRow.pourQty).toBe(1075);
    expect(rcRow.alloyKg).toBeCloseTo(900.1, 3);
    const bush = res.json.data.toBuy.find(
      (r: { itemId: number }) => r.itemId === rc.bush.id,
    );
    expect(bush.qty).toBe(2150);
  });

  test("BR-BOM-18 same item on two paths: each path rounded up, then summed (21 + 11 = 32)", async () => {
    const carton = await mkRaw();
    const s1 = await activeAssembly([line(carton.id, 0.02)]);
    const s2 = await activeAssembly([line(carton.id, 0.01)]);
    const top = await activeAssembly([
      line(s1.part.id, 1.021),
      line(s2.part.id, 1.03),
    ]);
    const res = await call(
      "owner",
      "GET",
      `/needs?partId=${top.part.id}&qty=1000`,
    );
    expect(res.status).toBe(200);
    const buy = res.json.data.toBuy.find(
      (r: { itemId: number }) => r.itemId === carton.id,
    );
    expect(buy.qty).toBe(32);
  });

  test("BR-BOM-18 job work with send 2 : return 1 sends ceil(ceil(Q / (1 - loss)) x 2)", async () => {
    const sent = await mkRaw();
    const part = await mkPart();
    const c = await create(part.id, {
      kind: "job_work",
      jobWork: jobWorkBlock(sent.id, {
        sendQty: 2,
        returnQty: 1,
        jobWorkLossPct: 2,
      }),
    });
    await release(c.json.data.id);
    const res = await call("owner", "GET", `/needs?partId=${part.id}&qty=1000`);
    const buy = res.json.data.toBuy.find(
      (r: { itemId: number }) => r.itemId === sent.id,
    );
    expect(buy.qty).toBe(2042); // ceil(1000/0.98)=1021 -> x2
    expect(buy.noBom).toBe(true);
  });

  test("BR-BOM-18 levels=1 does not walk the children", async () => {
    const sub = await activeCasting();
    const top = await activeAssembly([line(sub.part.id, 1)]);
    const res = await call(
      "owner",
      "GET",
      `/needs?partId=${top.part.id}&qty=10&levels=1`,
    );
    expect(res.status).toBe(200);
    const ids = res.json.data.rows.map((r: { itemId: number }) => r.itemId);
    expect(ids).not.toContain(sub.bush.id);
  });

  test("BR-BOM-18 qty 0, decimal, above 1,000,000 is 400", async () => {
    const x = await activeCasting();
    for (const q of ["0", "1.5", "1000001", "abc"]) {
      const res = await call(
        "owner",
        "GET",
        `/needs?partId=${x.part.id}&qty=${q}`,
      );
      expect(res.status).toBe(400);
    }
    const max = await call(
      "owner",
      "GET",
      `/needs?partId=${x.part.id}&qty=1000000`,
    );
    expect(max.status).toBe(200);
  });

  test("BR-BOM-18 part with no active revision is 409 NO_ACTIVE_BOM", async () => {
    const d = await draftAssembly();
    const res = await call("owner", "GET", `/needs?partId=${d.part.id}&qty=5`);
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("NO_ACTIVE_BOM");
  });

  test("BR-BOM-18 unknown part is 404", async () => {
    const res = await call("owner", "GET", "/needs?partId=2147483000&qty=5");
    expect(res.status).toBe(404);
  });
});

describe("BR-BOM-19 where-used", () => {
  test("BR-BOM-19 lists active revisions only, with role and qty per piece", async () => {
    const x = await activeCasting();
    const bush = await call("owner", "GET", `/items/${x.bush.id}/where-used`);
    expect(bush.status).toBe(200);
    const row = bush.json.data.find(
      (r: { bomId: number }) => r.bomId === x.bomId,
    );
    expect(row.role).toBe("line");
    expect(row.qtyPerPiece).toBe(2);
    expect(row.revision).toBe("A");
    expect(row.partId).toBe(x.part.id);
  });

  test("BR-BOM-19 alloy role lists active casting revisions; a draft is not listed", async () => {
    const x = await activeCasting();
    const st = await call("bo", "POST", `/parts/${x.part.id}/revisions`);
    const res = await call(
      "owner",
      "GET",
      `/items/${alloyId}/where-used?pageSize=100`,
    );
    const mine = res.json.data.filter(
      (r: { partId: number }) => r.partId === x.part.id,
    );
    expect(mine.length).toBe(1);
    expect(mine[0].role).toBe("alloy");
    expect(mine[0].bomId).toBe(x.bomId);
    expect(mine[0].bomId).not.toBe(st.json.data.id);
  });

  test("BR-BOM-19 sent item role", async () => {
    const sent = await mkRaw();
    const part = await mkPart();
    const c = await create(part.id, {
      kind: "job_work",
      jobWork: jobWorkBlock(sent.id),
    });
    await release(c.json.data.id);
    const res = await call("owner", "GET", `/items/${sent.id}/where-used`);
    expect(res.json.data[0].role).toBe("sent_item");
    expect(res.json.data[0].qtyPerPiece).toBe(1);
  });

  test("BR-BOM-19 retired revision is not listed", async () => {
    const x = await activeCasting();
    await call("owner", "POST", `/${x.bomId}/retire`, {
      reason: "die scrapped",
    });
    const res = await call("owner", "GET", `/items/${x.bush.id}/where-used`);
    expect(res.json.data).toEqual([]);
  });

  test("BR-BOM-19 unknown item is 404", async () => {
    expect(
      (await call("owner", "GET", "/items/2147483000/where-used")).status,
    ).toBe(404);
  });
});

describe("BR-BOM-20 item in use", () => {
  test("BR-BOM-20 unit of a line item on a draft BOM cannot change", async () => {
    const d = await draftAssembly();
    const res = await app.request(`/api/asset/items/${d.comp.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${actors.bo?.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uom: "kg" }),
    });
    expect(res.status).toBe(409);
    // biome-ignore lint/suspicious/noExplicitAny: error body
    expect(((await res.json()) as any).code).toBe("ITEM_IN_USE");
  });

  test("BR-BOM-20 alloy unit and part SKU cannot change", async () => {
    const x = await activeCasting();
    for (const [id, body] of [
      [alloyId, { uom: "pcs" }],
      [x.part.id, { sku: `${uid()}_new` }],
    ] as const) {
      const res = await app.request(`/api/asset/items/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${actors.bo?.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(409);
    }
  });
});

describe("BR-BOM-21 inactive things", () => {
  test("BR-BOM-21 deactivated line item stays on the active revision, tagged inactive", async () => {
    const x = await activeCasting();
    await db
      .update(itemMaster)
      .set({ isActive: false })
      .where(eq(itemMaster.id, x.bush.id));
    const d = await detail(x.bomId);
    expect(d.status).toBe("active");
    expect(d.lines[0].inactive).toBe(true);
    // a new draft saved with it is refused
    const st = await call("bo", "POST", `/parts/${x.part.id}/revisions`);
    const rel = await release(st.json.data.id, "carry on");
    expect(rel.status).toBe(400);
  });

  test("BR-BOM-21 saving a new draft with an inactive component is 400", async () => {
    const part = await mkPart();
    const dead = await mkItem({ isActive: false });
    const res = await create(part.id, {
      kind: "assembly",
      lines: [line(dead.id)],
    });
    expect(res.status).toBe(400);
  });

  test("BR-BOM-21 deactivated job worker: active revision tagged, new release refused", async () => {
    const [v] = await db
      .insert(supplierMaster)
      .values({ name: uid(), type: "service_provider", isActive: true })
      .returning({ id: supplierMaster.id });
    const vid = must(v, "vendor").id;
    vendorIds.push(vid);
    await db.insert(supplierServices).values({
      supplierId: vid,
      serviceId,
      serviceUnitPricePaise: 100,
      taxPercentage: 0,
    });
    const sent = await mkRaw();
    const part = await mkPart();
    const c = await create(part.id, {
      kind: "job_work",
      jobWork: jobWorkBlock(sent.id, { jobWorkerId: vid }),
    });
    expect((await release(c.json.data.id)).status).toBe(200);
    await db
      .update(supplierMaster)
      .set({ isActive: false })
      .where(eq(supplierMaster.id, vid));
    const d = await detail(c.json.data.id);
    expect(d.jobWork.jobWorkerInactive).toBe(true);
    const st = await call("bo", "POST", `/parts/${part.id}/revisions`);
    const rel = await release(st.json.data.id, "carry on");
    expect(rel.status).toBe(400);
  });
});

describe("BR-BOM-22 permissions", () => {
  test("BR-BOM-22 no token is 401", async () => {
    expect((await call(null, "GET", "")).status).toBe(401);
  });

  test("BR-BOM-22 role without any BOM key cannot read (403)", async () => {
    expect((await call("qa", "GET", "")).status).toBe(403);
    expect((await call("qa", "GET", "/needs?partId=1&qty=1")).status).toBe(403);
  });

  test("BR-BOM-22 floor supervisor reads but cannot create, edit, delete or start revision (403)", async () => {
    const d = await draftAssembly();
    expect((await call("fs", "GET", `/${d.bomId}`)).status).toBe(200);
    expect((await call("fs", "GET", "")).status).toBe(200);
    const part = await mkPart();
    expect(
      (await create(part.id, { kind: "assembly", lines: [] }, "fs")).status,
    ).toBe(403);
    expect(
      (
        await call("fs", "PATCH", `/${d.bomId}`, {
          version: 1,
          kind: "assembly",
          lines: [],
        })
      ).status,
    ).toBe(403);
    expect((await call("fs", "DELETE", `/${d.bomId}`)).status).toBe(403);
    expect(
      (await call("fs", "POST", `/parts/${d.part.id}/revisions`)).status,
    ).toBe(403);
  });

  test("BR-BOM-22 back office cannot release (403, nothing changes)", async () => {
    const d = await draftAssembly();
    const res = await call("bo", "POST", `/${d.bomId}/release`, { version: 1 });
    expect(res.status).toBe(403);
    expect(res.json.code).toBe("PERMISSION_DENIED");
    expect((await detail(d.bomId)).status).toBe("draft");
  });

  test("BR-BOM-22 floor supervisor cannot release or retire (403)", async () => {
    const d = await draftAssembly();
    expect(
      (await call("fs", "POST", `/${d.bomId}/release`, { version: 1 })).status,
    ).toBe(403);
    expect(
      (await call("fs", "POST", `/${d.bomId}/retire`, { reason: "abcdef" }))
        .status,
    ).toBe(403);
  });

  test("BR-BOM-22 write routes return only id, status, version (no BOM content)", async () => {
    const part = await mkPart();
    const comp = await mkRaw();
    const c = await create(part.id, {
      kind: "assembly",
      lines: [line(comp.id)],
    });
    expect(Object.keys(c.json.data).sort()).toEqual([
      "id",
      "status",
      "version",
    ]);
    const p = await call("bo", "PATCH", `/${c.json.data.id}`, {
      version: 1,
      kind: "assembly",
      lines: [line(comp.id, 2)],
    });
    expect(Object.keys(p.json.data).sort()).toEqual([
      "id",
      "status",
      "version",
    ]);
    const rel = await release(c.json.data.id);
    expect(rel.json.data.lines).toBeUndefined();
    const ret = await call("owner", "POST", `/${c.json.data.id}/retire`, {
      reason: "die scrapped",
    });
    expect(Object.keys(ret.json.data).sort()).toEqual([
      "id",
      "status",
      "version",
    ]);
  });
});

describe("BR-BOM-23 audit", () => {
  test("BR-BOM-23 create, edit, release and retire each write a history row with who and when", async () => {
    const part = await mkPart();
    const comp = await mkRaw();
    const c = await create(part.id, {
      kind: "assembly",
      lines: [line(comp.id)],
    });
    await call("bo", "PATCH", `/${c.json.data.id}`, {
      version: 1,
      kind: "assembly",
      lines: [line(comp.id, 2)],
    });
    await release(c.json.data.id);
    await call("owner", "POST", `/${c.json.data.id}/retire`, {
      reason: "die scrapped",
    });
    const h = await call("owner", "GET", `/parts/${part.id}/history`);
    expect(h.status).toBe(200);
    const actions = h.json.data.map((r: { action: string }) => r.action);
    for (const a of ["create", "edit", "release", "retire"]) {
      expect(actions).toContain(a);
    }
    const rel = h.json.data.find(
      (r: { action: string }) => r.action === "release",
    );
    expect(rel.changedBy.id).toBe(actors.owner?.id as number);
    expect(rel.changedAt).toBeTruthy();
    expect(rel.revision).toBe("A");
    // newest first
    const times = h.json.data.map((r: { changedAt: string }) =>
      Date.parse(r.changedAt),
    );
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  test("BR-BOM-23 the release reason is kept in history and on the revision", async () => {
    const x = await activeCasting();
    const st = await call("bo", "POST", `/parts/${x.part.id}/revisions`);
    await release(st.json.data.id, "3 bushes");
    const h = await call("owner", "GET", `/parts/${x.part.id}/history`);
    const rel = h.json.data.find(
      (r: { action: string; revision: string }) =>
        r.action === "release" && r.revision === "B",
    );
    expect(rel.reason).toBe("3 bushes");
  });
});

describe("BR-BOM-24 next step", () => {
  test("BR-BOM-24 draft: owner sees release, back office sees waiting_for_release", async () => {
    const d = await draftAssembly();
    expect((await detail(d.bomId, "owner")).nextStep).toBe("release");
    expect((await detail(d.bomId, "bo")).nextStep).toBe("waiting_for_release");
  });

  test("BR-BOM-24 active without open draft: start_revision with next letter", async () => {
    const x = await activeCasting();
    const d = await detail(x.bomId, "bo");
    expect(d.nextStep).toBe("start_revision");
    expect(d.nextRevision).toBe("B");
  });

  test("BR-BOM-24 active with an open draft does not offer start revision", async () => {
    const x = await activeWithDraft();
    const d = await detail(x.bomId, "bo");
    expect(d.nextStep).not.toBe("start_revision");
  });

  test("BR-BOM-24 floor supervisor on active revision is not offered start revision", async () => {
    const x = await activeCasting();
    const d = await detail(x.bomId, "fs");
    expect(d.nextStep).not.toBe("start_revision");
    expect(d.nextStep).not.toBe("create");
  });

  test("BR-BOM-24 retired revision with an active one offers open_active", async () => {
    const x = await activeCasting();
    const st = await call("bo", "POST", `/parts/${x.part.id}/revisions`);
    await release(st.json.data.id, "new insert");
    const d = await detail(x.bomId, "owner");
    expect(d.status).toBe("retired");
    expect(d.nextStep).toBe("open_active");
    expect(d.activeBomId).toBe(st.json.data.id);
  });
});

describe("BR-BOM-25 list", () => {
  test("BR-BOM-25 default shows active and draft, not retired", async () => {
    const x = await activeCasting();
    await call("owner", "POST", `/${x.bomId}/retire`, {
      reason: "die scrapped",
    });
    const st = await call("bo", "POST", `/parts/${x.part.id}/revisions`);
    const def = await call("owner", "GET", `/?q=${x.part.sku}`);
    expect(def.status).toBe(200);
    const statuses = def.json.data.map((r: { status: string }) => r.status);
    expect(statuses).toEqual(["draft"]);
    expect(def.json.data[0].id).toBe(st.json.data.id);
  });

  test("BR-BOM-25 status filter retired returns only retired", async () => {
    const x = await activeCasting();
    await call("owner", "POST", `/${x.bomId}/retire`, {
      reason: "die scrapped",
    });
    const res = await call("owner", "GET", `/?status=retired&q=${x.part.sku}`);
    expect(res.json.data.length).toBe(1);
    expect(res.json.data[0].status).toBe("retired");
  });

  test("BR-BOM-25 kind filter and row shape", async () => {
    const x = await activeCasting();
    const res = await call("owner", "GET", `/?kind=casting&q=${x.part.sku}`);
    expect(res.json.data.length).toBe(1);
    const row = res.json.data[0];
    expect(row.number).toBe(`BOM-${x.part.sku}-A`);
    expect(row.partSku).toBe(x.part.sku);
    expect(row.kind).toBe("casting");
    expect(row.releasedAt).toBeTruthy();
    const none = await call("owner", "GET", `/?kind=assembly&q=${x.part.sku}`);
    expect(none.json.data).toEqual([]);
  });

  test("BR-BOM-25 a part's page lists all its revisions newest first", async () => {
    const x = await activeCasting();
    await call("owner", "POST", `/${x.bomId}/retire`, {
      reason: "die scrapped",
    });
    const st = await call("bo", "POST", `/parts/${x.part.id}/revisions`);
    expect(st.status).toBe(201);
    const res = await call("owner", "GET", `/?partId=${x.part.id}`);
    expect(res.json.data.map((r: { revision: string }) => r.revision)).toEqual([
      "B",
      "A",
    ]);
  });

  test("BR-BOM-25 page size above 100 is 400; 10 per page by default", async () => {
    expect((await call("owner", "GET", "/?pageSize=101")).status).toBe(400);
    expect((await call("owner", "GET", "/?pageSize=0")).status).toBe(400);
    const res = await call("owner", "GET", "/");
    expect(res.json.meta.pageSize).toBe(10);
    expect(res.json.meta.page).toBe(1);
  });
});

describe("BR-BOM-26 incomplete drafts", () => {
  test("BR-BOM-26 a casting draft without shot weight is saved, release lists the missing field", async () => {
    const part = await mkPart();
    const { shotWeightKg: _omit, ...partial } = castingBlock();
    const res = await create(part.id, { kind: "casting", casting: partial });
    expect(res.status).toBe(201);
    const rel = await release(res.json.data.id);
    expect(rel.status).toBe(400);
    expect(rel.json.code).toBe("BOM_RELEASE_INVALID");
    expect(JSON.stringify(rel.json.details.problems)).toMatch(/shot/i);
  });

  test("BR-BOM-26 a job-work draft with no job worker is saved, release is 400", async () => {
    const part = await mkPart();
    const sent = await mkRaw();
    const res = await create(part.id, {
      kind: "job_work",
      jobWork: { sentItemId: sent.id, sendQty: 1, returnQty: 1 },
    });
    expect(res.status).toBe(201);
    expect((await release(res.json.data.id)).status).toBe(400);
  });

  test("BR-BOM-26 given values are still checked on a draft", async () => {
    const part = await mkPart();
    const { shotWeightKg: _omit, ...partial } = castingBlock({
      castingRejectPct: 50,
    });
    const res = await create(part.id, { kind: "casting", casting: partial });
    expect(res.status).toBe(400);
  });
});

describe("BR-BOM-27 no prices", () => {
  test("BR-BOM-27 no price, rate or cost key in any BOM response", async () => {
    const rc = await activeCasting();
    const mcPart = await mkPart();
    const mc = await create(mcPart.id, {
      kind: "job_work",
      jobWork: jobWorkBlock(rc.part.id),
    });
    await release(mc.json.data.id);
    const responses = [
      await call("owner", "GET", `/${mc.json.data.id}`),
      await call("owner", "GET", `/${mc.json.data.id}/tree`),
      await call("owner", "GET", `/${mc.json.data.id}/change-summary`),
      await call("owner", "GET", `/needs?partId=${mcPart.id}&qty=10`),
      await call("owner", "GET", `/?q=${mcPart.sku}`),
      await call("owner", "GET", `/items/${rc.part.id}/where-used`),
      await call("owner", "GET", `/parts/${mcPart.id}/history`),
    ];
    for (const r of responses) {
      expect(r.status).toBe(200);
      const bad = keysDeep(r.json.data).filter((k) =>
        /price|cost|paise|^rate$|amount/i.test(k),
      );
      expect(bad).toEqual([]);
    }
  });
});

describe("BR-BOM-28 version token", () => {
  test("BR-BOM-28 every save changes the version; detail returns it", async () => {
    const d = await draftAssembly();
    expect((await detail(d.bomId)).version).toBe(1);
    const p = await call("bo", "PATCH", `/${d.bomId}`, {
      version: 1,
      kind: "assembly",
      lines: [line(d.comp.id, 2)],
    });
    expect(p.status).toBe(200);
    expect(p.json.data.version).not.toBe(1);
    expect((await detail(d.bomId)).version).toBe(p.json.data.version);
  });

  test("BR-BOM-28 PATCH with a stale version is 409 BOM_CHANGED_SINCE_REVIEW, nothing changes", async () => {
    const d = await draftAssembly();
    await call("bo", "PATCH", `/${d.bomId}`, {
      version: 1,
      kind: "assembly",
      lines: [line(d.comp.id, 2)],
    });
    const stale = await call("bo", "PATCH", `/${d.bomId}`, {
      version: 1,
      kind: "assembly",
      lines: [line(d.comp.id, 5)],
    });
    expect(stale.status).toBe(409);
    expect(stale.json.code).toBe("BOM_CHANGED_SINCE_REVIEW");
    expect((await detail(d.bomId)).lines[0].qtyPerPiece).toBe(2);
  });

  test("BR-BOM-28 release with the token from before a later save is 409, stays draft", async () => {
    const d = await draftAssembly();
    const summary = await call("owner", "GET", `/${d.bomId}/change-summary`);
    const seen = summary.json.data.version;
    await call("bo", "PATCH", `/${d.bomId}`, {
      version: seen,
      kind: "assembly",
      lines: [line(d.comp.id, 4)],
    });
    const rel = await call("owner", "POST", `/${d.bomId}/release`, {
      version: seen,
    });
    expect(rel.status).toBe(409);
    expect(rel.json.code).toBe("BOM_CHANGED_SINCE_REVIEW");
    expect((await detail(d.bomId)).status).toBe("draft");
    const fresh = await call("owner", "GET", `/${d.bomId}/change-summary`);
    const ok = await call("owner", "POST", `/${d.bomId}/release`, {
      version: fresh.json.data.version,
    });
    expect(ok.status).toBe(200);
  });

  test("BR-BOM-28 two users editing from the same version: one saves, the other is 409", async () => {
    const d = await draftAssembly();
    const body = (q: number) => ({
      version: 1,
      kind: "assembly",
      lines: [line(d.comp.id, q)],
    });
    const [a, b] = await Promise.all([
      call("bo", "PATCH", `/${d.bomId}`, body(2)),
      call("owner", "PATCH", `/${d.bomId}`, body(3)),
    ]);
    // owner holds bom.manage too
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  test("BR-BOM-28 PATCH without a version is 400", async () => {
    const d = await draftAssembly();
    const res = await call("bo", "PATCH", `/${d.bomId}`, {
      kind: "assembly",
      lines: [line(d.comp.id, 2)],
    });
    expect(res.status).toBe(400);
  });
});
