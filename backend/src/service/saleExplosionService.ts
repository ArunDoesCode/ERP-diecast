import { db } from "../db/client";
import { MAX_BOM_LEVELS, revisionLetter } from "../lib/bom-math";
import { isLockTimeout } from "../lib/db-errors";
import { AppError, BadRequestError, NotFoundError } from "../lib/errors";
import { istDayKey } from "../lib/ist-day";
import { milliToNumber, milliToString, toMilli } from "../lib/milli";
import type { DbTransaction } from "../repository/executor";
import { freeStockByItems } from "../repository/inventoryReadRepository";
import {
  type ExplosionRowInsert,
  type ReservationInsert,
  type SourceInsert,
  type SupplyLine,
  saleExplosionRepository,
} from "../repository/saleExplosionRepository";
import { saleOrderRepository } from "../repository/saleOrderRepository";
import { salesAuditRepository } from "../repository/salesAuditRepository";
import type {
  ExplosionRowsQuery,
  explosionListQuerySchema,
} from "../types/saleOrder.types";
import { EXPLOSION_MAX_ROWS } from "../types/saleOrder.types";
import { expandBomLevel } from "./bomNeedsService";

// Explosion run, snapshot reads. design/api.md "POST /explosions".
// BR-SO-22..38: level by level through the BOM module's `expandBomLevel` (the
// only place the quantities are worked out), an item merged into one row at its
// deepest level and netted once, soft claims on stock and open supply.

type RowType = ExplosionRowInsert["rowType"];

const conflict = (message: string, code: string) =>
  new AppError(message, 409, code);
const soNotFound = () =>
  new NotFoundError("Sale order not found", "SO_NOT_FOUND");
const explosionNotFound = () =>
  new NotFoundError("Explosion not found", "EXPLOSION_NOT_FOUND");

function toMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

const numberOf = (soNumber: string, runNo: number) => `${soNumber}/E${runNo}`;

// ---------------------------------------------------------------------------
// Pass 1: the shape of the BOM graph (which item needs which)
// ---------------------------------------------------------------------------

type Edge = { itemId: number; buyAsIs: boolean; alloy: boolean };
type Inbound = {
  normal: boolean;
  buyAsIs: boolean;
  alloy: boolean;
  hasActiveBom: boolean;
};

/**
 * One `expandBomLevel` call per level (qty 1: only who needs whom matters) with
 * a visited set, so each item is expanded once however often it occurs. At most
 * `MAX_BOM_LEVELS` calls; an expandable item still waiting after that is "too
 * deep" (BR-SO-28).
 */
async function walkStructure(tx: DbTransaction, rootIds: number[]) {
  const struct = new Map<number, Edge[]>(); // items with an active BOM
  const inbound = new Map<number, Inbound>();
  const visited = new Set<number>();
  const markInbound = (
    itemId: number,
    kind: "normal" | "buyAsIs" | "alloy",
    hasActiveBom: boolean,
  ) => {
    const cur = inbound.get(itemId) ?? {
      normal: false,
      buyAsIs: false,
      alloy: false,
      hasActiveBom,
    };
    cur[kind] = true;
    cur.hasActiveBom = cur.hasActiveBom || hasActiveBom;
    inbound.set(itemId, cur);
  };

  let frontier = [...new Set(rootIds)];
  for (let level = 1; level <= MAX_BOM_LEVELS && frontier.length > 0; level++) {
    const batch = frontier.filter((id) => !visited.has(id));
    for (const id of batch) visited.add(id);
    if (batch.length === 0) {
      frontier = [];
      break;
    }
    const expanded = await expandBomLevel(tx, {
      items: batch.map((partId) => ({ partId, qty: 1 })),
    });
    const next = new Set<number>();
    expanded.forEach((part, i) => {
      const id = batch[i] as number;
      if (part.node.status !== "ok") return;
      const edges: Edge[] = [];
      for (const c of part.children) {
        edges.push({ itemId: c.itemId, buyAsIs: c.buyAsIs, alloy: false });
        markInbound(c.itemId, c.buyAsIs ? "buyAsIs" : "normal", c.hasActiveBom);
        if (c.hasActiveBom && !c.buyAsIs && !visited.has(c.itemId)) {
          next.add(c.itemId);
        }
      }
      if (part.node.alloy) {
        edges.push({
          itemId: part.node.alloy.itemId,
          buyAsIs: false,
          alloy: true,
        });
        markInbound(part.node.alloy.itemId, "alloy", false);
      }
      struct.set(id, edges);
    });
    frontier = [...next];
  }
  const tooDeep = new Set(frontier.filter((id) => !visited.has(id)));
  return { struct, inbound, tooDeep };
}

