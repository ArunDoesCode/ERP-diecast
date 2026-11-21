/**
 * Reorder scheduler tests (docs/specs/reorder/spec.md v1): BR-RO-10, 12, 15.
 * Calls tick(now) with fixed instants on far-future IST days. Real DB;
 * fixtures are TEST_ro_s_ prefixed, settings are restored in afterAll.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { eq, inArray, or } from "drizzle-orm";
import { db } from "../../src/db/client";
import { roles } from "../../src/db/schemas/01_auth";
import {
  purchaseRequestItems,
  purchaseRequests,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  reorderRunItems,
  reorderRuns,
  reorderSettings,
} from "../../src/db/schemas/02_procurement-reorder";
import { employees } from "../../src/db/schemas/03_hcm";
import { tick } from "../../src/service/reorderScheduler";

const RUN = `TEST_ro_s_${Date.now()}`;
let ownerId = 0;
let saved: typeof reorderSettings.$inferSelect | undefined;
const extraRunIds: number[] = [];

// IST 07:00 = 01:30 UTC. Days are far in the future to avoid other data.
const D1 = "2031-03-10";
const D2 = "2031-03-11";
const D3 = "2031-03-12";
const D4 = "2031-03-13";
const D5 = "2031-03-14";
const D6 = "2031-03-15";
const DAYS = [D1, D2, D3, D4, D5, D6];
const at = (iso: string) => new Date(iso);

const scheduled = (day: string) =>
  db.select().from(reorderRuns).where(eq(reorderRuns.scheduledDay, day));

async function setSettings(
  over: Partial<typeof reorderSettings.$inferInsert>,
  changedAt = new Date("2031-01-01T00:00:00Z"),
) {
  await db
    .update(reorderSettings)
    .set({
      enabled: true,
      runHour: 7,
      draftOwnerId: ownerId,
      scheduleChangedAt: changedAt,
      ...over,
    })
    .where(eq(reorderSettings.id, 1));
}

async function clearRuns() {
  const runs = await db
    .select({ id: reorderRuns.id })
    .from(reorderRuns)
    .where(
      or(
        inArray(reorderRuns.scheduledDay, DAYS),
        extraRunIds.length ? inArray(reorderRuns.id, extraRunIds) : undefined,
      ),
    );
  const ids = runs.map((r) => r.id);
  if (!ids.length) return;
  const prs = await db
    .select({ id: purchaseRequests.id })
    .from(purchaseRequests)
    .where(inArray(purchaseRequests.reorderRunId, ids));
  const prIds = prs.map((p) => p.id);
  if (prIds.length) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, prIds));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, prIds));
  }
  await db.delete(reorderRunItems).where(inArray(reorderRunItems.runId, ids));
  await db.delete(reorderRuns).where(inArray(reorderRuns.id, ids));
  extraRunIds.length = 0;
}

beforeAll(async () => {
  const [r] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "back_office"))
    .limit(1);
  const [e] = await db
    .insert(employees)
    .values({ name: `${RUN}_owner`, roleId: r!.id, isActive: true })
    .returning({ id: employees.id });
  ownerId = e!.id;
  [saved] = await db
    .select()
    .from(reorderSettings)
    .where(eq(reorderSettings.id, 1));
});

beforeEach(clearRuns);

afterAll(async () => {
  await clearRuns();
  if (saved) {
    await db
      .update(reorderSettings)
      .set({
        enabled: saved.enabled,
        runHour: saved.runHour,
        draftOwnerId: saved.draftOwnerId,
        scheduleChangedAt: saved.scheduleChangedAt,
      })
      .where(eq(reorderSettings.id, 1));
  }
  await db.delete(employees).where(eq(employees.id, ownerId));
});

describe("BR-RO-10 daily schedule tick", () => {
  test("BR-RO-10 switch off at 07:00 -> no run, no row", async () => {
    await setSettings({ enabled: false });
    await tick(at(`${D1}T01:30:00Z`));
    await tick(at(`${D1}T10:00:00Z`));
    expect((await scheduled(D1)).length).toBe(0);
  });

  test("BR-RO-10 before the run hour (06:59 IST) -> no run", async () => {
    await setSettings({});
    await tick(at(`${D1}T01:29:00Z`));
    expect((await scheduled(D1)).length).toBe(0);
  });

  test("BR-RO-10 at 07:00 IST -> exactly one schedule run with no starter", async () => {
    await setSettings({});
    await tick(at(`${D1}T01:30:00Z`));
    const rows = await scheduled(D1);
    expect(rows.length).toBe(1);
    expect(rows[0]?.trigger).toBe("schedule");
    expect(rows[0]?.startedBy).toBeNull();
  });

  test("BR-RO-10 server down 06:00-09:00 -> one run at 09:00 IST", async () => {
    await setSettings({});
    await tick(at(`${D1}T03:30:00Z`));
    expect((await scheduled(D1)).length).toBe(1);
  });

  test("BR-RO-10 a second tick the same IST day starts no second run", async () => {
    await setSettings({});
    await tick(at(`${D1}T01:30:00Z`));
    await tick(at(`${D1}T01:31:00Z`));
    await tick(at(`${D1}T12:00:00Z`));
    expect((await scheduled(D1)).length).toBe(1);
  });

  test("BR-RO-10 IST day boundary: 23:59 IST still the same day, 00:01 IST next day not due yet", async () => {
    await setSettings({});
    await tick(at(`${D2}T01:30:00Z`));
    await tick(at(`${D2}T18:29:00Z`)); // 23:59 IST on D2
    expect((await scheduled(D2)).length).toBe(1);
    await tick(at(`${D2}T18:31:00Z`)); // 00:01 IST on D3, before 07:00
    expect((await scheduled(D3)).length).toBe(0);
  });

  test("BR-RO-10 a new IST day at its run hour starts a new run", async () => {
    await setSettings({});
    await tick(at(`${D2}T01:30:00Z`));
    await tick(at(`${D3}T01:30:00Z`));
    expect((await scheduled(D2)).length).toBe(1);
    expect((await scheduled(D3)).length).toBe(1);
  });

  test("BR-RO-10 a run hour set to 10 is honoured (09:59 none, 10:00 IST one)", async () => {
    await setSettings({ runHour: 10 });
    await tick(at(`${D4}T04:29:00Z`)); // 09:59 IST
    expect((await scheduled(D4)).length).toBe(0);
    await tick(at(`${D4}T04:30:00Z`)); // 10:00 IST
    expect((await scheduled(D4)).length).toBe(1);
  });

  test("BR-RO-10 switched on at 10:00 after today's run time -> no run today, first run next day", async () => {
    // schedule changed at 10:00 IST on D5 (04:30Z)
    await setSettings({}, at(`${D5}T04:30:00Z`));
    await tick(at(`${D5}T05:00:00Z`));
    expect((await scheduled(D5)).length).toBe(0);
    await tick(at(`${D6}T01:30:00Z`));
    expect((await scheduled(D6)).length).toBe(1);
  });

  test("BR-RO-10 a failed scheduled run uses up the day (no retry)", async () => {
    // no draft owner: the run fails (BR-RO-15 at run time)
    await setSettings({ draftOwnerId: null });
    await tick(at(`${D3}T01:30:00Z`));
    const rows = await scheduled(D3);
    expect(rows.length).toBe(1);
    expect(rows[0]?.state).toBe("failed");
    expect(rows[0]?.failureReason).toBeTruthy();
    await tick(at(`${D3}T01:31:00Z`));
    await tick(at(`${D3}T09:00:00Z`));
    expect((await scheduled(D3)).length).toBe(1);
  });

  test("BR-RO-10 busy at the run time saves nothing, and the next tick starts it", async () => {
    await setSettings({});
    const now = at(`${D4}T01:30:00Z`);
    const [busy] = await db
      .insert(reorderRuns)
      .values({
        trigger: "manual",
        state: "running",
        startedBy: ownerId,
        draftOwnerId: ownerId,
        startedAt: new Date(now.getTime() - 60_000),
      })
      .returning({ id: reorderRuns.id });
    extraRunIds.push(busy!.id);

    await tick(now);
    expect((await scheduled(D4)).length).toBe(0); // nothing saved, day not used

    await db
      .update(reorderRuns)
      .set({ state: "done", finishedAt: now })
      .where(eq(reorderRuns.id, busy!.id));
    await tick(at(`${D4}T01:31:00Z`));
    expect((await scheduled(D4)).length).toBe(1);
  });
});
