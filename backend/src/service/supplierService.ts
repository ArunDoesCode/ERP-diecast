import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import {
  type SupplierHistoryInsert,
  supplierRepository,
} from "../repository/supplierRepository";
import type {
  supplierCreateSchemaType,
  supplierHistoryQuerySchemaType,
  supplierItemBatchEditSchemaType,
  supplierItemCreateSchemaType,
  supplierItemEditSchemaType,
  supplierItemListQuerySchemaType,
  supplierListQuerySchemaType,
  supplierServiceBatchEditSchemaType,
  supplierServiceCreateSchemaType,
  supplierServiceEditSchemaType,
  supplierServiceListQuerySchemaType,
  supplierUpdateSchemaType,
} from "../types/supplier.types";

// BR-SUP-22: fixed plain sentences, never database text.
const MSG = {
  nameExists: "Supplier name already exists, use a different name",
  gstExists: "Supplier GST number already exists",
  rowExists: "Already on this supplier's price list",
  panMismatch: "PAN must match characters 3-12 of the GST number",
  giveOneTarget: "Give one target: row id or item/service id",
  giveOneField: "Give at least one field to change",
  itemNotOnSupplier: "Item not on this supplier",
  serviceNotOnSupplier: "Service not on this supplier",
  unitMismatch: "Unit must be the item's unit",
  batchFailed: "Some rows could not be saved, nothing was saved",
} as const;

function findDuplicateItemIds(itemIds: number[]) {
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  for (const id of itemIds) {
    if (seen.has(id)) {
      duplicates.add(id);
      continue;
    }
    seen.add(id);
  }

  return [...duplicates];
}

type DbError = {
  code?: string;
  constraint_name?: string;
  constraint?: string;
  cause?: unknown;
};

function getConflictError(error: unknown, rowMessage = MSG.rowExists) {
  // drizzle wraps the driver error in `cause`
  const wrapped = error as DbError;
  const dbError = (wrapped?.cause ?? wrapped) as DbError;

  if (dbError?.code !== "23505") {
    return undefined;
  }

  const constraint = dbError.constraint_name ?? dbError.constraint ?? "";

  if (constraint.includes("supplier_master_name_norm")) {
    return new ConflictError(MSG.nameExists);
  }
  if (constraint.includes("gst_number")) {
    return new ConflictError(MSG.gstExists);
  }
  if (
    constraint.includes("unique_supplier_item_idx") ||
    constraint.includes("unique_supplier_service_idx")
  ) {
    return new ConflictError(rowMessage);
  }
  return new ConflictError("Already exists");
}

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function normalizeToArray<T>(input: T | T[]) {
  return Array.isArray(input) ? input : [input];
}

/** "" -> null for clearable text fields (BR-SUP-02, 09). */
function blankToNull(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim() === "" ? null : value;
}

function panFromGstin(gst: string) {
  return gst.slice(2, 12);
}

