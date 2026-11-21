import { db } from "../db/client";
import {
  alloyKg,
  childNeed,
  MAX_BOM_LEVELS,
  MAX_BOM_NODES,
  pourQty,
  revisionLetter,
  sendNeed,
} from "../lib/bom-math";
import { ConflictError, NotFoundError } from "../lib/errors";
import {
  type BomLineRow,
  type BomRow,
  bomRepository,
  type Executor,
} from "../repository/bomRepository";
import type {
  BomKind,
  BomNeedsQuery,
  BomNeedsRow,
  BomTreatment,
} from "../types/bom.types";
import { loopError, tooDeep, tooLarge } from "./bomGraph";

// BR-BOM-18: the one needs calculation. HTTP (GET /needs) and sale order both
// call it; it reads no stock, no prices, and writes nothing. No permission
// check here: the controller does that.

const NEED_CAP = 1e12; // any quantity above this is BOM_TOO_LARGE

export type NeedChild = {
  itemId: number;
  sku: string;
  unit: string;
  qty: number;
  buyAsIs: boolean;
  hasActiveBom: boolean;
  inactive: boolean;
};

export type NeedNode = {
  status: "ok";
  partId: number;
  kind: BomKind;
  bomId: number;
  revision: string;
  treatment: Extract<BomTreatment, "cast" | "job_work" | "assemble">;
  qty: number;
  pourQty?: number;
  alloy?: { itemId: number; sku: string; unit: string; kg: number };
  jobWork?: {
    jobWorkerId: number | null;
    serviceId: number | null;
    sendQty: number;
    returnQty: number;
    jobWorkLossPct: number | null;
    sentItemId: number | null;
    sendNeed: number;
  };
};

export type NoBomNode = { status: "no_bom"; partId: number };

export type ExpandedPart = {
  node: NeedNode | NoBomNode;
  children: NeedChild[];
};

const TREATMENT: Record<BomKind, NeedNode["treatment"]> = {
  casting: "cast",
  job_work: "job_work",
  assembly: "assemble",
};

const toNum = (v: string | null) => (v === null ? null : Number(v));

function capped(qty: number): number {
  if (qty > NEED_CAP) throw tooLarge();
  return qty;
}

/**
 * ONE level of each listed part (batch; a single part is a list of one):
 * its node (treatment, bom, revision, pour / send / alloy) and its direct
 * child needs. No recursion, no stock. A part without an active revision
 * comes back as `{ status: 'no_bom' }` and never throws.
 */
