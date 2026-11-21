import { MAX_BOM_LEVELS, MAX_BOM_NODES, revisionLetter } from "../lib/bom-math";
import { AppError } from "../lib/errors";
import {
  bomRepository,
  type Executor,
  type ItemRef,
} from "../repository/bomRepository";
import type { BomKind, BomTreatment, BomTreeNode } from "../types/bom.types";

// The walk of the active graph (BR-BOM-09, 10): loop check with a visited set,
// level limit, node cap. One query pair per level, so at most MAX_BOM_LEVELS
// round trips. Shared by save, release, change summary and the tree.

/** One direct child of a BOM: a component line, or the sent item of a job-work BOM. */
export type ChildRef = {
  itemId: number;
  qtyPerPiece: number;
  buyAsIs: boolean;
};

export type ActiveBom = {
  bomId: number;
  partId: number;
  revisionNo: number;
  kind: BomKind;
  children: ChildRef[];
};

export type RootSpec = { partId: number; children: ChildRef[] };

export type Closure = Map<number, ActiveBom>;

export const GRAPH_ERROR_CODES = [
  "BOM_LOOP",
  "BOM_TOO_DEEP",
  "BOM_TOO_LARGE",
] as const;

export function isGraphError(error: unknown): error is AppError {
  return (
    error instanceof AppError &&
    (GRAPH_ERROR_CODES as readonly string[]).includes(error.code)
  );
}

export function tooDeep() {
  return new AppError(
    `A BOM may nest at most ${MAX_BOM_LEVELS} levels`,
    400,
    "BOM_TOO_DEEP",
  );
}

export function tooLarge() {
  return new AppError(
    `A BOM tree may hold at most ${MAX_BOM_NODES} nodes`,
    400,
    "BOM_TOO_LARGE",
  );
}

export function tooLargeQty() {
  return new AppError("Quantity too large", 400, "BOM_TOO_LARGE");
}

export async function loopError(
  executor: Executor,
  pathIds: number[],
): Promise<AppError> {
  const items = await bomRepository.findItemsByIds(
    [...new Set(pathIds)],
    executor,
  );
  const skuOf = new Map(items.map((i) => [i.id, i.sku]));
  const path = pathIds.map((id) => skuOf.get(id) ?? String(id));
  return new AppError(
    `A BOM may not contain its own part: ${path.join(" → ")}`,
    400,
    "BOM_LOOP",
    { path, pathItemIds: pathIds },
  );
}

/** Children a walk goes into: everything except "buy as is" (BR-BOM-09). */
function walkable(children: ChildRef[]): number[] {
  return children.filter((c) => !c.buyAsIs).map((c) => c.itemId);
}

function childrenOf(
  bom: {
    kind: BomKind;
    sentItemId: number | null;
    sendQty: number | null;
    returnQty: number | null;
  },
  lines: { componentItemId: number; qtyPerPiece: string; buyAsIs: boolean }[],
): ChildRef[] {
  const out: ChildRef[] = lines.map((l) => ({
    itemId: l.componentItemId,
    qtyPerPiece: Number(l.qtyPerPiece),
    buyAsIs: l.buyAsIs,
  }));
  if (bom.kind === "job_work" && bom.sentItemId !== null) {
    out.push({
      itemId: bom.sentItemId,
      qtyPerPiece: (bom.sendQty ?? 1) / (bom.returnQty ?? 1),
      buyAsIs: false,
    });
  }
  return out;
}

/** The ChildRefs of a draft in hand (lines plus the sent item of a job-work BOM). */
export function draftChildren(
  kind: BomKind,
  sentItemId: number | null,
  sendQty: number | null,
  returnQty: number | null,
  lines: { componentItemId: number; qtyPerPiece: number; buyAsIs: boolean }[],
): ChildRef[] {
  return childrenOf(
    { kind, sentItemId, sendQty, returnQty },
    lines.map((l) => ({ ...l, qtyPerPiece: String(l.qtyPerPiece) })),
  );
}

/**
 * Loads the active BOMs under `root`, level by level, with a visited set.
 * Throws BOM_LOOP (naming one path), BOM_TOO_DEEP, BOM_TOO_LARGE.
 * The root's own active revision is never loaded (it is being replaced).
 * `tolerateLoop` (viewing a released revision): a link back to the root is
 * skipped, so the tree shows that node as "loop" instead of failing.
 */
