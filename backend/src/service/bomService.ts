import type { z } from "zod";
import { db } from "../db/client";
import { type Actor, can } from "../lib/auth-middleware";
import {
  bomNumber,
  castingFigures,
  revisionLetter,
  shotCoversNet,
} from "../lib/bom-math";
import { isUniqueViolation } from "../lib/db-errors";
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../lib/errors";
import {
  type BomInsert,
  type BomLineInsert,
  type BomRow,
  bomRepository,
  type Executor,
  type ItemRef,
  type Tx,
} from "../repository/bomRepository";
import type {
  BomKind,
  BomListQuery,
  BomStatus,
  bomHistoryQuerySchema,
  CreateBomInput,
  ReleaseBomInput,
  RetireBomInput,
  UpdateBomInput,
} from "../types/bom.types";
import {
  buildTree,
  type ChildRef,
  draftChildren,
  isGraphError,
  loadClosure,
} from "./bomGraph";

type Paginated<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

const MANUFACTURED_CATEGORY = "Manufactured part";
const JOB_WORKER_TYPES = ["service_provider", "both"];

// --- Normalised draft (header + lines), the one form every check and diff uses ---

type HeaderSnap = {
  kind: BomKind;
  alloyItemId: number | null;
  netWeightKg: number | null;
  shotWeightKg: number | null;
  cavities: number | null;
  meltLossPct: number | null;
  castingRejectPct: number | null;
  sentItemId: number | null;
  sendQty: number | null;
  returnQty: number | null;
  jobWorkerId: number | null;
  serviceId: number | null;
  jobWorkLossPct: number | null;
};

type LineSnap = {
  componentItemId: number;
  qtyPerPiece: number;
  buyAsIs: boolean;
  note: string | null;
};

type Snap = { header: HeaderSnap; lines: LineSnap[] };

type Problem = { code: string; field?: string; message: string };

const num = (v: string | null) => (v === null ? null : Number(v));

function snapFromRows(
  row: BomRow,
  lines: {
    componentItemId: number;
    qtyPerPiece: string;
    buyAsIs: boolean;
    note: string | null;
  }[],
): Snap {
  return {
    header: {
      kind: row.kind,
      alloyItemId: row.alloyItemId,
      netWeightKg: num(row.netWeightKg),
      shotWeightKg: num(row.shotWeightKg),
      cavities: row.cavities,
      meltLossPct: num(row.meltLossPct),
      castingRejectPct: num(row.castingRejectPct),
      sentItemId: row.sentItemId,
      sendQty: row.sendQty,
      returnQty: row.returnQty,
      jobWorkerId: row.jobWorkerId,
      serviceId: row.serviceId,
      jobWorkLossPct: num(row.jobWorkLossPct),
    },
    lines: lines.map((l) => ({
      componentItemId: l.componentItemId,
      qtyPerPiece: Number(l.qtyPerPiece),
      buyAsIs: l.buyAsIs,
      note: l.note,
    })),
  };
}

// BR-BOM-08: only the block of the draft's own kind may be sent.
function snapFromInput(
  input: Pick<CreateBomInput, "kind" | "casting" | "jobWork" | "lines">,
): Snap {
  const { kind, casting, jobWork } = input;
  if (kind !== "casting" && casting) {
    throw new BadRequestError("Casting data is only for a casting BOM");
  }
  if (kind !== "job_work" && jobWork) {
    throw new BadRequestError("Job-work data is only for a job-work BOM");
  }
  if (kind === "job_work" && input.lines.length > 0) {
    throw new BadRequestError(
      "A job-work BOM has no component lines, only the sent item",
    );
  }
  const header: HeaderSnap = {
    kind,
    alloyItemId: casting?.alloyItemId ?? null,
    netWeightKg: casting?.netWeightKg ?? null,
    shotWeightKg: casting?.shotWeightKg ?? null,
    cavities: casting?.cavities ?? null,
    meltLossPct: casting?.meltLossPct ?? null,
    castingRejectPct: casting?.castingRejectPct ?? null,
    sentItemId: jobWork?.sentItemId ?? null,
    // BR-BOM-07: send : return defaults to 1 : 1
    sendQty: kind === "job_work" ? (jobWork?.sendQty ?? 1) : null,
    returnQty: kind === "job_work" ? (jobWork?.returnQty ?? 1) : null,
    jobWorkerId: jobWork?.jobWorkerId ?? null,
    serviceId: jobWork?.serviceId ?? null,
    jobWorkLossPct: jobWork?.jobWorkLossPct ?? null,
  };
  return {
    header,
    lines: input.lines.map((l) => ({
      componentItemId: l.componentItemId,
      qtyPerPiece: l.qtyPerPiece,
      buyAsIs: l.buyAsIs,
      note: l.note ? l.note : null,
    })),
  };
}