export async function expandBomLevel(
  executor: Executor,
  input: { items: { partId: number; qty: number }[] },
): Promise<ExpandedPart[]> {
  const partIds = [...new Set(input.items.map((i) => i.partId))];
  const { boms: bomRows, lines } = await bomRepository.listActiveFullByParts(
    partIds,
    executor,
  );
  const bomByPart = new Map<number, BomRow>(bomRows.map((b) => [b.partId, b]));
  const linesByBom = new Map<number, BomLineRow[]>();
  for (const l of lines) {
    const list = linesByBom.get(l.bomId);
    if (list) list.push(l);
    else linesByBom.set(l.bomId, [l]);
  }

  const itemIds = new Set<number>();
  for (const l of lines) itemIds.add(l.componentItemId);
  for (const b of bomRows) {
    if (b.sentItemId !== null) itemIds.add(b.sentItemId);
    if (b.alloyItemId !== null) itemIds.add(b.alloyItemId);
  }
  const itemRows = await bomRepository.findItemsWithActiveBom(
    [...itemIds],
    executor,
  );
  const itemById = new Map(itemRows.map((i) => [i.id, i]));

  const childOf = (
    itemId: number,
    qty: number,
    buyAsIs: boolean,
  ): NeedChild | null => {
    const item = itemById.get(itemId);
    if (!item) return null;
    return {
      itemId,
      sku: item.sku,
      unit: item.uom,
      qty: capped(qty),
      buyAsIs,
      hasActiveBom: item.hasActiveBom,
      inactive: !item.isActive,
    };
  };

  return input.items.map(({ partId, qty }): ExpandedPart => {
    const bom = bomByPart.get(partId);
    if (!bom) return { node: { status: "no_bom", partId }, children: [] };
    const revision = revisionLetter(bom.revisionNo);
    const base = {
      status: "ok" as const,
      partId,
      kind: bom.kind,
      bomId: bom.id,
      revision,
      treatment: TREATMENT[bom.kind],
      qty,
    };
    const bomLinesOf = linesByBom.get(bom.id) ?? [];
    const lineChildren = (baseQty: number) =>
      bomLinesOf.flatMap((l) => {
        const item = itemById.get(l.componentItemId);
        const need = childNeed(
          baseQty,
          Number(l.qtyPerPiece),
          item?.uom ?? "pcs",
        );
        const child = childOf(l.componentItemId, need, l.buyAsIs);
        return child ? [child] : [];
      });

    if (bom.kind === "casting") {
      const reject = toNum(bom.castingRejectPct);
      const pour = capped(pourQty(qty, reject));
      const kg = alloyKg(qty, pour, {
        netWeightKg: toNum(bom.netWeightKg),
        shotWeightKg: toNum(bom.shotWeightKg),
        cavities: bom.cavities,
        meltLossPct: toNum(bom.meltLossPct),
      });
      const alloyItem =
        bom.alloyItemId === null ? undefined : itemById.get(bom.alloyItemId);
      return {
        node: {
          ...base,
          pourQty: pour,
          ...(alloyItem && kg !== null
            ? {
                alloy: {
                  itemId: alloyItem.id,
                  sku: alloyItem.sku,
                  unit: alloyItem.uom,
                  kg,
                },
              }
            : {}),
        },
        children: lineChildren(pour), // BR-BOM-06: per poured piece
      };
    }

    if (bom.kind === "job_work") {
      const ratioSend = bom.sendQty ?? 1;
      const ratioReturn = bom.returnQty ?? 1;
      const send = capped(
        sendNeed(qty, toNum(bom.jobWorkLossPct), ratioSend, ratioReturn),
      );
      const sent =
        bom.sentItemId === null ? null : childOf(bom.sentItemId, send, false);
      return {
        node: {
          ...base,
          jobWork: {
            jobWorkerId: bom.jobWorkerId,
            serviceId: bom.serviceId,
            sendQty: ratioSend,
            returnQty: ratioReturn,
            jobWorkLossPct: toNum(bom.jobWorkLossPct),
            sentItemId: bom.sentItemId,
            sendNeed: send,
          },
        },
        children: sent ? [sent] : [],
      };
    }

    return { node: base, children: lineChildren(qty) };
  });
}

export type NeedLevelNode = {
  itemId: number;
  qty: number;
  level: number;
  path: number[];
};

export type NeedsOptions = {
  levels?: "all" | "1";
  /** `flag`: a row that would loop stays, with treatment `loop` and no children. */
  onLoop?: "throw" | "flag";
  /**
   * Sale order's per-level stock netting (BR-SO-23): called once per level with
   * every node of that level before it expands; returns the qty to use, in the
   * same order. The walk itself stays stock-free.
   */
  netNeedLevel?: (nodes: NeedLevelNode[]) => number[] | Promise<number[]>;
};

export type NeedsResult =
  | { status: "no_bom"; partId: number }
  | {
      status: "ok";
      partId: number;
      qty: number;
      rootBomId: number;
      revision: string;
      rows: BomNeedsRow[];
      toBuy: {
        itemId: number;
        sku: string;
        unit: string;
        qty: number;
        noBom: boolean;
      }[];
    };

type Entry = {
  tmp: number;
  parentTmp: number | null;
  itemId: number;
  sku: string;
  unit: string;
  inactive: boolean;
  hasActiveBom: boolean;
  buyAsIs: boolean;
  qty: number;
  level: number;
  path: number[];
};