export async function loadClosure(
  executor: Executor,
  root: RootSpec,
  options: { tolerateLoop?: boolean } = {},
): Promise<{ closure: Closure; nodes: number; levels: number }> {
  const closure: Closure = new Map();
  const parentOf = new Map<number, number>();

  const pathTo = (partId: number): number[] => {
    const chain: number[] = [];
    let cur: number | undefined = partId;
    for (let guard = 0; cur !== undefined && guard <= 50; guard += 1) {
      chain.push(cur);
      if (cur === root.partId) break;
      cur = parentOf.get(cur);
    }
    return chain.reverse();
  };

  for (const id of walkable(root.children)) {
    if (id === root.partId) {
      if (options.tolerateLoop) continue;
      throw await loopError(executor, [root.partId, root.partId]);
    }
  }

  let frontier = [...new Set(walkable(root.children))];
  let frontierSet = new Set(frontier);
  for (const id of frontier) parentOf.set(id, root.partId);
  let level = 2; // the root BOM is level 1

  while (frontier.length > 0) {
    const { boms: found, lines } = await bomRepository.listActiveByParts(
      frontier,
      executor,
    );
    if (found.length === 0) break;
    if (level > MAX_BOM_LEVELS) throw tooDeep();

    const linesByBom = new Map<number, typeof lines>();
    for (const l of lines) {
      const list = linesByBom.get(l.bomId);
      if (list) list.push(l);
      else linesByBom.set(l.bomId, [l]);
    }

    const next = new Set<number>();
    for (const b of found) {
      const children = childrenOf(b, linesByBom.get(b.id) ?? []);
      closure.set(b.partId, {
        bomId: b.id,
        partId: b.partId,
        revisionNo: b.revisionNo,
        kind: b.kind,
        children,
      });
      for (const childId of walkable(children)) {
        if (childId === root.partId) {
          if (options.tolerateLoop) continue;
          throw await loopError(executor, [...pathTo(b.partId), root.partId]);
        }
        if (!closure.has(childId) && !frontierSet.has(childId)) {
          next.add(childId);
          if (!parentOf.has(childId)) parentOf.set(childId, b.partId);
        }
      }
    }
    frontier = [...next];
    frontierSet = next;
    level += 1;
  }

  const { nodes, levels } = measure(root, closure);
  if (levels > MAX_BOM_LEVELS) throw tooDeep();
  if (nodes > MAX_BOM_NODES) throw tooLarge();
  return { closure, nodes, levels };
}

// Tree size and height with memo (a part shared by many parents is counted per
// use, as the tree shows it). Counts saturate so a wide graph cannot blow up.
function measure(root: RootSpec, closure: Closure) {
  const cap = MAX_BOM_NODES + 1;
  const memo = new Map<number, { nodes: number; levels: number }>();
  const inProgress = new Set<number>();

  const ofChildren = (children: ChildRef[]) => {
    let nodes = 1;
    let deepest = 0;
    for (const c of children) {
      const walked = !c.buyAsIs && closure.has(c.itemId);
      if (walked) {
        const m = ofPart(c.itemId);
        nodes += m.nodes;
        deepest = Math.max(deepest, m.levels);
      } else {
        nodes += 1;
      }
      nodes = Math.min(nodes, cap);
    }
    return { nodes, levels: 1 + deepest };
  };

  const ofPart = (partId: number): { nodes: number; levels: number } => {
    const hit = memo.get(partId);
    if (hit) return hit;
    const bom = closure.get(partId);
    if (!bom || inProgress.has(partId)) return { nodes: 1, levels: 0 };
    inProgress.add(partId);
    const result = ofChildren(bom.children);
    inProgress.delete(partId);
    memo.set(partId, result);
    return result;
  };

  return ofChildren(root.children);
}

const TREATMENT_BY_KIND: Record<BomKind, BomTreatment> = {
  casting: "cast",
  job_work: "job_work",
  assembly: "assemble",
};

/** BR-BOM-09: the level tree under a revision, from an already loaded closure. */
export async function buildTree(
  executor: Executor,
  root: {
    partId: number;
    kind: BomKind;
    bomId: number;
    revisionNo: number;
    children: ChildRef[];
  },
  closure: Closure,
): Promise<BomTreeNode> {
  const ids = new Set<number>([root.partId]);
  for (const c of root.children) ids.add(c.itemId);
  for (const b of closure.values())
    for (const c of b.children) ids.add(c.itemId);
  const items = new Map<number, ItemRef>(
    (await bomRepository.findItemsByIds([...ids], executor)).map((i) => [
      i.id,
      i,
    ]),
  );

  const nodeFor = (
    itemId: number,
    qtyPerPiece: number,
    buyAsIs: boolean,
    path: Set<number>,
  ): BomTreeNode => {
    const item = items.get(itemId);
    const base = {
      itemId,
      sku: item?.sku ?? String(itemId),
      name: item?.name ?? "",
      unit: item?.uom ?? "",
      qtyPerPiece,
      inactive: item ? !item.isActive : false,
    };
    if (buyAsIs) {
      return { ...base, treatment: "buy_as_is", children: [] };
    }
    if (path.has(itemId)) return { ...base, treatment: "loop", children: [] };
    const bom = closure.get(itemId);
    if (!bom) return { ...base, treatment: "no_bom", children: [] };
    const nextPath = new Set(path).add(itemId);
    return {
      ...base,
      kind: bom.kind,
      treatment: TREATMENT_BY_KIND[bom.kind],
      bomId: bom.bomId,
      revision: revisionLetter(bom.revisionNo),
      children: bom.children.map((c) =>
        nodeFor(c.itemId, c.qtyPerPiece, c.buyAsIs, nextPath),
      ),
    };
  };

  const rootItem = items.get(root.partId);
  const path = new Set([root.partId]);
  return {
    itemId: root.partId,
    sku: rootItem?.sku ?? String(root.partId),
    name: rootItem?.name ?? "",
    kind: root.kind,
    unit: rootItem?.uom ?? "",
    qtyPerPiece: 1,
    treatment: TREATMENT_BY_KIND[root.kind],
    bomId: root.bomId,
    revision: revisionLetter(root.revisionNo),
    inactive: rootItem ? !rootItem.isActive : false,
    children: root.children.map((c) =>
      nodeFor(c.itemId, c.qtyPerPiece, c.buyAsIs, path),
    ),
  };
}