const fixed = (v: number | null, decimals: number) =>
  v === null ? null : v.toFixed(decimals);

function headerColumns(h: HeaderSnap): Partial<BomInsert> {
  return {
    kind: h.kind,
    alloyItemId: h.alloyItemId,
    netWeightKg: fixed(h.netWeightKg, 3),
    shotWeightKg: fixed(h.shotWeightKg, 3),
    cavities: h.cavities,
    meltLossPct: fixed(h.meltLossPct, 2),
    castingRejectPct: fixed(h.castingRejectPct, 2),
    sentItemId: h.sentItemId,
    sendQty: h.sendQty,
    returnQty: h.returnQty,
    jobWorkerId: h.jobWorkerId,
    serviceId: h.serviceId,
    jobWorkLossPct: fixed(h.jobWorkLossPct, 2),
  };
}

function lineRows(bomId: number, lines: LineSnap[]): BomLineInsert[] {
  return lines.map((l, i) => ({
    bomId,
    componentItemId: l.componentItemId,
    qtyPerPiece: l.qtyPerPiece.toFixed(3),
    buyAsIs: l.buyAsIs,
    note: l.note,
    lineNo: i + 1,
  }));
}

function rootChildren(snap: Snap): ChildRef[] {
  return draftChildren(
    snap.header.kind,
    snap.header.sentItemId,
    snap.header.sendQty,
    snap.header.returnQty,
    snap.lines,
  );
}

// --- Diff (change summary, history rows): header old -> new, lines added / removed / changed ---

type Diff = {
  header: { field: string; old: unknown; new: unknown }[];
  lines: {
    added: {
      componentItemId: number;
      qtyPerPiece: number;
      buyAsIs: boolean;
      note?: string;
    }[];
    removed: {
      componentItemId: number;
      qtyPerPiece: number;
      buyAsIs: boolean;
      note?: string;
    }[];
    changed: {
      componentItemId: number;
      qtyOld: number;
      qtyNew: number;
      buyAsIsOld: boolean;
      buyAsIsNew: boolean;
    }[];
  };
};

const lineInput = (l: LineSnap) => ({
  componentItemId: l.componentItemId,
  qtyPerPiece: l.qtyPerPiece,
  buyAsIs: l.buyAsIs,
  ...(l.note ? { note: l.note } : {}),
});

function diffSnaps(oldSnap: Snap | null, newSnap: Snap | null): Diff {
  const oldHeader = (oldSnap?.header ?? null) as Record<string, unknown> | null;
  const newHeader = (newSnap?.header ?? null) as Record<string, unknown> | null;
  const fields = Object.keys((newSnap ?? oldSnap)?.header ?? {});
  const header: Diff["header"] = [];
  for (const field of fields) {
    const o = oldHeader ? (oldHeader[field] ?? null) : null;
    const n = newHeader ? (newHeader[field] ?? null) : null;
    if (o !== n) header.push({ field, old: o, new: n });
  }
  const oldLines = new Map(
    (oldSnap?.lines ?? []).map((l) => [l.componentItemId, l]),
  );
  const newLines = new Map(
    (newSnap?.lines ?? []).map((l) => [l.componentItemId, l]),
  );
  const added = [...newLines.values()]
    .filter((l) => !oldLines.has(l.componentItemId))
    .map(lineInput);
  const removed = [...oldLines.values()]
    .filter((l) => !newLines.has(l.componentItemId))
    .map(lineInput);
  const changed: Diff["lines"]["changed"] = [];
  for (const n of newLines.values()) {
    const o = oldLines.get(n.componentItemId);
    if (o && (o.qtyPerPiece !== n.qtyPerPiece || o.buyAsIs !== n.buyAsIs)) {
      changed.push({
        componentItemId: n.componentItemId,
        qtyOld: o.qtyPerPiece,
        qtyNew: n.qtyPerPiece,
        buyAsIsOld: o.buyAsIs,
        buyAsIsNew: n.buyAsIs,
      });
    }
  }
  return { header, lines: { added, removed, changed } };
}

// BR-BOM-23: the jsonb stored in bom_history.
function historyChanges(diff: Diff) {
  return {
    header: Object.fromEntries(
      diff.header.map((h) => [h.field, { old: h.old, new: h.new }]),
    ),
    lines: diff.lines,
  };
}

// --- Rules (BR-BOM-01, 03, 04, 07, 08, 12, 21, 26) ---

