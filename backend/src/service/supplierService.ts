import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { supplierRepository } from "../repository/supplierRepository";
import type {
  supplierCreateSchemaType,
  supplierItemBatchEditSchemaType,
  supplierItemCreateSchemaType,
  supplierItemListQuerySchemaType,
  supplierListQuerySchemaType,
  supplierServiceBatchEditSchemaType,
  supplierServiceCreateSchemaType,
  supplierServiceListQuerySchemaType,
  supplierUpdateSchemaType,
} from "../types/supplier.types";

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

function removeUndefined<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

type DbUniqueError = {
  code?: string;
  constraint_name?: string;
  constraint?: string;
};

function getConflictError(error: unknown) {
  const dbError = error as DbUniqueError;

  if (dbError?.code !== "23505") {
    return undefined;
  }

  const constraint = dbError.constraint_name ?? dbError.constraint ?? "";

  if (constraint.includes("gst_number")) {
    return new ConflictError("Supplier GST number already exists");
  }

  if (
    constraint.includes("unique_supplier_item_idx") ||
    (constraint.includes("supplier_id") && constraint.includes("item_id"))
  ) {
    return new ConflictError(
      "Supplier item already exists for this supplier and item",
    );
  }

  if (
    constraint.includes("unique_supplier_service_idx") ||
    (constraint.includes("supplier_id") && constraint.includes("service_id"))
  ) {
    return new ConflictError(
      "Supplier service already exists for this supplier and service",
    );
  }

  return new ConflictError("Duplicate value violates a unique constraint");
}

function normalizeToArray<T>(input: T | T[]) {
  return Array.isArray(input) ? input : [input];
}

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

type BatchItemResult<T> =
  | {
      index: number;
      selector: {
        supplierItemsId: number | undefined;
        itemId: number | undefined;
      };
      success: true;
      data: T;
    }
  | {
      index: number;
      selector: {
        supplierItemsId: number | undefined;
        itemId: number | undefined;
      };
      success: false;
      error: string;
    };

type BatchServiceResult<T> =
  | {
      index: number;
      selector: {
        supplierServiceId: number | undefined;
        serviceId: number | undefined;
      };
      success: true;
      data: T;
    }
  | {
      index: number;
      selector: {
        supplierServiceId: number | undefined;
        serviceId: number | undefined;
      };
      success: false;
      error: string;
    };