function asText(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function diffFields(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  const changed: {
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }[] = [];
  for (const [field, value] of Object.entries(next)) {
    if (value === undefined) continue;
    if (current[field] === value) continue;
    changed.push({
      field,
      oldValue: asText(current[field]),
      newValue: asText(value),
    });
  }
  return changed;
}

type RowResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Tx = Parameters<Parameters<typeof supplierRepository.transaction>[0]>[0];

type PriceListRow = Record<string, unknown> & { id: number };

/**
 * #22: what differs between an item and a service price-list row. Everything
 * else (selectors, field diff, history, batch all-or-nothing) is shared.
 */
type PriceListKind<E> = {
  entity: "item" | "service";
  fields: readonly string[];
  notOnSupplier: string;
  /** Row id or item/service id of one edit. */
  target(edit: E): { rowId: number | undefined; refId: number | undefined };
  /** The item/service id a stored row points at. */
  refOf(row: PriceListRow): number;
  lockRows(
    supplierId: number,
    targets: { rowIds: number[]; refIds: number[] },
    tx: Tx,
  ): Promise<PriceListRow[]>;
  /** Extra per-row checks and clean-up; returns an error text or undefined. */
  prepare?(
    edit: E,
    current: PriceListRow,
    fields: Record<string, unknown>,
  ): string | undefined;
  updateRow(
    rowId: number,
    data: Record<string, unknown>,
    tx: Tx,
  ): Promise<PriceListRow | undefined>;
};

const ITEM_KIND: PriceListKind<supplierItemEditSchemaType> = {
  entity: "item",
  fields: [
    "supplierSku",
    "supplierUnitPricePaise",
    "taxPercentage",
    "leadTimeDays",
    "qty",
    "uom",
    "isActive",
  ],
  notOnSupplier: MSG.itemNotOnSupplier,
  target: (edit) => ({ rowId: edit.supplierItemsId, refId: edit.itemId }),
  refOf: (row) => row.itemId as number,
  lockRows: (supplierId, targets, tx) =>
    supplierRepository.lockItemRows(supplierId, targets, tx),
  prepare(edit, current, fields) {
    if ("supplierSku" in fields) {
      fields.supplierSku = blankToNull(fields.supplierSku as string | null);
    }
    if (edit.uom !== undefined && edit.uom !== current.itemUom) {
      return MSG.unitMismatch;
    }
    return undefined;
  },
  updateRow: (rowId, data, tx) =>
    supplierRepository.updateItemRow(rowId, data, tx),
};

const SERVICE_KIND: PriceListKind<supplierServiceEditSchemaType> = {
  entity: "service",
  fields: [
    "serviceUnitPricePaise",
    "taxPercentage",
    "leadTimeDays",
    "isActive",
  ],
  notOnSupplier: MSG.serviceNotOnSupplier,
  target: (edit) => ({ rowId: edit.supplierServiceId, refId: edit.serviceId }),
  refOf: (row) => row.serviceId as number,
  lockRows: (supplierId, targets, tx) =>
    supplierRepository.lockServiceRows(supplierId, targets, tx),
  updateRow: (rowId, data, tx) =>
    supplierRepository.updateServiceRow(rowId, data, tx),
};

function pickDefined(source: Record<string, unknown>, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/**
 * Locks every row the edits target in one query, then applies each edit in
 * order: one UPDATE per changed row, and all history rows in one INSERT at
 * the end (#42). Returns one result per edit.
 */
async function applyEdits<E extends Record<string, unknown>>(
  kind: PriceListKind<E>,
  tx: Tx,
  supplierId: number,
  edits: E[],
  actorId: number,
): Promise<RowResult<PriceListRow>[]> {
  const targets = edits.map((edit) => kind.target(edit));
  const locked = await kind.lockRows(
    supplierId,
    {
      rowIds: targets.flatMap((t) => (t.rowId !== undefined ? [t.rowId] : [])),
      refIds: targets.flatMap((t) => (t.refId !== undefined ? [t.refId] : [])),
    },
    tx,
  );
  const byId = new Map(locked.map((row) => [row.id, row]));
  const byRef = new Map(locked.map((row) => [kind.refOf(row), row]));

  const history: SupplierHistoryInsert[] = [];
  const results: RowResult<PriceListRow>[] = [];
  for (const [index, edit] of edits.entries()) {
    const { rowId, refId } = targets[index] as (typeof targets)[number];
    if ((rowId !== undefined) === (refId !== undefined)) {
      results.push({ ok: false, error: MSG.giveOneTarget });
      continue;
    }
    const fields = pickDefined(edit, kind.fields);
    if (Object.keys(fields).length === 0) {
      results.push({ ok: false, error: MSG.giveOneField });
      continue;
    }
    const current =
      rowId !== undefined ? byId.get(rowId) : byRef.get(refId as number);
    if (!current) {
      results.push({ ok: false, error: kind.notOnSupplier });
      continue;
    }
    const problem = kind.prepare?.(edit, current, fields);
    if (problem) {
      results.push({ ok: false, error: problem });
      continue;
    }

    const changes = diffFields(current, fields);
    if (changes.length === 0) {
      results.push({ ok: true, data: current });
      continue;
    }
    const updated = await kind.updateRow(
      current.id,
      { ...fields, lastUpdatedBy: actorId, lastUpdatedAt: new Date() },
      tx,
    );
    // A later edit of the same row in this batch sees the new values.
    const next = updated ? { ...current, ...updated } : current;
    byId.set(next.id, next);
    byRef.set(kind.refOf(next), next);
    for (const change of changes) {
      history.push({
        supplierId,
        entity: kind.entity,
        entityId: current.id,
        changedBy: actorId,
        ...change,
      });
    }
    results.push({ ok: true, data: updated ?? current });
  }
  if (results.every((result) => result.ok)) {
    await supplierRepository.insertHistory(history, tx);
  }
  return results;
}

class BatchRollback extends Error {}

function buildBatchSummary(results: { success: boolean }[]) {
  return {
    total: results.length,
    success: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
  };
}

/**
 * BR-SUP-19..21: one transaction, all rows or none; per-row reasons come back
 * either way. BR-SUP-27: a single (non-array) edit of a row that is not on the
 * supplier is a 404.
 */
async function runBatchEdit<E extends Record<string, unknown>>(
  kind: PriceListKind<E>,
  supplierId: number,
  input: E | E[],
  actorId: number,
) {
  await requireSupplier(supplierId);
  const edits = normalizeToArray(input);

  type Row = {
    index: number;
    selector: Record<string, number | undefined>;
    success: boolean;
    data?: unknown;
    error?: string;
  };
  let results: Row[] = [];
  try {
    await supplierRepository.transaction(async (tx) => {
      const outcomes = await applyEdits(kind, tx, supplierId, edits, actorId);
      results = outcomes.map((outcome, index) => {
        const { rowId, refId } = kind.target(edits[index] as E);
        const selector =
          kind.entity === "item"
            ? { supplierItemsId: rowId, itemId: refId }
            : { supplierServiceId: rowId, serviceId: refId };
        return outcome.ok
          ? { index, selector, success: true, data: outcome.data }
          : { index, selector, success: false, error: outcome.error };
      });
      if (results.some((r) => !r.success)) {
        throw new BatchRollback();
      }
    });
  } catch (error) {
    if (!(error instanceof BatchRollback)) throw error;
    for (const r of results) delete r.data;
    if (!Array.isArray(input) && results[0]?.error === kind.notOnSupplier) {
      throw new NotFoundError(kind.notOnSupplier);
    }
  }

  return { data: results, summary: buildBatchSummary(results) };
}

// #22: shared save of one new price-list row (item or service); a repeat
// row is 409 (BR-SUP-11).
async function saveOneRow<T>(create: () => Promise<T[]>) {
  try {
    const [created] = await create();
    if (!created) {
      throw new BadRequestError("Could not save the price list row");
    }
    return created;
  } catch (error) {
    throw getConflictError(error) ?? error;
  }
}

async function requireSupplier(supplierId: number) {
  const supplier = await supplierRepository.findSupplierById(supplierId);
  if (!supplier) {
    throw new NotFoundError("Supplier not found");
  }
}

export const supplierService = {
  async list(params: supplierListQuerySchemaType) {
    const { rows, total } = await supplierRepository.list(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async listItems(supplierId: number, params: supplierItemListQuerySchemaType) {
    await requireSupplier(supplierId);

    const { rows, total } = await supplierRepository.listSupplierItems(
      supplierId,
      params,
    );

    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async listServices(
    supplierId: number,
    params: supplierServiceListQuerySchemaType,
  ) {
    await requireSupplier(supplierId);

    const { rows, total } = await supplierRepository.listSupplierServices(
      supplierId,
      params,
    );

    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  // BR-SUP-10
  async listHistory(
    supplierId: number,
    params: supplierHistoryQuerySchemaType,
  ) {
    await requireSupplier(supplierId);
    const { rows, total } = await supplierRepository.listHistory(
      supplierId,
      params,
    );
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async getSupplierDetails(supplierId: number) {
    const detail = await supplierRepository.findSupplierDetailById(supplierId);

    if (!detail) {
      throw new NotFoundError("Supplier not found");
    }

    return detail;
  },

  async createSupplierItem(
    supplierId: number,
    input: supplierItemCreateSchemaType,
    actorId: number,
  ) {
    await requireSupplier(supplierId);

    const existingItemIds = await supplierRepository.findExistingItemIds(
      [input.itemId],
      true, // BR-INV-05: no new link to an inactive item
    );
    if (!existingItemIds.has(input.itemId)) {
      throw new BadRequestError(`Unknown item: ${input.itemId}`);
    }
    const uoms = await supplierRepository.findItemUoms([input.itemId]);
    if (uoms.get(input.itemId) !== input.uom) {
      throw new BadRequestError(MSG.unitMismatch);
    }

    return saveOneRow(() =>
      supplierRepository.createSupplierItems(
        supplierId,
        [
          {
            ...input,
            supplierSku: blankToNull(input.supplierSku) ?? undefined,
          },
        ],
        actorId,
      ),
    );
  },

  async createSupplierService(
    supplierId: number,
    input: supplierServiceCreateSchemaType,
    actorId: number,
  ) {
    await requireSupplier(supplierId);

    const existingServiceIds = await supplierRepository.findExistingServiceIds([
      input.serviceId,
    ]);
    if (!existingServiceIds.has(input.serviceId)) {
      throw new BadRequestError(`Unknown service: ${input.serviceId}`);
    }

    return saveOneRow(() =>
      supplierRepository.createSupplierServices(supplierId, [input], actorId),
    );
  },

  // Returns the supplier row (contract.md), not {supplier, supplierItems}.
  async create(input: supplierCreateSchemaType, actorId: number) {
    const supplierItems = input.supplierItems ?? [];

    // BR-SUP-17: repeated or unknown items reject the whole create, naming the ids.
    if (supplierItems.length > 0) {
      const itemIds = supplierItems.map((item) => item.itemId);
      const duplicateItemIds = findDuplicateItemIds(itemIds);
      const existingItemIds = await supplierRepository.findExistingItemIds(
        itemIds,
        true,
      );
      const missingItemIds = [
        ...new Set(itemIds.filter((itemId) => !existingItemIds.has(itemId))),
      ];
      const bad = [...new Set([...duplicateItemIds, ...missingItemIds])];
      if (bad.length > 0) {
        throw new BadRequestError(
          `Unknown or repeated items: ${bad.join(", ")}`,
        );
      }

      const uoms = await supplierRepository.findItemUoms(itemIds);
      const wrongUnit = supplierItems
        .filter((item) => uoms.get(item.itemId) !== item.uom)
        .map((item) => item.itemId);
      if (wrongUnit.length > 0) {
        throw new BadRequestError(
          `${MSG.unitMismatch}: items ${wrongUnit.join(", ")}`,
        );
      }
    }

    const { supplierItems: _, ...rest } = input;
    const gstNumber = blankToNull(rest.gstNumber) ?? null;
    let panNumber = blankToNull(rest.panNumber) ?? null;
    if (gstNumber) {
      if (panNumber && panNumber !== panFromGstin(gstNumber)) {
        throw new BadRequestError(MSG.panMismatch);
      }
      panNumber = panFromGstin(gstNumber); // BR-SUP-04: filled from GSTIN when blank
    }
    const supplierData = {
      ...rest,
      gstNumber,
      panNumber,
      contactPerson: blankToNull(rest.contactPerson) ?? null,
      email: blankToNull(rest.email) ?? null,
      phone: blankToNull(rest.phone) ?? null,
      address: blankToNull(rest.address) ?? null,
    };

    try {
      const created = await supplierRepository.create(
        supplierData,
        supplierItems.map((item) => ({
          ...item,
          supplierSku: blankToNull(item.supplierSku) ?? undefined,
        })),
        actorId,
      );
      return created.supplier;
    } catch (error) {
      const conflictError = getConflictError(error);
      if (conflictError) {
        throw conflictError;
      }
      throw error;
    }
  },

  async update(id: number, input: supplierUpdateSchemaType, actorId: number) {
    if (input.mode === "master") {
      const { mode: _, ...raw } = input;
      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (value === undefined) continue;
        data[key] =
          typeof value === "string" && key !== "name" && key !== "type"
            ? blankToNull(value)
            : value;
      }

      try {
        return await supplierRepository.transaction(async (tx) => {
          const current = await supplierRepository.findMasterForUpdate(id, tx);
          if (!current) {
            throw new NotFoundError("Supplier not found");
          }

          // BR-SUP-04: PAN must equal GSTIN chars 3-12; blank PAN is filled from GSTIN.
          const gst =
            data.gstNumber !== undefined
              ? (data.gstNumber as string | null)
              : current.gstNumber;
          // BR-SUP-04: a changed GSTIN fills PAN again from the new GSTIN
          // unless the edit also sends a PAN.
          const gstChanged =
            data.gstNumber !== undefined &&
            data.gstNumber !== current.gstNumber;
          let pan =
            data.panNumber !== undefined
              ? (data.panNumber as string | null)
              : gstChanged
                ? null
                : current.panNumber;
          if (gst) {
            if (pan && pan !== panFromGstin(gst)) {
              throw new BadRequestError(MSG.panMismatch);
            }
            if (!pan) {
              pan = panFromGstin(gst);
              data.panNumber = pan;
            }
          }

          const changes = diffFields(current, data);
          if (changes.length === 0) {
            return current;
          }
          const updated = await supplierRepository.updateMaster(id, data, tx);
          await supplierRepository.insertHistory(
            changes.map(
              (c): SupplierHistoryInsert => ({
                supplierId: id,
                entity: "supplier",
                entityId: id,
                changedBy: actorId,
                ...c,
              }),
            ),
            tx,
          );
          return updated ?? current;
        });
      } catch (error) {
        const conflictError = getConflictError(error);
        if (conflictError) {
          throw conflictError;
        }
        throw error;
      }
    }

    // mode "item": one price-list row, same rules as the batch
    const { mode: _, ...edit } = input;
    await requireSupplier(id);
    const [outcome] = await supplierRepository.transaction(async (tx) =>
      applyEdits(ITEM_KIND, tx, id, [edit], actorId),
    );
    if (!outcome) {
      throw new BadRequestError(MSG.giveOneTarget);
    }
    if (!outcome.ok) {
      if (outcome.error === MSG.itemNotOnSupplier) {
        throw new NotFoundError(outcome.error);
      }
      throw new BadRequestError(outcome.error);
    }
    return outcome.data;
  },

  // BR-SUP-19..21, 27: see runBatchEdit.
  async editSupplierItems(
    supplierId: number,
    input: supplierItemBatchEditSchemaType,
    actorId: number,
  ) {
    return runBatchEdit(ITEM_KIND, supplierId, input, actorId);
  },

  async editSupplierServices(
    supplierId: number,
    input: supplierServiceBatchEditSchemaType,
    actorId: number,
  ) {
    return runBatchEdit(SERVICE_KIND, supplierId, input, actorId);
  },
};

export const SUPPLIER_BATCH_FAILED_MESSAGE = MSG.batchFailed;