/**
 * Collects every problem of a draft. `save` checks only the values that are
 * given (BR-BOM-26); `release` also checks completeness (BR-BOM-12).
 */
async function collectProblems(
  executor: Executor,
  partId: number,
  snap: Snap,
  mode: "save" | "release",
): Promise<Problem[]> {
  const problems: Problem[] = [];
  const add = (code: string, message: string, field?: string) =>
    problems.push(field ? { code, field, message } : { code, message });
  const { header: h, lines } = snap;

  const ids = new Set<number>([partId]);
  for (const l of lines) ids.add(l.componentItemId);
  if (h.alloyItemId !== null) ids.add(h.alloyItemId);
  if (h.sentItemId !== null) ids.add(h.sentItemId);
  const items = new Map<number, ItemRef>(
    (await bomRepository.findItemsByIds([...ids], executor)).map((i) => [
      i.id,
      i,
    ]),
  );

  // BR-BOM-01: the part
  const part = items.get(partId);
  if (!part) {
    add("PART_NOT_FOUND", "Part not found", "partId");
  } else {
    if (!part.isActive) add("PART_INACTIVE", "The part is inactive", "partId");
    if (part.category !== MANUFACTURED_CATEGORY) {
      add(
        "PART_CATEGORY",
        `The part must be in category "${MANUFACTURED_CATEGORY}"`,
        "partId",
      );
    }
    if (part.uom !== "pcs" && part.uom !== "set") {
      add("PART_UNIT", "The part's unit must be pcs or set", "partId");
    } else if (h.kind === "casting" && part.uom !== "pcs") {
      add("PART_UNIT", "A casting BOM needs a part in pcs", "partId");
    }
  }

  // BR-BOM-03: lines (a service id is not an item id: it is simply not found)
  const seen = new Set<number>();
  lines.forEach((l, i) => {
    const field = `lines[${i}]`;
    if (seen.has(l.componentItemId)) {
      add("LINE_DUPLICATE", "The same item twice on one BOM", field);
    }
    seen.add(l.componentItemId);
    if (l.componentItemId === partId) {
      add("LINE_IS_PART", "The part cannot be a line of its own BOM", field);
    }
    if (h.alloyItemId !== null && l.componentItemId === h.alloyItemId) {
      add("LINE_IS_ALLOY", "The casting alloy cannot also be a line", field);
    }
    const item = items.get(l.componentItemId);
    if (!item) {
      add(
        "LINE_ITEM_NOT_FOUND",
        `Item ${l.componentItemId} does not exist (a service cannot be a BOM line)`,
        field,
      );
    } else if (!item.isActive) {
      add("LINE_ITEM_INACTIVE", `Item ${item.sku} is inactive`, field);
    }
  });

  if (h.kind === "casting") {
    const requireField = (value: unknown, field: string, label: string) => {
      if (mode === "release" && (value === null || value === undefined)) {
        add("CASTING_INCOMPLETE", `${label} is missing`, field);
      }
    };
    // BR-BOM-04: alloy
    if (h.alloyItemId !== null) {
      const alloy = items.get(h.alloyItemId);
      if (!alloy) {
        add(
          "ALLOY_NOT_FOUND",
          "Alloy item does not exist",
          "casting.alloyItemId",
        );
      } else {
        if (!alloy.isActive) {
          add(
            "ALLOY_INACTIVE",
            `Alloy ${alloy.sku} is inactive`,
            "casting.alloyItemId",
          );
        }
        if (alloy.uom !== "kg") {
          add(
            "ALLOY_UNIT",
            "The alloy must be an item in kg",
            "casting.alloyItemId",
          );
        }
      }
    } else {
      requireField(null, "casting.alloyItemId", "Alloy");
    }
    requireField(h.netWeightKg, "casting.netWeightKg", "Net weight");
    requireField(h.shotWeightKg, "casting.shotWeightKg", "Shot weight");
    requireField(h.cavities, "casting.cavities", "Cavities");
    requireField(h.meltLossPct, "casting.meltLossPct", "Melt loss %");
    requireField(
      h.castingRejectPct,
      "casting.castingRejectPct",
      "Casting reject %",
    );
    if (
      h.netWeightKg !== null &&
      h.shotWeightKg !== null &&
      h.cavities !== null &&
      !shotCoversNet(h.netWeightKg, h.shotWeightKg, h.cavities)
    ) {
      add(
        "SHOT_BELOW_NET",
        "Shot weight must be at least net weight x cavities",
        "casting.shotWeightKg",
      );
    }
  }

  if (h.kind === "job_work") {
    const requireField = (value: unknown, field: string, label: string) => {
      if (mode === "release" && (value === null || value === undefined)) {
        add("JOB_WORK_INCOMPLETE", `${label} is missing`, field);
      }
    };
    // BR-BOM-07: sent item
    if (h.sentItemId !== null) {
      const sent = items.get(h.sentItemId);
      if (!sent) {
        add(
          "SENT_ITEM_NOT_FOUND",
          "Sent item does not exist",
          "jobWork.sentItemId",
        );
      } else {
        if (!sent.isActive) {
          add(
            "SENT_ITEM_INACTIVE",
            `Sent item ${sent.sku} is inactive`,
            "jobWork.sentItemId",
          );
        }
        if (sent.uom !== "pcs") {
          add(
            "SENT_ITEM_UNIT",
            "The sent item must be in pcs",
            "jobWork.sentItemId",
          );
        }
      }
      if (h.sentItemId === partId) {
        add(
          "SENT_ITEM_IS_PART",
          "The sent item cannot be the part itself",
          "jobWork.sentItemId",
        );
      }
    } else {
      requireField(null, "jobWork.sentItemId", "Sent item");
    }
    requireField(h.sendQty, "jobWork.sendQty", "Send quantity");
    requireField(h.returnQty, "jobWork.returnQty", "Return quantity");
    requireField(h.jobWorkLossPct, "jobWork.jobWorkLossPct", "Job-work loss %");

    // BR-BOM-07, 21: job worker and service
    if (h.jobWorkerId !== null) {
      const worker = await bomRepository.findWorker(h.jobWorkerId, executor);
      if (!worker) {
        add(
          "JOB_WORKER_NOT_FOUND",
          "Job worker does not exist",
          "jobWork.jobWorkerId",
        );
      } else {
        if (!worker.isActive) {
          add(
            "JOB_WORKER_INACTIVE",
            `Job worker ${worker.name} is inactive`,
            "jobWork.jobWorkerId",
          );
        }
        if (!JOB_WORKER_TYPES.includes(worker.type)) {
          add(
            "JOB_WORKER_TYPE",
            "The job worker must be a service provider",
            "jobWork.jobWorkerId",
          );
        }
      }
    } else {
      requireField(null, "jobWork.jobWorkerId", "Job worker");
    }
    if (h.serviceId !== null) {
      const service = await bomRepository.findService(h.serviceId, executor);
      if (!service) {
        add("SERVICE_NOT_FOUND", "Service does not exist", "jobWork.serviceId");
      } else {
        if (!service.isActive) {
          add(
            "SERVICE_INACTIVE",
            `Service ${service.name} is inactive`,
            "jobWork.serviceId",
          );
        }
        if (
          h.jobWorkerId !== null &&
          !(await bomRepository.workerHasActiveService(
            h.jobWorkerId,
            h.serviceId,
            executor,
          ))
        ) {
          add(
            "SERVICE_NOT_ON_WORKER",
            "The service is not on the job worker's active service list",
            "jobWork.serviceId",
          );
        }
      }
    } else {
      requireField(null, "jobWork.serviceId", "Service");
    }
  }

  // BR-BOM-08: assembly needs lines (release only; a draft may be empty)
  if (mode === "release" && h.kind === "assembly" && lines.length === 0) {
    add(
      "ASSEMBLY_NO_LINES",
      "An assembly BOM needs at least one component line",
      "lines",
    );
  }

  return problems;
}