export const supplierService = {
  async list(params: supplierListQuerySchemaType) {
    const { rows, total } = await supplierRepository.list(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async listItems(supplierId: number, params: supplierItemListQuerySchemaType) {
    const supplier = await supplierRepository.findSupplierById(supplierId);
    if (!supplier) {
      throw new NotFoundError("Supplier not found");
    }

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
    const supplier = await supplierRepository.findSupplierById(supplierId);
    if (!supplier) {
      throw new NotFoundError("Supplier not found");
    }

    const { rows, total } = await supplierRepository.listSupplierServices(
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
    const supplier = await supplierRepository.findSupplierById(supplierId);
    if (!supplier) {
      throw new NotFoundError("Supplier not found");
    }

    const existingItemIds = await supplierRepository.findExistingItemIds([
      input.itemId,
    ]);
    if (!existingItemIds.has(input.itemId)) {
      throw new BadRequestError(`Invalid itemId: ${input.itemId}`);
    }

    try {
      const [created] = await supplierRepository.createSupplierItems(
        supplierId,
        [input],
        actorId,
      );

      if (!created) {
        throw new BadRequestError("Failed to create supplier item");
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
    const supplier = await supplierRepository.findSupplierById(supplierId);
    if (!supplier) {
      throw new NotFoundError("Supplier not found");
    }

    const existingServiceIds = await supplierRepository.findExistingServiceIds([
      input.serviceId,
    ]);
    if (!existingServiceIds.has(input.serviceId)) {
      throw new BadRequestError(`Invalid serviceId: ${input.serviceId}`);
    }

    try {
      const [created] = await supplierRepository.createSupplierServices(
        supplierId,
        [input],
        actorId,
      );

      if (!created) {
        throw new BadRequestError("Failed to create supplier service");
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

  async create(input: supplierCreateSchemaType, actorId: number) {
    const supplierItems = input.supplierItems ?? [];

    if (supplierItems.length > 0) {
      const itemIds = supplierItems.map((item) => item.itemId);
      const duplicateItemIds = findDuplicateItemIds(itemIds);
      if (duplicateItemIds.length > 0) {
        throw new BadRequestError(
          `Duplicate itemId entries in supplierItems: ${duplicateItemIds.join(", ")}`,
        );
      }

      const existingItemIds =
        await supplierRepository.findExistingItemIds(itemIds);
      const missingItemIds = itemIds.filter(
        (itemId) => !existingItemIds.has(itemId),
      );

      if (missingItemIds.length > 0) {
        throw new BadRequestError(
          `Invalid itemId entries in supplierItems: ${missingItemIds.join(", ")}`,
        );
      }
    }

    const { supplierItems: _, ...supplierData } = input;

    try {
      return await supplierRepository.create(
        supplierData,
        supplierItems,
        actorId,
      );
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
      const { mode: _, ...updateData } = input;
      let updated;
      try {
        updated = await supplierRepository.updateMaster(
          id,
          removeUndefined(updateData),
        );
      } catch (error) {
        const conflictError = getConflictError(error);
        if (conflictError) {
          throw conflictError;
        }
        throw error;
      }

      if (!updated) {
        throw new NotFoundError("Supplier not found");
      }
      return updated;
    }

    const {
      mode: _,
      supplierItemsId,
      itemId,
      supplierSku,
      supplierUnitPricePaise,
      taxPercentage,
      leadTimeDays,
      qty,
      uom,
      isActive,
    } = input;

    if (
      (supplierItemsId === undefined && itemId === undefined) ||
      (supplierItemsId !== undefined && itemId !== undefined)
    ) {
      throw new BadRequestError(
        "Provide exactly one selector: supplierItemsId or itemId",
      );
    }

    const updateData = {
      ...(supplierSku !== undefined ? { supplierSku } : {}),
      ...(supplierUnitPricePaise !== undefined
        ? { supplierUnitPricePaise }
        : {}),
      ...(taxPercentage !== undefined ? { taxPercentage } : {}),
      ...(leadTimeDays !== undefined ? { leadTimeDays } : {}),
      ...(qty !== undefined ? { qty } : {}),
      ...(uom !== undefined ? { uom } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      lastUpdatedBy: actorId,
      lastUpdatedAt: new Date(),
    };

    let updated;
    try {
      updated =
        supplierItemsId !== undefined
          ? await supplierRepository.updateItemBySupplierItemsId(
              id,
              supplierItemsId,
              updateData,
            )
          : await supplierRepository.updateItemByItemId(
              id,
              itemId as number,
              updateData,
            );
    } catch (error) {
      const conflictError = getConflictError(error);
      if (conflictError) {
        throw conflictError;
      }
      throw error;
    }

    if (!updated) {
      throw new NotFoundError("Supplier item not found");
    }

    return updated;
  },

  async editSupplierItems(
    supplierId: number,
    input: supplierItemBatchEditSchemaType,
    actorId: number,
  ) {
    const supplier = await supplierRepository.findSupplierById(supplierId);
    if (!supplier) {
      throw new NotFoundError("Supplier not found");
    }

    const edits = normalizeToArray(input);
    const itemIds = edits
      .map((edit) => edit.itemId)
      .filter((value): value is number => value !== undefined);

    const existingItemIds =
      itemIds.length > 0
        ? await supplierRepository.findExistingItemIds(itemIds)
        : new Set<number>();

    const results: BatchItemResult<unknown>[] = [];

    for (const [index, edit] of edits.entries()) {
      const selector = {
        supplierItemsId: edit.supplierItemsId,
        itemId: edit.itemId,
      };

      if (edit.itemId !== undefined && !existingItemIds.has(edit.itemId)) {
        results.push({
          index,
          selector,
          success: false,
          error: `Invalid itemId: ${edit.itemId}`,
        });
        continue;
      }

      const updateData = {
        ...(edit.supplierSku !== undefined
          ? { supplierSku: edit.supplierSku }
          : {}),
        ...(edit.supplierUnitPricePaise !== undefined
          ? { supplierUnitPricePaise: edit.supplierUnitPricePaise }
          : {}),
        ...(edit.taxPercentage !== undefined
          ? { taxPercentage: edit.taxPercentage }
          : {}),
        ...(edit.leadTimeDays !== undefined
          ? { leadTimeDays: edit.leadTimeDays }
          : {}),
        ...(edit.qty !== undefined ? { qty: edit.qty } : {}),
        ...(edit.uom !== undefined ? { uom: edit.uom } : {}),
        ...(edit.isActive !== undefined ? { isActive: edit.isActive } : {}),
        lastUpdatedBy: actorId,
        lastUpdatedAt: new Date(),
      };

      try {
        const updated =
          edit.supplierItemsId !== undefined
            ? await supplierRepository.editSupplierItemBySupplierItemsId(
                supplierId,
                edit.supplierItemsId,
                updateData,
              )
            : await supplierRepository.editSupplierItemByItemId(
                supplierId,
                edit.itemId as number,
                updateData,
              );

        if (!updated) {
          results.push({
            index,
            selector,
            success: false,
            error: "Supplier item not found",
          });
          continue;
        }

        results.push({ index, selector, success: true, data: updated });
      } catch (error) {
        const conflictError = getConflictError(error);
        results.push({
          index,
          selector,
          success: false,
          error:
            conflictError?.message ??
            (error instanceof Error ? error.message : "Update failed"),
        });
      }
    }

    return {
      data: results,
      summary: {
        total: results.length,
        success: results.filter((result) => result.success).length,
        failed: results.filter((result) => !result.success).length,
      },
    };
  },

  async editSupplierServices(
    supplierId: number,
    input: supplierServiceBatchEditSchemaType,
    actorId: number,
  ) {
    const supplier = await supplierRepository.findSupplierById(supplierId);
    if (!supplier) {
      throw new NotFoundError("Supplier not found");
    }

    const edits = normalizeToArray(input);
    const serviceIds = edits
      .map((edit) => edit.serviceId)
      .filter((value): value is number => value !== undefined);

    const existingServiceIds =
      serviceIds.length > 0
        ? await supplierRepository.findExistingServiceIds(serviceIds)
        : new Set<number>();

    const results: BatchServiceResult<unknown>[] = [];

    for (const [index, edit] of edits.entries()) {
      const selector = {
        supplierServiceId: edit.supplierServiceId,
        serviceId: edit.serviceId,
      };

      if (
        edit.serviceId !== undefined &&
        !existingServiceIds.has(edit.serviceId)
      ) {
        results.push({
          index,
          selector,
          success: false,
          error: `Invalid serviceId: ${edit.serviceId}`,
        });
        continue;
      }

      const updateData = {
        ...(edit.serviceUnitPricePaise !== undefined
          ? { serviceUnitPricePaise: edit.serviceUnitPricePaise }
          : {}),
        ...(edit.taxPercentage !== undefined
          ? { taxPercentage: edit.taxPercentage }
          : {}),
        ...(edit.leadTimeDays !== undefined
          ? { leadTimeDays: edit.leadTimeDays }
          : {}),
        ...(edit.isActive !== undefined ? { isActive: edit.isActive } : {}),
        lastUpdatedBy: actorId,
        lastUpdatedAt: new Date(),
      };

      try {
        const updated =
          edit.supplierServiceId !== undefined
            ? await supplierRepository.editSupplierServiceBySupplierServiceId(
                supplierId,
                edit.supplierServiceId,
                updateData,
              )
            : await supplierRepository.editSupplierServiceByServiceId(
                supplierId,
                edit.serviceId as number,
                updateData,
              );

        if (!updated) {
          results.push({
            index,
            selector,
            success: false,
            error: "Supplier service not found",
          });
          continue;
        }

        results.push({ index, selector, success: true, data: updated });
      } catch (error) {
        const conflictError = getConflictError(error);
        results.push({
          index,
          selector,
          success: false,
          error:
            conflictError?.message ??
            (error instanceof Error ? error.message : "Update failed"),
        });
      }
    }

    return {
      data: results,
      summary: {
        total: results.length,
        success: results.filter((result) => result.success).length,
        failed: results.filter((result) => !result.success).length,
      },
    };
  },
};
