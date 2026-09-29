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

const ITEM_FIELDS = [
  "supplierSku",
  "supplierUnitPricePaise",
  "taxPercentage",
  "leadTimeDays",
  "qty",
  "uom",
  "isActive",
] as const;
const SERVICE_FIELDS = [
  "serviceUnitPricePaise",
  "taxPercentage",
  "leadTimeDays",
  "isActive",
] as const;

function pickDefined<K extends string>(
  source: Record<string, unknown>,
  keys: readonly K[],
) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

type Tx = Parameters<Parameters<typeof supplierRepository.transaction>[0]>[0];

async function applyItemEdit(
  tx: Tx,
  supplierId: number,
  edit: supplierItemEditSchemaType,
  actorId: number,
): Promise<RowResult<Record<string, unknown>>> {
  const hasRowId = edit.supplierItemsId !== undefined;
  const hasItemId = edit.itemId !== undefined;
  if (hasRowId === hasItemId) {
    return { ok: false, error: MSG.giveOneTarget };
  }
  const fields = pickDefined(edit, ITEM_FIELDS);
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: MSG.giveOneField };
  }
  if ("supplierSku" in fields) {
    fields.supplierSku = blankToNull(fields.supplierSku as string | null);
  }

  const current = await supplierRepository.findItemRow(
    supplierId,
    { supplierItemsId: edit.supplierItemsId, itemId: edit.itemId },
    tx,
  );
  if (!current) {
    return { ok: false, error: MSG.itemNotOnSupplier };
  }
  if (edit.uom !== undefined && edit.uom !== current.itemUom) {
    return { ok: false, error: MSG.unitMismatch };
  }

  const changes = diffFields(current, fields);
  if (changes.length === 0) {
    return { ok: true, data: current };
  }
  const updated = await supplierRepository.updateItemRow(
    current.id,
    { ...fields, lastUpdatedBy: actorId, lastUpdatedAt: new Date() },
    tx,
  );
  await supplierRepository.insertHistory(
    changes.map(
      (c): SupplierHistoryInsert => ({
        supplierId,
        entity: "item",
        entityId: current.id,
        changedBy: actorId,
        ...c,
      }),
    ),
    tx,
  );
  return { ok: true, data: updated ?? current };
}

async function applyServiceEdit(
  tx: Tx,
  supplierId: number,
  edit: supplierServiceEditSchemaType,
  actorId: number,
): Promise<RowResult<Record<string, unknown>>> {
  const hasRowId = edit.supplierServiceId !== undefined;
  const hasServiceId = edit.serviceId !== undefined;
  if (hasRowId === hasServiceId) {
    return { ok: false, error: MSG.giveOneTarget };
  }
  const fields = pickDefined(edit, SERVICE_FIELDS);
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: MSG.giveOneField };
  }

  const current = await supplierRepository.findServiceRow(
    supplierId,
    { supplierServiceId: edit.supplierServiceId, serviceId: edit.serviceId },
    tx,
  );
  if (!current) {
    return { ok: false, error: MSG.serviceNotOnSupplier };
  }

  const changes = diffFields(current, fields);
  if (changes.length === 0) {
    return { ok: true, data: current };
  }
  const updated = await supplierRepository.updateServiceRow(
    current.id,
    { ...fields, lastUpdatedBy: actorId, lastUpdatedAt: new Date() },
    tx,
  );
  await supplierRepository.insertHistory(
    changes.map(
      (c): SupplierHistoryInsert => ({
        supplierId,
        entity: "service",
        entityId: current.id,
        changedBy: actorId,
        ...c,
      }),
    ),
    tx,
  );
  return { ok: true, data: updated ?? current };
}

class BatchRollback extends Error {}

function buildBatchSummary(results: { success: boolean }[]) {
  return {
    total: results.length,
    success: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
  };
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

    try {
      const [created] = await supplierRepository.createSupplierItems(
        supplierId,
        [
          {
            ...input,
            supplierSku: blankToNull(input.supplierSku) ?? undefined,
          },
        ],
        actorId,
      );

      if (!created) {
        throw new BadRequestError("Could not save the price list row");
      }

      return created;
    } catch (error) {
      const conflictError = getConflictError(error);
      if (conflictError) {
        throw conflictError;
      }
      throw error;
    }
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

    try {
      const [created] = await supplierRepository.createSupplierServices(
        supplierId,
        [input],
        actorId,
      );

      if (!created) {
        throw new BadRequestError("Could not save the price list row");
      }

      return created;
    } catch (error) {
      const conflictError = getConflictError(error);
      if (conflictError) {
        throw conflictError;
      }
      throw error;
    }
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
        supplierItems,
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
          let pan =
            data.panNumber !== undefined
              ? (data.panNumber as string | null)
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
    const outcome = await supplierRepository.transaction(async (tx) =>
      applyItemEdit(tx, id, edit, actorId),
    );
    if (!outcome.ok) {
      if (outcome.error === MSG.itemNotOnSupplier) {
        throw new NotFoundError(outcome.error);
      }
      throw new BadRequestError(outcome.error);
    }
    return outcome.data;
  },

  // BR-SUP-19..21: one transaction, all rows or none; per-row reasons come back either way.
  async editSupplierItems(
    supplierId: number,
    input: supplierItemBatchEditSchemaType,
    actorId: number,
  ) {
    await requireSupplier(supplierId);
    const edits = normalizeToArray(input);

    type Row = {
      index: number;
      selector: {
        supplierItemsId: number | undefined;
        itemId: number | undefined;
      };
      success: boolean;
      data?: unknown;
      error?: string;
    };
    const results: Row[] = [];
    try {
      await supplierRepository.transaction(async (tx) => {
        for (const [index, edit] of edits.entries()) {
          const selector = {
            supplierItemsId: edit.supplierItemsId,
            itemId: edit.itemId,
          };
          const outcome = await applyItemEdit(tx, supplierId, edit, actorId);
          results.push(
            outcome.ok
              ? { index, selector, success: true, data: outcome.data }
              : { index, selector, success: false, error: outcome.error },
          );
        }
        if (results.some((r) => !r.success)) {
          throw new BatchRollback();
        }
      });
    } catch (error) {
      if (!(error instanceof BatchRollback)) throw error;
      for (const r of results) delete r.data;
    }

    return { data: results, summary: buildBatchSummary(results) };
  },

  async editSupplierServices(
    supplierId: number,
    input: supplierServiceBatchEditSchemaType,
    actorId: number,
  ) {
    await requireSupplier(supplierId);
    const edits = normalizeToArray(input);

    type Row = {
      index: number;
      selector: {
        supplierServiceId: number | undefined;
        serviceId: number | undefined;
      };
      success: boolean;
      data?: unknown;
      error?: string;
    };
    const results: Row[] = [];
    try {
      await supplierRepository.transaction(async (tx) => {
        for (const [index, edit] of edits.entries()) {
          const selector = {
            supplierServiceId: edit.supplierServiceId,
            serviceId: edit.serviceId,
          };
          const outcome = await applyServiceEdit(tx, supplierId, edit, actorId);
          results.push(
            outcome.ok
              ? { index, selector, success: true, data: outcome.data }
              : { index, selector, success: false, error: outcome.error },
          );
        }
        if (results.some((r) => !r.success)) {
          throw new BatchRollback();
        }
      });
    } catch (error) {
      if (!(error instanceof BatchRollback)) throw error;
      for (const r of results) delete r.data;
    }

    return { data: results, summary: buildBatchSummary(results) };
  },
};

export const SUPPLIER_BATCH_FAILED_MESSAGE = MSG.batchFailed;