function saveProblemError(problems: Problem[]) {
  return new AppError(
    problems.map((p) => p.message).join("; "),
    400,
    "BAD_REQUEST",
    { problems },
  );
}

/** Loop / depth / size check of a draft in hand (BR-BOM-10). Throws the graph error. */
async function assertGraph(executor: Executor, partId: number, snap: Snap) {
  return loadClosure(executor, { partId, children: rootChildren(snap) });
}

/** Same check, but a graph error becomes a problem (release, change summary). */
async function graphProblems(
  executor: Executor,
  partId: number,
  snap: Snap,
  rethrowTooLarge: boolean,
): Promise<Problem[]> {
  try {
    await assertGraph(executor, partId, snap);
    return [];
  } catch (error) {
    if (isGraphError(error)) {
      if (rethrowTooLarge && error.code === "BOM_TOO_LARGE") throw error;
      return [{ code: error.code, message: error.message }];
    }
    throw error;
  }
}

function assertPartIsManufacturable(
  part: ItemRef | undefined,
): asserts part is ItemRef {
  if (!part) throw new NotFoundError("Part not found");
}

// --- Service ---

async function loadSnap(row: BomRow, executor: Executor = db): Promise<Snap> {
  return snapFromRows(row, await bomRepository.getLines(row.id, executor));
}

