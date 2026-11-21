/**
 * Shared fixtures for the scm-rfq HTTP tests (docs/specs/rfq/spec.md).
 * Test code only. Each test file calls makeRfqFx("<tag>") and gets its own TEST_<tag>_ prefix, its own rows and
 * its own cleanup(), so files never depend on each other's data. Real DB, full app via createApp().
 * Fixture shortcut (not a production path): approved PRs and their lines are inserted straight into the tables.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  documentNumberCounters,
  rolePermissions,
  roles,
} from "../../src/db/schemas/01_auth";
import {
  approvalPolicies,
  approvalRequests,
  approvalTrails,
} from "../../src/db/schemas/02_procurement-approval";
import { itemMaster } from "../../src/db/schemas/02_procurement-catalog";
import {
  poCommunications,
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  rateContractItems,
  rateContracts,
  rfqItems,
  rfqQuoteItems,
  rfqQuotes,
  rfqSuppliers,
  rfqs,
} from "../../src/db/schemas/02_procurement-rfq";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

// biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
export type Json = any;
export type Actor = {
  id: number;
  token: string;
  userName?: string;
  role?: string;
};
export type Res = { status: number; json: Json };

export type Rfq = {
  id: number;
  rfqNumber: string;
  prId: number;
  prItemIds: number[];
  itemIds: number[];
  lineIds: number[]; // rfq_items ids, same order as prItemIds
  supplierIds: number[];
  qtys: number[];
};

export type QLine = {
  quoted?: boolean;
  rate?: number;
  gst?: number;
  lead?: number;
  freight?: number;
};
export type QOpts = {
  ref?: string;
  quoteDate?: string;
  validTill?: string;
  terms?: number;
  lines?: QLine[];
};

/** IST calendar day, `offsetDays` from now. */
export const istDay = (offsetDays = 0) =>
  new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400000)
    .toISOString()
    .slice(0, 10);