type RawRow = { entry: Entry; row: Omit<BomNeedsRow, "index" | "parentIndex"> };

/**
 * The whole walk: level by level through `expandBomLevel` (at most 10 levels
 * of queries), loop guard by path, 1,000-row cap, per-node round up, and the
 * "to buy" list summing those rounded values per item (never under-orders).
 */
export async function computeBomNeeds(
  executor: Executor,
  input: { partId: number; qty: number; options?: NeedsOptions },
): Promise<NeedsResult> {
  const options = input.options ?? {};
  const [rootItem] = await bomRepository.findItemsWithActiveBom(
    [input.partId],
    executor,
  );
  if (!rootItem) throw new NotFoundError("Part not found");
  if (!rootItem.hasActiveBom) {
    return { status: "no_bom", partId: input.partId };
  }

  let seq = 0;
  let frontier: Entry[] = [
    {
      tmp: seq++,
      parentTmp: null,
      itemId: rootItem.id,
      sku: rootItem.sku,
      unit: rootItem.uom,
      inactive: !rootItem.isActive,
      hasActiveBom: true,
      buyAsIs: false,
      qty: input.qty,
      level: 1,
      path: [rootItem.id],
    },
  ];

  const raw: RawRow[] = [];
  const buy = new Map<
    number,
    { sku: string; unit: string; milli: bigint; noBom: boolean }
  >();
  const addBuy = (
    itemId: number,
    sku: string,
    unit: string,
    qty: number,
    noBom: boolean,
  ) => {
    const cur = buy.get(itemId);
    const milli = BigInt(Math.round(qty * 1000));
    if (cur) {
      cur.milli += milli;
      cur.noBom = cur.noBom || noBom;
    } else buy.set(itemId, { sku, unit, milli, noBom });
  };

  let rootBomId = 0;
  let rootRevision = "";
  const infoOnlyLevel = options.levels === "1" ? 2 : Number.POSITIVE_INFINITY;

  while (frontier.length > 0) {
    const level = frontier[0]?.level ?? 1;
    if (options.netNeedLevel) {
      const nets = await options.netNeedLevel(
        frontier.map((f) => ({
          itemId: f.itemId,
          qty: f.qty,
          level: f.level,
          path: f.path,
        })),
      );
      frontier.forEach((f, i) => {
        f.qty = nets[i] ?? f.qty;
      });
    }

    const looping = (f: Entry) =>
      f.path.indexOf(f.itemId) !== f.path.length - 1;
    const expandable = frontier.filter(
      (f) => f.hasActiveBom && !f.buyAsIs && !looping(f),
    );
    if (level > MAX_BOM_LEVELS && expandable.length > 0) throw tooDeep();
    const expanded = await expandBomLevel(executor, {
      items: expandable.map((f) => ({
        partId: f.itemId,
        qty: Math.ceil(f.qty),
      })),
    });
    const expandedOf = new Map<number, ExpandedPart>(
      expandable.map((f, i) => [f.tmp, expanded[i] as ExpandedPart]),
    );

    const next: Entry[] = [];
    for (const f of frontier) {
      let treatment: BomTreatment;
      let extra: Partial<BomNeedsRow> = {};
      const res = expandedOf.get(f.tmp);
      if (f.buyAsIs) treatment = "buy_as_is";
      else if (looping(f)) {
        if (options.onLoop === "flag") treatment = "loop";
        else throw await loopError(executor, [...f.path]);
      } else if (!res || res.node.status === "no_bom") treatment = "no_bom";
      else {
        const n = res.node;
        treatment = n.treatment;
        if (f.tmp === 0) {
          rootBomId = n.bomId;
          rootRevision = n.revision;
        }
        extra = {
          kind: n.kind,
          bomId: n.bomId,
          revision: n.revision,
          ...(n.pourQty !== undefined ? { pourQty: n.pourQty } : {}),
          ...(n.alloy
            ? { alloyItemId: n.alloy.itemId, alloyKg: n.alloy.kg }
            : {}),
          ...(n.jobWork
            ? {
                sendQty: n.jobWork.sendQty,
                returnQty: n.jobWork.returnQty,
                ...(n.jobWork.jobWorkerId !== null
                  ? { jobWorkerId: n.jobWork.jobWorkerId }
                  : {}),
                ...(n.jobWork.serviceId !== null
                  ? { serviceId: n.jobWork.serviceId }
                  : {}),
                ...(n.jobWork.jobWorkLossPct !== null
                  ? { jobWorkLossPct: n.jobWork.jobWorkLossPct }
                  : {}),
              }
            : {}),
        };
        if (level < infoOnlyLevel) {
          if (n.alloy)
            addBuy(
              n.alloy.itemId,
              n.alloy.sku,
              n.alloy.unit,
              n.alloy.kg,
              false,
            );
          for (const c of res.children) {
            next.push({
              tmp: seq++,
              parentTmp: f.tmp,
              itemId: c.itemId,
              sku: c.sku,
              unit: c.unit,
              inactive: c.inactive,
              hasActiveBom: c.hasActiveBom,
              buyAsIs: c.buyAsIs,
              qty: c.qty,
              level: level + 1,
              path: [...f.path, c.itemId],
            });
          }
        }
      }
      if (treatment === "no_bom" || treatment === "buy_as_is") {
        addBuy(f.itemId, f.sku, f.unit, f.qty, treatment === "no_bom");
      }
      raw.push({
        entry: f,
        row: {
          level: f.level,
          path: f.path,
          itemId: f.itemId,
          sku: f.sku,
          unit: f.unit,
          qty: f.qty,
          treatment,
          inactive: f.inactive,
          hasActiveBom: f.hasActiveBom,
          ...extra,
        },
      });
    }
    if (raw.length + next.length > MAX_BOM_NODES) throw tooLarge();
    frontier = next;
  }

  // Pre-order (parent, then its children) so the screen can print the rows as they come.
  const kids = new Map<number | null, RawRow[]>();
  for (const r of raw) {
    const list = kids.get(r.entry.parentTmp);
    if (list) list.push(r);
    else kids.set(r.entry.parentTmp, [r]);
  }
  const rows: BomNeedsRow[] = [];
  const indexOf = new Map<number, number>();
  const visit = (r: RawRow) => {
    const index = rows.length;
    indexOf.set(r.entry.tmp, index);
    const parentIndex =
      r.entry.parentTmp === null
        ? null
        : (indexOf.get(r.entry.parentTmp) ?? null);
    const parentItem =
      r.entry.parentTmp === null
        ? undefined
        : r.entry.path[r.entry.path.length - 2];
    rows.push({
      index,
      parentIndex,
      ...r.row,
      ...(parentItem !== undefined ? { partItemId: parentItem } : {}),
    });
    for (const k of kids.get(r.entry.tmp) ?? []) visit(k);
  };
  for (const r of kids.get(null) ?? []) visit(r);

  const toBuy = [...buy.entries()]
    .map(([itemId, b]) => ({
      itemId,
      sku: b.sku,
      unit: b.unit,
      qty: Number(b.milli) / 1000,
      noBom: b.noBom,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  return {
    status: "ok",
    partId: input.partId,
    qty: input.qty,
    rootBomId,
    revision: rootRevision,
    rows,
    toBuy,
  };
}

export const bomNeedsService = {
  // GET /api/bom/needs: only the web route turns a no_bom root into 409.
  async preview(query: BomNeedsQuery) {
    const result = await computeBomNeeds(db, {
      partId: query.partId,
      qty: query.qty,
      options: { levels: query.levels, onLoop: "throw" },
    });
    if (result.status === "no_bom") {
      throw new ConflictError(
        "The part has no active BOM revision",
        "NO_ACTIVE_BOM",
      );
    }
    return result;
  },
};