async function requireBom(id: number, executor: Executor = db) {
  const row = await bomRepository.findBomById(id, executor);
  if (!row) throw new NotFoundError("BOM not found");
  return row;
}

/** Locks (in the one order: part counter, then the revision row) and re-checks the draft. */
async function lockDraft(
  tx: Tx,
  id: number,
  partId: number,
  version?: number,
): Promise<BomRow> {
  await bomRepository.lockPartSeq(tx, partId);
  const row = await bomRepository.findBomForUpdate(tx, id);
  if (!row) throw new NotFoundError("BOM not found");
  if (row.status !== "draft") {
    throw new ConflictError("Only a draft can be changed", "BOM_NOT_DRAFT");
  }
  if (version !== undefined && row.version !== version) {
    throw new ConflictError(
      "The draft was saved by someone else since you read it; reload and try again",
      "BOM_CHANGED_SINCE_REVIEW",
    );
  }
  return row;
}

export const bomService = {
  // BR-BOM-25
  async list(query: BomListQuery): Promise<Paginated<unknown>> {
    const statuses: BomStatus[] =
      query.status ??
      (query.partId ? ["draft", "active", "retired"] : ["active", "draft"]);
    const { rows, total } = await bomRepository.list(
      query,
      statuses,
      query.page,
      query.pageSize,
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        number: bomNumber(r.partSku, r.revisionNo),
        partId: r.partId,
        partSku: r.partSku,
        partName: r.partName,
        kind: r.kind,
        status: r.status,
        revision: revisionLetter(r.revisionNo),
        releasedAt: r.releasedAt,
      })),
      meta: toPaginatedMeta(query.page, query.pageSize, total),
    };
  },

  // BR-BOM-05, 21, 23, 24, 28
  async getDetails(id: number, actor: Actor) {
    const d = await bomRepository.findDetail(id);
    if (!d) throw new NotFoundError("BOM not found");
    const { bom, part } = d;
    const lines = await bomRepository.getLinesWithItems(id);
    const revisions = await bomRepository.listRevisionsOfPart(bom.partId);

    const castingNums = {
      netWeightKg: num(bom.netWeightKg),
      shotWeightKg: num(bom.shotWeightKg),
      cavities: bom.cavities,
      meltLossPct: num(bom.meltLossPct),
      castingRejectPct: num(bom.castingRejectPct),
    };
    const itemRef = (
      i: { sku: string; name: string; uom: string; isActive: boolean } | null,
    ) =>
      i
        ? { sku: i.sku, name: i.name, unit: i.uom, inactive: !i.isActive }
        : null;

    // BR-BOM-24: one next step, folded with the caller's permissions
    const active = revisions.find((r) => r.status === "active");
    const openDraft = revisions.find((r) => r.status === "draft");
    const canManage = can(actor, "bom.manage");
    const canRelease = can(actor, "bom.release");
    let nextStep:
      | "release"
      | "waiting_for_release"
      | "start_revision"
      | "open_active";
    let nextRevision: string | null = null;
    if (bom.status === "draft") {
      nextStep = canRelease ? "release" : "waiting_for_release";
    } else if (bom.status === "active") {
      nextStep = canManage && !openDraft ? "start_revision" : "open_active";
    } else if (active) {
      nextStep = "open_active";
    } else {
      nextStep = canManage && !openDraft ? "start_revision" : "open_active";
    }
    if (nextStep === "start_revision") {
      nextRevision = revisionLetter(
        (await bomRepository.lastRevisionNo(bom.partId)) + 1,
      );
    }

    return {
      id: bom.id,
      number: bomNumber(part.sku, bom.revisionNo),
      partId: bom.partId,
      part: {
        sku: part.sku,
        name: part.name,
        unit: part.uom,
        inactive: !part.isActive,
      },
      revisionNo: bom.revisionNo,
      revision: revisionLetter(bom.revisionNo),
      kind: bom.kind,
      status: bom.status,
      version: bom.version,
      casting:
        bom.kind === "casting"
          ? {
              alloyItemId: bom.alloyItemId,
              alloy: itemRef(d.alloy),
              ...castingNums,
              computed: castingFigures(castingNums),
            }
          : null,
      jobWork:
        bom.kind === "job_work"
          ? {
              sentItemId: bom.sentItemId,
              sentItem: itemRef(d.sent),
              sendQty: bom.sendQty,
              returnQty: bom.returnQty,
              jobWorkerId: bom.jobWorkerId,
              jobWorkerName: d.workerName,
              jobWorkerInactive:
                d.workerActive === null ? null : !d.workerActive,
              serviceId: bom.serviceId,
              serviceName: d.serviceName,
              serviceInactive:
                d.serviceActive === null ? null : !d.serviceActive,
              jobWorkLossPct: num(bom.jobWorkLossPct),
            }
          : null,
      lines: lines.map((l) => ({
        ...l,
        qtyPerPiece: Number(l.qtyPerPiece),
        inactive: Boolean(l.inactive),
      })),
      changeReason: bom.changeReason,
      releasedByName: d.releasedByName,
      releasedAt: bom.releasedAt,
      retiredByName: d.retiredByName,
      retiredAt: bom.retiredAt,
      retireReason: bom.retireReason,
      createdByName: d.createdByName,
      createdAt: bom.createdAt,
      lastUpdatedByName: d.lastUpdatedByName,
      lastUpdatedAt: bom.lastUpdatedAt,
      nextStep,
      nextRevision,
      activeBomId: active?.id ?? null,
    };
  },

  // BR-BOM-09, 10, 21
  async getTree(id: number) {
    const row = await requireBom(id);
    const snap = await loadSnap(row);
    const children = rootChildren(snap);
    const { closure } = await loadClosure(db, {
      partId: row.partId,
      children,
    });
    return buildTree(
      db,
      {
        partId: row.partId,
        kind: row.kind,
        bomId: row.id,
        revisionNo: row.revisionNo,
        children,
      },
      closure,
    );
  },

  // BR-BOM-12, 13: dry run of release
  async getChangeSummary(id: number) {
    const row = await requireBom(id);
    const snap = await loadSnap(row);
    const revisions = await bomRepository.listRevisionsOfPart(row.partId);

    let against: { id: number; revisionNo: number } | undefined;
    if (row.status === "draft") {
      against =
        revisions.find((r) => r.status === "active") ??
        revisions.find((r) => r.status === "retired");
    } else {
      against = revisions.find((r) => r.revisionNo < row.revisionNo);
    }
    let diff: Diff = {
      header: [],
      lines: { added: [], removed: [], changed: [] },
    };
    if (against) {
      const againstRow = await requireBom(against.id);
      diff = diffSnaps(await loadSnap(againstRow), snap);
    }

    let problems: Problem[] = [];
    if (row.status === "draft") {
      problems = await collectProblems(db, row.partId, snap, "release");
      problems.push(...(await graphProblems(db, row.partId, snap, true)));
    } else {
      // a released revision: the walk still stops at the cap
      await assertGraph(db, row.partId, snap).catch((error) => {
        if (isGraphError(error) && error.code === "BOM_TOO_LARGE") throw error;
      });
    }

    return {
      bomId: row.id,
      version: row.version,
      against: against
        ? { id: against.id, revision: revisionLetter(against.revisionNo) }
        : null,
      firstRevision: against === undefined,
      header: diff.header,
      lines: diff.lines,
      canRelease: row.status === "draft" && problems.length === 0,
      problems,
    };
  },

  // BR-BOM-23
  async getPartHistory(
    partId: number,
    query: z.infer<typeof bomHistoryQuerySchema>,
  ): Promise<Paginated<unknown>> {
    assertPartIsManufacturable(
      (await bomRepository.findItemsByIds([partId]))[0],
    );
    const { rows, total } = await bomRepository.listHistory(partId, query);
    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        revision: revisionLetter(r.revisionNo),
        changes: r.changes,
        reason: r.reason,
        changedBy: { id: r.changedById, name: r.changedByName },
        changedAt: r.changedAt,
      })),
      meta: toPaginatedMeta(query.page, query.pageSize, total),
    };
  },

  // BR-BOM-01..04, 07, 08, 10, 26
  async create(input: CreateBomInput, actorId: number) {
    const [part] = await bomRepository.findItemsByIds([input.partId]);
    assertPartIsManufacturable(part);
    const snap = snapFromInput(input);

    return db.transaction(async (tx) => {
      await bomRepository.ensurePartSeq(tx, input.partId);
      await bomRepository.lockPartSeq(tx, input.partId);
      const existing = await bomRepository.listRevisionsOfPart(
        input.partId,
        tx,
      );
      if (existing.length > 0) {
        throw new ConflictError(
          "This part already has a BOM; use Start revision",
          "BOM_ALREADY_EXISTS",
        );
      }
      const problems = await collectProblems(tx, input.partId, snap, "save");
      if (problems.length > 0) throw saveProblemError(problems);
      await assertGraph(tx, input.partId, snap);

      const revisionNo = await bomRepository.nextRevisionNo(tx, input.partId);
      const row = await bomRepository.insertBom(tx, {
        ...headerColumns(snap.header),
        kind: snap.header.kind,
        partId: input.partId,
        revisionNo,
        version: 1,
        status: "draft",
        createdBy: actorId,
        lastUpdatedBy: actorId,
      });
      await bomRepository.replaceLines(
        tx,
        row.id,
        lineRows(row.id, snap.lines),
      );
      await bomRepository.insertHistory(tx, {
        bomId: row.id,
        partId: row.partId,
        revisionNo,
        action: "create",
        changes: historyChanges(diffSnaps(null, snap)),
        changedBy: actorId,
      });
      return { id: row.id, status: row.status, version: row.version };
    });
  },

  // BR-BOM-14: next letter, copy of the active revision (else the latest retired)
  async startRevision(partId: number, actorId: number) {
    const [part] = await bomRepository.findItemsByIds([partId]);
    assertPartIsManufacturable(part);

    return db.transaction(async (tx) => {
      await bomRepository.ensurePartSeq(tx, partId);
      await bomRepository.lockPartSeq(tx, partId);
      const revisions = await bomRepository.listRevisionsOfPart(partId, tx);
      if (revisions.length === 0) {
        throw new NotFoundError("This part has no BOM");
      }
      const draft = revisions.find((r) => r.status === "draft");
      if (draft) {
        throw new AppError(
          `Draft ${revisionLetter(draft.revisionNo)} is already open`,
          409,
          "BOM_DRAFT_OPEN",
          { draftId: draft.id, revision: revisionLetter(draft.revisionNo) },
        );
      }
      const source =
        revisions.find((r) => r.status === "active") ??
        revisions.find((r) => r.status === "retired");
      if (!source) throw new NotFoundError("This part has no BOM to copy");
      const sourceRow = await requireBom(source.id, tx);
      const snap = await loadSnap(sourceRow, tx);

      const revisionNo = await bomRepository.nextRevisionNo(tx, partId);
      const row = await bomRepository.insertBom(tx, {
        ...headerColumns(snap.header),
        kind: snap.header.kind,
        partId,
        revisionNo,
        version: 1,
        status: "draft",
        createdBy: actorId,
        lastUpdatedBy: actorId,
      });
      await bomRepository.replaceLines(
        tx,
        row.id,
        lineRows(row.id, snap.lines),
      );
      await bomRepository.insertHistory(tx, {
        bomId: row.id,
        partId,
        revisionNo,
        action: "create",
        changes: {
          ...historyChanges(diffSnaps(null, snap)),
          copiedFrom: {
            id: sourceRow.id,
            revision: revisionLetter(sourceRow.revisionNo),
          },
        },
        changedBy: actorId,
      });
      return { id: row.id, status: row.status, version: row.version };
    });
  },

  // BR-BOM-03..11, 26, 28
  async update(id: number, input: UpdateBomInput, actorId: number) {
    const snap = snapFromInput(input);
    return db.transaction(async (tx) => {
      // the row lock first: a concurrent save waits here, then fails the token check
      const locked = await bomRepository.findBomForUpdate(tx, id);
      if (!locked) throw new NotFoundError("BOM not found");
      if (locked.status !== "draft") {
        throw new ConflictError("Only a draft can be changed", "BOM_NOT_DRAFT");
      }
      if (locked.version !== input.version) {
        throw new ConflictError(
          "The draft was saved by someone else since you read it; reload and try again",
          "BOM_CHANGED_SINCE_REVIEW",
        );
      }
      const problems = await collectProblems(tx, locked.partId, snap, "save");
      if (problems.length > 0) throw saveProblemError(problems);
      await assertGraph(tx, locked.partId, snap);

      const before = await loadSnap(locked, tx);
      const row = await bomRepository.updateBom(tx, id, {
        ...headerColumns(snap.header),
        kind: snap.header.kind,
        version: locked.version + 1,
        lastUpdatedBy: actorId,
        lastUpdatedAt: new Date(),
      });
      await bomRepository.replaceLines(tx, id, lineRows(id, snap.lines));
      await bomRepository.insertHistory(tx, {
        bomId: id,
        partId: row.partId,
        revisionNo: row.revisionNo,
        action: "edit",
        changes: historyChanges(diffSnaps(before, snap)),
        changedBy: actorId,
      });
      return { id: row.id, status: row.status, version: row.version };
    });
  },

  // BR-BOM-15
  async remove(id: number, actorId: number) {
    const pre = await requireBom(id);
    return db.transaction(async (tx) => {
      const row = await lockDraft(tx, id, pre.partId);
      const before = await loadSnap(row, tx);
      await bomRepository.insertHistory(tx, {
        bomId: id,
        partId: row.partId,
        revisionNo: row.revisionNo,
        action: "delete",
        changes: historyChanges(diffSnaps(before, null)),
        changedBy: actorId,
      });
      await bomRepository.deleteBom(tx, id);
      return { id, deleted: true as const };
    });
  },

  // BR-BOM-12, 13, 17, 28
  async release(id: number, input: ReleaseBomInput, actorId: number) {
    const pre = await requireBom(id);
    try {
      return await db.transaction(async (tx) => {
        // one global lock: the loop check reads other parts' active revisions
        await bomRepository.lockBomGraph(tx);
        const row = await lockDraft(tx, id, pre.partId, input.version);
        const snap = await loadSnap(row, tx);
        const revisions = await bomRepository.listRevisionsOfPart(
          row.partId,
          tx,
        );

        const problems = await collectProblems(tx, row.partId, snap, "release");
        problems.push(...(await graphProblems(tx, row.partId, snap, false)));
        const previous = revisions.filter(
          (r) =>
            r.id !== id && (r.status === "active" || r.status === "retired"),
        );
        if (previous.length > 0 && !input.reason) {
          problems.push({
            code: "REASON_REQUIRED",
            field: "reason",
            message: "A change reason of 3 to 500 characters is required",
          });
        }
        if (problems.length > 0) {
          throw new AppError(
            "The BOM cannot be released",
            400,
            "BOM_RELEASE_INVALID",
            { problems },
          );
        }

        const now = new Date();
        const active = revisions.find(
          (r) => r.id !== id && r.status === "active",
        );
        const against = active ?? previous[0];
        const diff = against
          ? diffSnaps(
              await loadSnap(await requireBom(against.id, tx), tx),
              snap,
            )
          : diffSnaps(null, snap);

        if (active) {
          await bomRepository.updateBom(tx, active.id, {
            status: "retired",
            retiredBy: actorId,
            retiredAt: now,
            version: active.version + 1,
            lastUpdatedBy: actorId,
            lastUpdatedAt: now,
          });
          await bomRepository.insertHistory(tx, {
            bomId: active.id,
            partId: row.partId,
            revisionNo: active.revisionNo,
            action: "retire",
            changes: {
              header: { status: { old: "active", new: "retired" } },
              lines: { added: [], removed: [], changed: [] },
            },
            reason: `Replaced by revision ${revisionLetter(row.revisionNo)}`,
            changedBy: actorId,
          });
        }
        const released = await bomRepository.updateBom(tx, id, {
          status: "active",
          releasedBy: actorId,
          releasedAt: now,
          changeReason: input.reason ?? null,
          version: row.version + 1,
          lastUpdatedBy: actorId,
          lastUpdatedAt: now,
        });
        await bomRepository.insertHistory(tx, {
          bomId: id,
          partId: row.partId,
          revisionNo: row.revisionNo,
          action: "release",
          changes: historyChanges(diff),
          reason: input.reason ?? null,
          changedBy: actorId,
        });
        return {
          id: released.id,
          status: released.status,
          version: released.version,
          retiredPreviousId: active?.id ?? null,
        };
      });
    } catch (error) {
      // BR-BOM-17: the partial unique index is the backstop for the race
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "Another revision of this part was released at the same time",
          "BOM_RELEASE_CONFLICT",
        );
      }
      throw error;
    }
  },

  // BR-BOM-16
  async retire(id: number, input: RetireBomInput, actorId: number) {
    const pre = await requireBom(id);
    return db.transaction(async (tx) => {
      await bomRepository.lockPartSeq(tx, pre.partId);
      const row = await bomRepository.findBomForUpdate(tx, id);
      if (!row) throw new NotFoundError("BOM not found");
      if (row.status !== "active") {
        throw new ConflictError(
          "Only an active revision can be retired",
          "BOM_NOT_ACTIVE",
        );
      }
      const now = new Date();
      const retired = await bomRepository.updateBom(tx, id, {
        status: "retired",
        retiredBy: actorId,
        retiredAt: now,
        retireReason: input.reason,
        version: row.version + 1,
        lastUpdatedBy: actorId,
        lastUpdatedAt: now,
      });
      await bomRepository.insertHistory(tx, {
        bomId: id,
        partId: row.partId,
        revisionNo: row.revisionNo,
        action: "retire",
        changes: {
          header: { status: { old: "active", new: "retired" } },
          lines: { added: [], removed: [], changed: [] },
        },
        reason: input.reason,
        changedBy: actorId,
      });
      return {
        id: retired.id,
        status: retired.status,
        version: retired.version,
      };
    });
  },
};