export function makeRfqFx(tag: string) {
  const RUN = `TEST_${tag}_${Date.now()}`;
  const app = createApp();
  let seq = 0;
  const uid = () => `${RUN}_${++seq}`;
  const created = {
    employees: [] as number[],
    roles: [] as number[],
    suppliers: [] as number[],
    items: [] as number[],
    prs: [] as number[],
    priorities: [] as number[],
  };

  // ---- actors: real employees; seed role name, or a custom role holding exactly `keys` ----
  const actorCache = new Map<string, Actor>();
  async function actor(key: string, spec: string | string[]): Promise<Actor> {
    const hit = actorCache.get(key);
    if (hit) return hit;
    let roleId: number;
    let roleName: string;
    if (typeof spec === "string") {
      const [r] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, spec))
        .limit(1);
      if (!r) throw new Error(`seed role ${spec} missing`);
      roleId = r.id;
      roleName = spec;
    } else {
      roleName = `${RUN}_role_${key}`;
      const [r] = await db
        .insert(roles)
        .values({ name: roleName, isSystem: false })
        .returning({ id: roles.id });
      roleId = r!.id;
      created.roles.push(roleId);
      if (spec.length)
        await db
          .insert(rolePermissions)
          .values(spec.map((permissionKey) => ({ roleId, permissionKey })));
    }
    const [e] = await db
      .insert(employees)
      .values({ name: `${RUN}_${key}`, roleId, isActive: true })
      .returning({ id: employees.id });
    created.employees.push(e!.id);
    const token = await signAccessToken({
      userId: e!.id,
      userName: `${RUN}_${key}`,
      role: roleName,
      allowedPages: [],
    });
    const a = { id: e!.id, token, userName: `${RUN}_${key}`, role: roleName };
    actorCache.set(key, a);
    return a;
  }
  const owner = () => actor("owner", "owner");
  const owner2 = () => actor("owner2", "owner");
  const bo = () => actor("bo", "back_office");
  const floor = () => actor("floor", "floor_supervisor");
  const superAdmin = () => actor("sa", "super-admin");

  async function call(
    method: string,
    path: string,
    who: Actor | null,
    body?: unknown,
  ): Promise<Res> {
    const headers: Record<string, string> = {};
    if (who) {
      // sign per request so a shifted clock (setSystemTime) always gets a fresh, unexpired token
      const token =
        who.userName && who.role
          ? await signAccessToken({
              userId: who.id,
              userName: who.userName,
              role: who.role,
              allowedPages: [],
            })
          : who.token;
      headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }
  const rfqApi = (
    method: string,
    path: string,
    who: Actor | null,
    b?: unknown,
  ) => call(method, `/api/rfq${path}`, who, b);
  const rcApi = (
    method: string,
    path: string,
    who: Actor | null,
    b?: unknown,
  ) => call(method, `/api/rate-contract${path}`, who, b);
  const poApi = (
    method: string,
    path: string,
    who: Actor | null,
    b?: unknown,
  ) => call(method, `/api/po${path}`, who, b);

  // ---- masters ----
  async function newSupplier(
    o: { active?: boolean; terms?: number } = {},
  ): Promise<number> {
    const [s] = await db
      .insert(supplierMaster)
      .values({
        name: uid(),
        isActive: o.active ?? true,
        defaultPaymentTermsDays: o.terms ?? 0,
        address: "Supplier Road, Mysuru",
      })
      .returning({ id: supplierMaster.id });
    created.suppliers.push(s!.id);
    return s!.id;
  }
  async function newItem(
    o: { uom?: string; active?: boolean } = {},
  ): Promise<number> {
    const [it] = await db
      .insert(itemMaster)
      .values({
        sku: uid(),
        name: `${RUN} item`,
        category: "Raw Material",
        uom: o.uom ?? "kg",
        isActive: o.active ?? true,
        hsnCode: "7601",
      })
      .returning({ id: itemMaster.id });
    created.items.push(it!.id);
    return it!.id;
  }

  /** One approved PR with one pending line per entry of `qtys`. */
  async function newPr(
    o: {
      qtys?: number[] | undefined;
      itemIds?: number[] | undefined;
      status?:
        | "draft"
        | "approved"
        | "partial_ordered"
        | "cancelled"
        | undefined;
      type?: "misc" | "maintenance" | "stock_reorder" | "tooling" | undefined;
    } = {},
  ) {
    const qtys = o.qtys ?? [1000];
    const requestedBy = (await owner()).id;
    const [pr] = await db
      .insert(purchaseRequests)
      .values({
        prNumber: uid(),
        type: o.type ?? "misc",
        status: o.status ?? "approved",
        requestedBy,
        notes: `${RUN} pr`,
      })
      .returning({ id: purchaseRequests.id });
    created.prs.push(pr!.id);
    const prItemIds: number[] = [];
    const itemIds: number[] = [];
    for (const [i, qty] of qtys.entries()) {
      const itemId = o.itemIds?.[i] ?? (await newItem());
      itemIds.push(itemId);
      const [l] = await db
        .insert(purchaseRequestItems)
        .values({ prId: pr!.id, itemId, requestedQty: qty, uom: "kg" })
        .returning({ id: purchaseRequestItems.id });
      prItemIds.push(l!.id);
    }
    return { prId: pr!.id, prItemIds, itemIds, qtys };
  }

  // ---- RFQ ----
  async function mkRfq(
    o: {
      qtys?: number[] | undefined;
      itemIds?: number[] | undefined;
      supplierIds?: number[] | undefined;
      suppliers?: number | undefined;
      send?: boolean | undefined;
      dueInDays?: number | undefined;
      notes?: string | undefined;
      prType?: "misc" | "maintenance" | undefined;
    } = {},
  ): Promise<Rfq> {
    const pr = await newPr({
      qtys: o.qtys,
      itemIds: o.itemIds,
      type: o.prType,
    });
    const supplierIds = o.supplierIds ?? [];
    if (!o.supplierIds)
      for (let i = 0; i < (o.suppliers ?? 3); i++)
        supplierIds.push(await newSupplier());
    const who = await bo();
    const r = await rfqApi("POST", "/createrfq", who, {
      dueDate: istDay(o.dueInDays ?? 5),
      notes: o.notes ?? "internal note",
      supplierIds,
      prItemIds: pr.prItemIds,
    });
    if (r.status !== 201)
      throw new Error(
        `fixture createrfq: ${r.status} ${JSON.stringify(r.json)}`,
      );
    const lines = r.json.data.lines as { id: number; prItemId: number }[];
    const lineIds = pr.prItemIds.map(
      (p) => lines.find((l) => l.prItemId === p)!.id,
    );
    const rfq: Rfq = {
      id: r.json.data.id,
      rfqNumber: r.json.data.rfqNumber,
      prId: pr.prId,
      prItemIds: pr.prItemIds,
      itemIds: pr.itemIds,
      lineIds,
      supplierIds,
      qtys: pr.qtys,
    };
    if (o.send !== false) {
      const s = await rfqApi("POST", `/${rfq.id}/send`, who, {});
      if (s.status !== 200)
        throw new Error(`fixture send: ${s.status} ${JSON.stringify(s.json)}`);
    }
    return rfq;
  }

  // ---- quotes ----
  function quoteBody(rfq: Rfq, supplierId: number | null, o: QOpts = {}) {
    const lines = rfq.lineIds.map((rfqItemId, i) => {
      const l = o.lines?.[i] ?? {};
      if (l.quoted === false) return { rfqItemId, isQuoted: false };
      return {
        rfqItemId,
        isQuoted: true,
        ratePaise: l.rate ?? 24500,
        gstPercent: l.gst ?? 18,
        leadDays: l.lead ?? 7,
        freightPaise: l.freight ?? 0,
      };
    });
    const body: Record<string, unknown> = {
      supplierQuoteRef: o.ref ?? uid(),
      quoteDate: o.quoteDate ?? istDay(0),
      validTill: o.validTill ?? istDay(30),
      lines,
    };
    if (supplierId !== null) body.supplierId = supplierId;
    if (o.terms !== undefined) body.paymentTermsDays = o.terms;
    return body;
  }
  async function enterQuote(
    rfq: Rfq,
    supplierId: number,
    o: QOpts = {},
    who?: Actor,
  ) {
    return rfqApi(
      "POST",
      `/${rfq.id}/quotes`,
      who ?? (await bo()),
      quoteBody(rfq, supplierId, o),
    );
  }
  /** Enter (and by default submit) a quote. Returns ids aligned with rfq.lineIds. */
  async function mkQuote(
    rfq: Rfq,
    supplierId: number,
    o: QOpts & { submit?: boolean } = {},
  ) {
    const r = await enterQuote(rfq, supplierId, o);
    if (r.status !== 201)
      throw new Error(`fixture quote: ${r.status} ${JSON.stringify(r.json)}`);
    const quoteId = r.json.data.id as number;
    const ql = r.json.data.lines as { id: number; rfqItemId: number }[];
    const quoteItemIds = rfq.lineIds.map(
      (id) => ql.find((x) => x.rfqItemId === id)!.id,
    );
    if (o.submit !== false) {
      const s = await rfqApi(
        "POST",
        `/quotes/${quoteId}/submit`,
        await bo(),
        {},
      );
      if (s.status !== 200)
        throw new Error(
          `fixture submit: ${s.status} ${JSON.stringify(s.json)}`,
        );
    }
    return { quoteId, quoteItemIds, res: r };
  }
  const award = (
    rfq: Rfq,
    picks: { line: number; quoteItemId: number; reason?: string }[],
    who: Actor,
  ) =>
    rfqApi("POST", `/${rfq.id}/award`, who, {
      lines: picks.map((p) => {
        const row: Record<string, unknown> = {
          rfqItemId: rfq.lineIds[p.line],
          quoteItemId: p.quoteItemId,
        };
        if (p.reason !== undefined) row.reason = p.reason;
        return row;
      }),
    });

  // ---- contracts ----
  async function mkContract(o: {
    supplierId: number;
    items: {
      itemId: number;
      rate?: number | undefined;
      gst?: number | undefined;
      agreedQty?: number | null | undefined;
    }[];
    validFrom?: string | undefined;
    validTo?: string | undefined;
    allowance?: number | undefined;
    activate?: boolean | undefined;
  }) {
    const who = await owner();
    const r = await rcApi("POST", "/createcontract", who, {
      supplierId: o.supplierId,
      validFrom: o.validFrom ?? istDay(-10),
      validTo: o.validTo ?? istDay(30),
      allowancePercent: o.allowance ?? 0,
      lines: o.items.map((i) => ({
        itemId: i.itemId,
        ratePaise: i.rate ?? 24400,
        gstPercent: i.gst ?? 18,
        agreedQty: i.agreedQty === undefined ? 5000 : i.agreedQty,
      })),
    });
    if (r.status !== 201)
      throw new Error(
        `fixture contract: ${r.status} ${JSON.stringify(r.json)}`,
      );
    const id = r.json.data.id as number;
    const lineIds = o.items.map(
      (i) =>
        (r.json.data.lines as { id: number; itemId: number }[]).find(
          (l) => l.itemId === i.itemId,
        )!.id,
    );
    if (o.activate !== false) {
      const a = await rcApi("POST", `/${id}/activate`, who, {});
      if (a.status !== 200)
        throw new Error(
          `fixture activate: ${a.status} ${JSON.stringify(a.json)}`,
        );
    }
    return {
      id,
      contractNumber: r.json.data.contractNumber as string,
      lineIds,
    };
  }

  // ---- PO ----
  const poLine = (
    prItemId: number,
    over: { rate?: number; gst?: number; reason?: string } = {},
  ) => {
    const l: Record<string, unknown> = {
      prItemId,
      unitPricePaise: over.rate ?? 24400,
      gstPercent: over.gst ?? 18,
    };
    if (over.reason !== undefined) l.rateOverrideReason = over.reason;
    return l;
  };
  const createPo = (
    who: Actor,
    supplierId: number,
    lines: Record<string, unknown>[],
  ) =>
    poApi("POST", "/createpo", who, {
      supplierId,
      expectedDeliveryDate: new Date(Date.now() + 10 * 86400000).toISOString(),
      lines,
    });
  /** One-level approval policy for POs of PR type "maintenance", approver = `approverId`. */
  async function maintenancePoPolicy(approverId: number, priority: number) {
    created.priorities.push(priority);
    const who = (await owner()).id;
    await db.insert(approvalPolicies).values({
      name: `${RUN}_po_policy`,
      priority,
      docType: "po",
      subDocType: "maintenance",
      autoApprove: false,
      approvalLevels: 1,
      approvalChain: [
        { level: 1, approverType: "specific" as const, employeeId: approverId },
      ],
      createdBy: who,
      lastUpdatedBy: who,
    });
  }
  const submitPo = (who: Actor, poId: number) =>
    call("POST", "/api/approval/submitRequest", who, {
      docType: "po",
      docId: poId,
    });
  const approve = (who: Actor, requestId: number) =>
    call("POST", `/api/approval/actOnRequest/${requestId}`, who, {
      action: "approve",
      notes: "TEST approve",
    });
  const poItems = async (poId: number, who?: Actor) =>
    (await poApi("GET", `/getpodetails/${poId}`, who ?? (await bo()))).json
      ?.data?.items as Json[];

  async function cleanup() {
    const emp = created.employees;
    const rfqIds = emp.length
      ? (
          await db
            .select({ id: rfqs.id })
            .from(rfqs)
            .where(inArray(rfqs.createdBy, emp))
        ).map((r) => r.id)
      : [];
    const quoteIds = rfqIds.length
      ? (
          await db
            .select({ id: rfqQuotes.id })
            .from(rfqQuotes)
            .where(inArray(rfqQuotes.rfqId, rfqIds))
        ).map((r) => r.id)
      : [];
    const contractIds = emp.length
      ? (
          await db
            .select({ id: rateContracts.id })
            .from(rateContracts)
            .where(inArray(rateContracts.createdBy, emp))
        ).map((r) => r.id)
      : [];
    const poIds = emp.length
      ? (
          await db
            .select({ id: purchaseOrders.id })
            .from(purchaseOrders)
            .where(inArray(purchaseOrders.createdBy, emp))
        ).map((r) => r.id)
      : [];
    if (rfqIds.length)
      await db
        .update(rfqItems)
        .set({ poItemId: null, awardedQuoteItemId: null })
        .where(inArray(rfqItems.rfqId, rfqIds));
    if (poIds.length) {
      const poItemIds = (
        await db
          .select({ id: purchaseOrderItems.id })
          .from(purchaseOrderItems)
          .where(inArray(purchaseOrderItems.poId, poIds))
      ).map((r) => r.id);
      if (poItemIds.length)
        await db
          .delete(prPoItemLinks)
          .where(inArray(prPoItemLinks.poItemId, poItemIds));
      await db
        .delete(poCommunications)
        .where(inArray(poCommunications.poId, poIds));
      const reqIds = (
        await db
          .select({ id: approvalRequests.id })
          .from(approvalRequests)
          .where(
            and(
              eq(approvalRequests.docType, "po"),
              inArray(approvalRequests.docId, poIds),
            ),
          )
      ).map((r) => r.id);
      if (reqIds.length) {
        await db
          .delete(approvalTrails)
          .where(inArray(approvalTrails.requestId, reqIds));
        await db
          .delete(approvalRequests)
          .where(inArray(approvalRequests.id, reqIds));
      }
      await db
        .delete(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.poId, poIds));
      await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
    }
    if (quoteIds.length) {
      await db
        .delete(rfqQuoteItems)
        .where(inArray(rfqQuoteItems.quoteId, quoteIds));
      await db.delete(rfqQuotes).where(inArray(rfqQuotes.id, quoteIds));
    }
    if (rfqIds.length) {
      await db.delete(rfqItems).where(inArray(rfqItems.rfqId, rfqIds));
      await db.delete(rfqSuppliers).where(inArray(rfqSuppliers.rfqId, rfqIds));
      await db.delete(rfqs).where(inArray(rfqs.id, rfqIds));
    }
    if (contractIds.length) {
      await db
        .delete(rateContractItems)
        .where(inArray(rateContractItems.contractId, contractIds));
      await db
        .delete(rateContracts)
        .where(inArray(rateContracts.id, contractIds));
    }
    if (created.prs.length) {
      await db
        .delete(purchaseRequestItems)
        .where(inArray(purchaseRequestItems.prId, created.prs));
      await db
        .delete(purchaseRequests)
        .where(inArray(purchaseRequests.id, created.prs));
    }
    if (created.priorities.length || emp.length)
      await db
        .delete(approvalPolicies)
        .where(
          emp.length && created.priorities.length
            ? or(
                inArray(approvalPolicies.priority, created.priorities),
                inArray(approvalPolicies.createdBy, emp),
              )
            : emp.length
              ? inArray(approvalPolicies.createdBy, emp)
              : inArray(approvalPolicies.priority, created.priorities),
        );
    if (emp.length) {
      await db
        .update(documentNumberCounters)
        .set({ createdBy: null, lastUpdatedBy: null })
        .where(inArray(documentNumberCounters.createdBy, emp));
      await db
        .update(documentNumberCounters)
        .set({ lastUpdatedBy: null })
        .where(inArray(documentNumberCounters.lastUpdatedBy, emp));
    }
    if (created.suppliers.length)
      await db
        .delete(supplierMaster)
        .where(inArray(supplierMaster.id, created.suppliers));
    if (created.items.length)
      await db.delete(itemMaster).where(inArray(itemMaster.id, created.items));
    if (created.roles.length)
      await db
        .delete(rolePermissions)
        .where(inArray(rolePermissions.roleId, created.roles));
    if (emp.length)
      await db.delete(employees).where(inArray(employees.id, emp));
    if (created.roles.length)
      await db.delete(roles).where(inArray(roles.id, created.roles));
  }

  return {
    RUN,
    uid,
    app,
    actor,
    owner,
    owner2,
    bo,
    floor,
    superAdmin,
    call,
    rfqApi,
    rcApi,
    poApi,
    newSupplier,
    newItem,
    newPr,
    mkRfq,
    quoteBody,
    enterQuote,
    mkQuote,
    award,
    mkContract,
    poLine,
    createPo,
    maintenancePoPolicy,
    submitPo,
    approve,
    poItems,
    cleanup,
  };
}