/**
 * Levels of the part (itself included) below a node: 1 for a leaf. Infinity
 * for a loop or a chain deeper than the BOM limit (+1 for the bought leaves).
 */
function depthOf(
  id: number,
  struct: Map<number, Edge[]>,
  tooDeep: Set<number>,
  memo: Map<number, number>,
  stack: Set<number>,
): number {
  if (stack.has(id) || tooDeep.has(id)) return Number.POSITIVE_INFINITY;
  const known = memo.get(id);
  if (known !== undefined) return known;
  const edges = struct.get(id);
  if (!edges) return 1;
  stack.add(id);
  let best = 0;
  for (const e of edges) {
    const d =
      e.buyAsIs || e.alloy
        ? 1
        : depthOf(e.itemId, struct, tooDeep, memo, stack);
    best = Math.max(best, d);
  }
  stack.delete(id);
  const depth = 1 + best;
  memo.set(id, depth);
  return depth;
}

// ---------------------------------------------------------------------------
// Pass 2: quantities, netting, claims
// ---------------------------------------------------------------------------

type SourceAcc = { soLineId: number; viaItemId: number | null; qty: number };
type Acc = {
  gross: number;
  level: number;
  sources: Map<string, SourceAcc>;
  /** some of the need came from a parent item, not straight from an SO line */
  fromParent: boolean;
};
type Claim = {
  kind: "stock" | "open_pr" | "open_po" | "open_sco";
  lineId?: number;
  qty: number;
};
type RowDraft = {
  itemId: number;
  level: number;
  rowType: RowType;
  tag: string | null;
  blockReason: string | null;
  bomRevisionId: number | null;
  uom: string;
  gross: number;
  onHand: number;
  reservedOther: number;
  openPr: number;
  openPo: number;
  openSco: number;
  late: number;
  net: number;
  pour: number | null;
  send: number | null;
  requiredBy: string;
  sources: SourceAcc[];
  claims: Claim[];
  walkable: boolean;
};

const TYPE_OF_TREATMENT = {
  cast: "cast",
  job_work: "job_work",
  assemble: "assemble",
} as const;

/** BR-SO-29..34: stock first, then open supply that is due in time and unclaimed. */
function allocate(
  gross: number,
  onHand: number,
  reservedOther: number,
  requiredBy: string,
  supply: { kind: "open_pr" | "open_po" | "open_sco"; lines: SupplyLine[] }[],
) {
  const free = Math.max(0, onHand - reservedOther);
  const stockUsed = Math.min(gross, free);
  let remaining = gross - stockUsed;
  const claims: Claim[] = [];
  if (stockUsed > 0) claims.push({ kind: "stock", qty: stockUsed });
  const counted = { open_pr: 0, open_po: 0, open_sco: 0 };
  let late = 0;
  for (const { kind, lines } of supply) {
    const sorted = [...lines].sort(
      (a, b) =>
        (a.due ?? "9999-12-31").localeCompare(b.due ?? "9999-12-31") ||
        a.lineId - b.lineId,
    );
    for (const line of sorted) {
      const avail = Math.max(0, line.openMilli - line.claimedMilli);
      if (avail === 0) continue;
      if (line.due !== null && line.due > requiredBy) {
        late += avail; // BR-SO-32: due after the need, shown but not counted
        continue;
      }
      counted[kind] += avail;
      const take = Math.min(remaining, avail);
      if (take > 0) {
        claims.push({ kind, lineId: line.lineId, qty: take });
        remaining -= take;
      }
    }
  }
  return {
    claims,
    late,
    openPr: counted.open_pr,
    openPo: counted.open_po,
    openSco: counted.open_sco,
    net: remaining,
  };
}

/** A child's share of one parent's sources, by SO line, exact to the thousandth. */
function splitBySource(parent: Acc, via: number, qty: number): SourceAcc[] {
  const byLine = new Map<number, number>();
  for (const s of parent.sources.values()) {
    byLine.set(s.soLineId, (byLine.get(s.soLineId) ?? 0) + s.qty);
  }
  const total = [...byLine.values()].reduce((a, b) => a + b, 0);
  const parts: SourceAcc[] = [];
  let given = 0;
  for (const [soLineId, weight] of byLine) {
    const share = Number(
      (BigInt(qty) * BigInt(weight)) / BigInt(Math.max(total, 1)),
    );
    given += share;
    parts.push({ soLineId, viaItemId: via, qty: share });
  }
  const first = parts[0];
  if (first) first.qty += qty - given;
  return parts.filter((p) => p.qty > 0);
}

async function buildExplosion(
  tx: DbTransaction,
  so: { id: number },
  lines: Awaited<ReturnType<typeof saleOrderRepository.findLines>>,
) {
  const open = lines
    .map((l) => ({
      line: l.line,
      openMilli: toMilli(l.line.qty) - toMilli(l.line.deliveredQty),
    }))
    .filter((l) => l.openMilli > 0); // BR-SO-09: open qty only
  const lineById = new Map(open.map((l) => [l.line.id, l.line]));
  const rootIds = [...new Set(open.map((l) => l.line.itemId))];

  const { struct, inbound, tooDeep } = await walkStructure(tx, rootIds);

  // BR-SO-28: a line whose tree loops or is too deep stops at its top item.
  const memo = new Map<number, number>();
  const loopRoots = new Set<number>();
  for (const id of rootIds) {
    const d = depthOf(id, struct, tooDeep, memo, new Set());
    if (!Number.isFinite(d) || d > MAX_BOM_LEVELS + 1) loopRoots.add(id);
  }
  const walkable = (id: number) => struct.has(id) && !loopRoots.has(id);

  // Deepest level each item occurs at (longest path from any top item).
  const levelOf = new Map<number, number>();
  for (const id of rootIds) levelOf.set(id, 1);
  for (let round = 0; round <= MAX_BOM_LEVELS + 2; round++) {
    let changed = false;
    for (const [id, level] of [...levelOf]) {
      if (!walkable(id)) continue;
      for (const e of struct.get(id) ?? []) {
        if ((levelOf.get(e.itemId) ?? 0) < level + 1) {
          levelOf.set(e.itemId, level + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const allItemIds = new Set<number>(levelOf.keys());
  const items = await saleOrderRepository.findItemsByIds([...allItemIds], tx);

  const acc = new Map<number, Acc>();
  const addSource = (a: Acc, s: SourceAcc) => {
    const key = `${s.soLineId}|${s.viaItemId ?? 0}`;
    const cur = a.sources.get(key);
    if (cur) cur.qty += s.qty;
    else a.sources.set(key, { ...s });
  };
  const accOf = (itemId: number) => {
    let a = acc.get(itemId);
    if (!a) {
      a = { gross: 0, level: 1, sources: new Map(), fromParent: false };
      acc.set(itemId, a);
    }
    return a;
  };
  for (const { line, openMilli } of open) {
    const a = accOf(line.itemId);
    a.gross += openMilli;
    addSource(a, { soLineId: line.id, viaItemId: null, qty: openMilli });
  }

  const drafts: RowDraft[] = [];
  const draftOf = new Map<number, RowDraft>();
  const maxLevel = Math.max(1, ...levelOf.values());

  for (let level = 1; level <= maxLevel; level++) {
    const ids = [...levelOf.entries()]
      .filter(([id, l]) => l === level && (acc.get(id)?.gross ?? 0) > 0)
      .map(([id]) => id);
    if (ids.length === 0) continue;

    const [stock, reserved, prLines, poLines, scoLines] = [
      await freeStockByItems(tx, ids),
      await saleExplosionRepository.reservedStockByItems(ids, so.id, tx),
      await saleExplosionRepository.openPrLines(ids, so.id, tx),
      await saleExplosionRepository.openPoLines(ids, so.id, tx),
      await saleExplosionRepository.openScoLines(ids, so.id, tx),
    ];
    const group = (all: SupplyLine[]) => {
      const m = new Map<number, SupplyLine[]>();
      for (const l of all) m.set(l.itemId, [...(m.get(l.itemId) ?? []), l]);
      return m;
    };
    const prBy = group(prLines);
    const poBy = group(poLines);
    const scoBy = group(scoLines);

    const levelDrafts: RowDraft[] = [];
    for (const id of ids) {
      const a = acc.get(id) as Acc;
      const info = items.get(id);
      if (!info) continue;
      const sources = [...a.sources.values()].filter((s) => s.qty > 0);
      const requiredBy = sources
        .map((s) => lineById.get(s.soLineId)?.deliveryDate ?? "9999-12-31")
        .sort()[0] as string;
      const onHand = Math.round((stock.get(id) ?? 0) * 1000);
      const reservedOther = reserved.get(id) ?? 0;
      const alloc = allocate(a.gross, onHand, reservedOther, requiredBy, [
        { kind: "open_pr", lines: prBy.get(id) ?? [] },
        { kind: "open_po", lines: poBy.get(id) ?? [] },
        { kind: "open_sco", lines: scoBy.get(id) ?? [] },
      ]);

      const inb = inbound.get(id);
      const isWalkable = walkable(id);
      const rowType: RowType = "buy";
      let tag: string | null = null;
      let blockReason: string | null = null;
      if (loopRoots.has(id)) blockReason = "bom_loop";
      else if (!isWalkable) {
        if (inb?.hasActiveBom) tag = "buy_as_is";
        else if (!(inb && !inb.normal && !inb.buyAsIs && inb.alloy))
          tag = "no_bom"; // an alloy bought by its casting is plain "buy"
      }
      if (!blockReason && !info.isActive) blockReason = "inactive_item";
      if (
        !blockReason &&
        tag === "no_bom" &&
        !a.fromParent &&
        rootIds.includes(id)
      ) {
        blockReason = "no_active_bom"; // BR-SO-26: a line item with no BOM
      }

      const draft: RowDraft = {
        itemId: id,
        level: Math.min(a.level, 10),
        rowType,
        tag,
        blockReason,
        bomRevisionId: null,
        uom: info.uom,
        gross: a.gross,
        onHand,
        reservedOther,
        openPr: alloc.openPr,
        openPo: alloc.openPo,
        openSco: alloc.openSco,
        late: alloc.late,
        net: alloc.net,
        pour: null,
        send: null,
        requiredBy,
        sources,
        claims: alloc.claims,
        walkable: isWalkable,
      };
      levelDrafts.push(draft);
    }

    // BR-SO-23: the level's quantities come from the BOM module, once for the level.
    const walkDrafts = levelDrafts.filter((d) => d.walkable);
    if (walkDrafts.length > 0) {
      const expanded = await expandBomLevel(tx, {
        items: walkDrafts.map((d) => ({
          partId: d.itemId,
          // net 0: only the node (type, BOM revision) is read
          qty: Math.max(1, Math.ceil(d.net / 1000)),
        })),
      });
      expanded.forEach((part, i) => {
        const d = walkDrafts[i] as RowDraft;
        const parent = acc.get(d.itemId) as Acc;
        if (part.node.status !== "ok") {
          d.walkable = false;
          d.tag = "no_bom";
          return;
        }
        d.rowType = TYPE_OF_TREATMENT[part.node.treatment];
        d.bomRevisionId = part.node.bomId;
        if (d.net <= 0) return;
        if (part.node.pourQty !== undefined) d.pour = part.node.pourQty;
        if (part.node.jobWork) d.send = part.node.jobWork.sendNeed;
        const needs = part.children.map((c) => ({
          itemId: c.itemId,
          qty: toMilli(c.qty),
        }));
        if (part.node.alloy) {
          needs.push({
            itemId: part.node.alloy.itemId,
            qty: toMilli(part.node.alloy.kg),
          });
        }
        for (const need of needs) {
          if (need.qty <= 0) continue;
          const child = accOf(need.itemId);
          child.gross += need.qty;
          child.fromParent = true;
          child.level = Math.max(child.level, d.level + 1);
          for (const s of splitBySource(parent, d.itemId, need.qty)) {
            addSource(child, s);
          }
        }
      });
    }

    for (const d of levelDrafts) {
      drafts.push(d);
      draftOf.set(d.itemId, d);
    }
    if (drafts.length > EXPLOSION_MAX_ROWS) {
      throw new BadRequestError(
        `An explosion may have at most ${EXPLOSION_MAX_ROWS} rows`,
        "EXPLOSION_TOO_LARGE",
      );
    }
  }

  // BR-SO-38: rows that were not walked still record the item's active BOM.
  const unwalked = drafts.filter((d) => d.bomRevisionId === null);
  const activeBoms = await saleExplosionRepository.activeBomIds(
    unwalked.map((d) => d.itemId),
    tx,
  );
  for (const d of unwalked) d.bomRevisionId = activeBoms.get(d.itemId) ?? null;

  return drafts;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const saleExplosionService = {
  // BR-SO-21..38: one transaction, advisory lock -> SO row -> work.
  async run(soId: number, actorId: number) {
    try {
      return await db.transaction(async (tx) => {
        if (!(await saleExplosionRepository.tryLockSoRun(soId, tx))) {
          throw conflict(
            "This sale order is being exploded right now",
            "EXPLOSION_IN_PROGRESS",
          );
        }
        await saleExplosionRepository.lockGlobalRun(tx);

        const so = await saleOrderRepository.lockById(soId, tx);
        if (!so) throw soNotFound();
        if (so.status !== "confirmed") {
          throw conflict(
            `A ${so.status.replace("_", " ")} sale order cannot be exploded`,
            "SO_NOT_CONFIRMED",
          );
        }

        const now = new Date();
        // BR-SO-35, 36: the old snapshot and its claims end in this transaction.
        const previousRunNo = await saleExplosionRepository.supersedeCurrent(
          soId,
          now,
          tx,
        );
        await saleOrderRepository.releaseReservations(soId, tx);

        const lines = await saleOrderRepository.findLines(soId, tx);
        const drafts = await buildExplosion(tx, so, lines);

        const runNo = await saleExplosionRepository.nextRunNo(soId, tx);
        const explosion = await saleExplosionRepository.insertExplosion(
          {
            soId,
            runNo,
            status: "current",
            soNeedVersion: so.needVersion,
            soDeliveryVersion: so.deliveryVersion,
            createdBy: actorId,
            createdAt: now,
          },
          tx,
        );
        if (!explosion) throw new BadRequestError("Explosion was not saved");

        const inserted = await saleExplosionRepository.insertRows(
          drafts.map(
            (d): ExplosionRowInsert => ({
              explosionId: explosion.id,
              itemId: d.itemId,
              level: d.level,
              rowType: d.rowType,
              tag: d.tag,
              blockReason: d.blockReason,
              bomRevisionId: d.bomRevisionId,
              uom: d.uom,
              grossQty: milliToString(d.gross),
              onHandQty: milliToString(d.onHand),
              reservedOtherQty: milliToString(d.reservedOther),
              openPrQty: milliToString(d.openPr),
              openPoQty: milliToString(d.openPo),
              openScoQty: milliToString(d.openSco),
              lateSupplyQty: milliToString(d.late),
              netQty: milliToString(d.net),
              pourQty: d.pour === null ? null : milliToString(d.pour * 1000),
              sendQty: d.send === null ? null : milliToString(d.send * 1000),
              requiredBy: d.requiredBy,
            }),
          ),
          tx,
        );
        const rowIdOf = new Map(inserted.map((r) => [r.itemId, r.id]));

        const sources: SourceInsert[] = [];
        const reservations: ReservationInsert[] = [];
        for (const d of drafts) {
          const rowId = rowIdOf.get(d.itemId) as number;
          for (const s of d.sources) {
            sources.push({
              rowId,
              soLineId: s.soLineId,
              viaItemId: s.viaItemId,
              qty: milliToString(s.qty),
            });
          }
          for (const c of d.claims) {
            reservations.push({
              rowId,
              soId,
              itemId: d.itemId,
              kind: c.kind,
              prItemId: c.kind === "open_pr" ? (c.lineId ?? null) : null,
              poItemId: c.kind === "open_po" ? (c.lineId ?? null) : null,
              scoItemId: c.kind === "open_sco" ? (c.lineId ?? null) : null,
              qty: milliToString(c.qty),
            });
          }
        }
        await saleExplosionRepository.insertSources(sources, tx);
        await saleExplosionRepository.insertReservations(reservations, tx);

        const flaggedCount = drafts.filter((d) => d.blockReason).length;
        const number = numberOf(so.soNumber, runNo);
        await salesAuditRepository.write(
          {
            actorId,
            action: "so.explode",
            targetType: "explosion",
            targetId: explosion.id,
            soId,
            before:
              previousRunNo === null
                ? null
                : { supersededRunNo: previousRunNo },
            after: { number, rowCount: drafts.length, flaggedCount },
          },
          tx,
        );
        return {
          id: explosion.id,
          runNo,
          number,
          createdAt: explosion.createdAt,
          rowCount: drafts.length,
          flaggedCount,
        };
      });
    } catch (error) {
      if (isLockTimeout(error)) {
        throw conflict(
          "Another explosion is running. Try again in a moment.",
          "EXPLOSION_BUSY",
        );
      }
      throw error;
    }
  },

  async list(
    soId: number,
    query: ReturnType<typeof explosionListQuerySchema.parse>,
  ) {
    if (!(await saleOrderRepository.findStatusById(soId))) throw soNotFound();
    const { rows, total } = await saleExplosionRepository.list(soId, query);
    return {
      data: rows.map((r) => ({
        id: r.id,
        runNo: r.runNo,
        number: numberOf(r.soNumber, r.runNo),
        status: r.status,
        outOfDate: r.outOfDate,
        createdByName: r.createdByName ?? "",
        createdAt: r.createdAt,
        supersededAt: r.supersededAt,
        rowCount: r.rowCount,
        flaggedCount: r.flaggedCount,
      })),
      meta: toMeta(query.page, query.pageSize, total),
    };
  },

  // BR-SO-21, 38: header, totals, out-of-date reasons, BOM revisions used.
  async details(soId: number, eid: number) {
    const h = await saleExplosionRepository.findHeader(soId, eid);
    if (!h) throw explosionNotFound();
    const [totals, revisions] = await Promise.all([
      saleExplosionRepository.totals(eid),
      saleExplosionRepository.bomRevisions(eid),
    ]);
    // only the current snapshot can be out of date (BR-SO-38)
    const current = h.status === "current";
    const outOfDateReasons = [
      ...(current && h.soChanged ? (["so_changed"] as const) : []),
      ...(current && h.bomChanged ? (["bom_changed"] as const) : []),
      ...(current && h.deliveryChanged ? (["delivery_changed"] as const) : []),
    ];
    return {
      id: h.id,
      runNo: h.runNo,
      number: numberOf(h.soNumber, h.runNo),
      status: h.status,
      outOfDate: outOfDateReasons.length > 0,
      outOfDateReasons,
      createdBy: h.createdBy,
      createdByName: h.createdByName ?? "",
      createdAt: h.createdAt,
      supersededAt: h.supersededAt,
      totals,
      bomRevisions: revisions.map((r) => ({
        partSku: r.partSku,
        revision: revisionLetter(r.revisionNo),
      })),
    };
  },

  // BR-SO-50, 51: the screen's rows; no price anywhere.
  async rows(
    soId: number,
    eid: number,
    query: ExplosionRowsQuery,
    canSeeCandidates: boolean,
  ) {
    const h = await saleExplosionRepository.findHeader(soId, eid);
    if (!h) throw explosionNotFound();
    const usable =
      h.status === "current" &&
      !h.soChanged &&
      !h.deliveryChanged &&
      !h.bomChanged;
    const { rows, total } = await saleExplosionRepository.listRows(eid, query);

    const rowIds = rows.map((r) => r.row.id);
    const sources = await saleExplosionRepository.sourcesForRows(eid, rowIds);
    const sourcesOf = new Map<number, typeof sources>();
    for (const s of sources) {
      sourcesOf.set(s.rowId, [...(sourcesOf.get(s.rowId) ?? []), s]);
    }

    const serviceIds = [
      ...new Set(
        rows
          .filter((r) => r.row.rowType === "job_work" && r.bomServiceId)
          .map((r) => r.bomServiceId as number),
      ),
    ];
    const candidates = canSeeCandidates
      ? await saleExplosionRepository.candidatesForServices(serviceIds)
      : [];

    const today = istDayKey();
    return {
      data: rows.map((r) => {
        const row = r.row;
        const onHand = toMilli(row.onHandQty);
        const reservedOther = toMilli(row.reservedOtherQty);
        const net = toMilli(row.netQty);
        const raised =
          r.prId !== null && row.prItemId !== null
            ? {
                type: "pr" as const,
                docId: r.prId,
                docNumber: r.prNumber as string,
                qty: Number(row.raisedQty ?? 0),
                at: row.raisedAt as Date,
              }
            : r.scoId !== null && row.scoItemId !== null
              ? {
                  type: "sco" as const,
                  docId: r.scoId,
                  docNumber: r.scoNumber as string,
                  qty: Number(row.raisedQty ?? 0),
                  at: row.raisedAt as Date,
                }
              : null;
        return {
          id: row.id,
          itemId: row.itemId,
          sku: r.sku,
          name: r.name,
          level: row.level,
          type: row.rowType,
          tag: (row.tag as "no_bom" | "buy_as_is" | null) ?? null,
          blockReason:
            (row.blockReason as
              | "inactive_item"
              | "no_active_bom"
              | "bom_loop"
              | null) ?? null,
          bomRevision:
            r.bomRevisionNo === null ? null : revisionLetter(r.bomRevisionNo),
          bomRevisionId: row.bomRevisionId,
          uom: row.uom,
          grossQty: Number(row.grossQty),
          onHandQty: milliToNumber(onHand),
          reservedOtherQty: milliToNumber(reservedOther),
          freeQty: milliToNumber(Math.max(0, onHand - reservedOther)),
          openPrQty: Number(row.openPrQty),
          openPoQty: Number(row.openPoQty),
          openScoQty: Number(row.openScoQty),
          lateSupplyQty: Number(row.lateSupplyQty),
          netQty: milliToNumber(net),
          pourQty: row.pourQty === null ? null : Number(row.pourQty),
          sendQty: row.sendQty === null ? null : Number(row.sendQty),
          requiredBy: row.requiredBy,
          pastDue: row.requiredBy < today,
          selectable:
            usable &&
            raised === null &&
            row.blockReason === null &&
            (row.rowType === "buy" || row.rowType === "job_work") &&
            net > 0,
          raised,
          sources: (sourcesOf.get(row.id) ?? []).map((s) => ({
            soLineId: s.soLineId,
            lineNo: s.lineNo,
            qty: Number(s.qty),
            // no parent item = the SO line's own item, which sits at level 1
            sourceSku: s.viaSku ?? s.lineSku,
            sourceLevel: s.viaSku === null ? 1 : (s.viaLevel ?? 1),
          })),
          jobWorker:
            row.rowType === "job_work"
              ? {
                  defaultVendorId: r.bomJobWorkerId,
                  serviceId: r.bomServiceId,
                  candidates: candidates
                    .filter((c) => c.serviceId === r.bomServiceId)
                    .map((c) => ({ vendorId: c.vendorId, name: c.name })),
                }
              : null,
        };
      }),
      meta: toMeta(query.page, query.pageSize, total),
    };
  },
};
