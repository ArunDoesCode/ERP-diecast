import {
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
} from "../lib/errors";
import { assetRepository } from "../repository/assetRepository";
import type {
  assetInventoryMovementListQuerySchemaType,
  assetItemCreateSchemaType,
  assetItemListQuerySchemaType,
  assetItemUpdateSchemaType,
  assetLastRateQuerySchemaType,
  assetLocationCreateSchemaType,
  assetLocationListQuerySchemaType,
  assetLocationUpdateSchemaType,
  assetMachineCreateSchemaType,
  assetMachineListQuerySchemaType,
  assetMachineUpdateSchemaType,
  assetManualMovementCreateSchemaType,
  assetReconciliationQuerySchemaType,
  assetServiceCreateSchemaType,
  assetServiceListQuerySchemaType,
  assetServiceUpdateSchemaType,
  assetStockListQuerySchemaType,
} from "../types/asset.types";

type DbUniqueError = {
  code?: string;
  constraint_name?: string;
  constraint?: string;
};

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function getConflictError(error: unknown) {
  // drizzle wraps the driver error: the Postgres error is on `cause`
  const outer = error as { cause?: unknown };
  const dbError = (
    (outer?.cause as DbUniqueError | undefined)?.code ? outer.cause : error
  ) as DbUniqueError;

  if (dbError?.code !== "23505") {
    return undefined;
  }

  const constraint = dbError.constraint_name ?? dbError.constraint ?? "";

  if (constraint.includes("item_master_sku")) {
    return new ConflictError("Item SKU already exists");
  }

  if (constraint.includes("service_master_code")) {
    return new ConflictError("Service code already exists");
  }

  if (constraint.includes("locations_name")) {
    return new ConflictError("Location name already exists");
  }

  if (constraint.includes("machines_name")) {
    return new ConflictError("Machine name already exists");
  }

  if (constraint.includes("machines_code")) {
    return new ConflictError("Machine code already exists");
  }

  return new ConflictError("Duplicate value violates a unique constraint");
}

// BR-INV-12, 13 on the values the location will have.
async function checkLocationRules(
  next: {
    type: "main_store" | "vendor_premise" | "finished_goods" | "scrap_yard";
    linkedVendorId: number | null;
  },
  currentId: number | undefined,
) {
  if (next.type === "vendor_premise") {
    if (next.linkedVendorId === null) {
      throw new BadRequestError("A vendor premise must link a supplier");
    }
    const supplier = await assetRepository.findSupplierForLocation(
      next.linkedVendorId,
    );
    if (!supplier) {
      throw new BadRequestError("Supplier not found");
    }
    if (!supplier.isActive) {
      throw new BadRequestError("Supplier is inactive");
    }
    const others = await assetRepository.countLocations("vendor_premise", {
      supplierId: next.linkedVendorId,
      ...(currentId !== undefined ? { excludeId: currentId } : {}),
    });
    if (others > 0) {
      throw new ConflictError("This supplier already has a vendor premise");
    }
  } else if (next.linkedVendorId !== null) {
    throw new BadRequestError("Only a vendor premise can link a supplier");
  }
  if (next.type === "main_store") {
    const others = await assetRepository.countLocations("main_store", {
      ...(currentId !== undefined ? { excludeId: currentId } : {}),
    });
    if (others > 0) {
      throw new ConflictError("There is already a main store");
    }
  }
}

export const assetService = {
  async listItems(params: assetItemListQuerySchemaType) {
    const { rows, total } = await assetRepository.listItems(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async createItem(input: assetItemCreateSchemaType, actorId: number) {
    try {
      const created = await assetRepository.createItem(input, actorId);
      if (!created) {
        throw new InternalServerError("Failed to create item");
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

  async updateItem(
    id: number,
    input: assetItemUpdateSchemaType,
    actorId: number,
  ) {
    const current = await assetRepository.findItemById(id);
    if (!current) {
      throw new NotFoundError("Item not found");
    }
    // BR-INV-04: SKU and unit are locked once the item is used anywhere.
    const skuChanges = input.sku !== undefined && input.sku !== current.sku;
    const uomChanges = input.uom !== undefined && input.uom !== current.uom;
    if ((skuChanges || uomChanges) && (await assetRepository.isItemInUse(id))) {
      throw new ConflictError(
        "SKU and unit can't change once the item is in use",
        "ITEM_IN_USE",
      );
    }
    try {
      const updated = await assetRepository.updateItem(id, {
        ...input,
        lastUpdatedBy: actorId,
        lastUpdatedAt: new Date(),
      });
      if (!updated) {
        throw new NotFoundError("Item not found");
      }
      return updated;
    } catch (error) {
      const conflictError = getConflictError(error);
      if (conflictError) {
        throw conflictError;
      }
      throw error;
    }
  },

  async getLastRate(itemId: number, params: assetLastRateQuerySchemaType) {
    const result = await assetRepository.getLastRate(itemId, params.supplierId);
    if (!result) {
      throw new NotFoundError(
        "No PO history, supplier catalog price, or item estimate found for this item.",
      );
    }
    return result;
  },

  async listServices(params: assetServiceListQuerySchemaType) {
    const { rows, total } = await assetRepository.listServices(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async createService(input: assetServiceCreateSchemaType, actorId: number) {
    try {
      const created = await assetRepository.createService(input, actorId);
      if (!created) {
        throw new InternalServerError("Failed to create service");
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

  async updateService(
    id: number,
    input: assetServiceUpdateSchemaType,
    actorId: number,
  ) {
    try {
      const updated = await assetRepository.updateService(id, {
        ...input,
        lastUpdatedBy: actorId,
        lastUpdatedAt: new Date(),
      });

      if (!updated) {
        throw new NotFoundError("Service not found");
      }

      return updated;
    } catch (error) {
      const conflictError = getConflictError(error);
      if (conflictError) {
        throw conflictError;
      }
      throw error;
    }
  },

  async listInventoryMovements(
    params: assetInventoryMovementListQuerySchemaType,
  ) {
    const { rows, total } =
      await assetRepository.listInventoryMovements(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async listLocations(params: assetLocationListQuerySchemaType) {
    const { rows, total } = await assetRepository.listLocations(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async createLocation(input: assetLocationCreateSchemaType, actorId: number) {
    await checkLocationRules(
      { type: input.type, linkedVendorId: input.linkedVendorId ?? null },
      undefined,
    );
    try {
      const created = await assetRepository.createLocation(
        {
          ...input,
          linkedVendorId: input.linkedVendorId ?? null,
          ...(input.type === "vendor_premise" ? { isVirtual: true } : {}),
        },
        actorId,
      );
      if (!created) {
        throw new InternalServerError("Failed to create location");
      }
      return created;
    } catch (error) {
      throw getConflictError(error) ?? error;
    }
  },

  async updateLocation(
    id: number,
    input: assetLocationUpdateSchemaType,
    actorId: number,
  ) {
    const current = await assetRepository.findLocationById(id);
    if (!current) {
      throw new NotFoundError("Location not found");
    }
    const type = input.type ?? current.type;
    const linkedVendorId =
      input.linkedVendorId !== undefined
        ? input.linkedVendorId
        : type === "vendor_premise"
          ? current.linkedVendorId
          : null;
    const typeChanges = type !== current.type;
    const linkChanges = linkedVendorId !== current.linkedVendorId;

    if (
      (typeChanges || linkChanges) &&
      (await assetRepository.locationHasLedgerRows(id))
    ) {
      throw new ConflictError(
        "Type and linked supplier can't change once the location has stock rows",
        "LOCATION_IN_USE",
      );
    }
    if (typeChanges || linkChanges) {
      await checkLocationRules({ type, linkedVendorId }, id);
      if (typeChanges && current.type === "main_store") {
        const others = await assetRepository.countLocations("main_store", {
          excludeId: id,
        });
        if (others === 0) {
          throw new ConflictError("There must be exactly one main store");
        }
      }
    }
    try {
      const updated = await assetRepository.updateLocation(id, {
        ...input,
        ...(typeChanges || linkChanges ? { linkedVendorId } : {}),
        ...(type === "vendor_premise" ? { isVirtual: true } : {}),
        lastUpdatedBy: actorId,
        lastUpdatedAt: new Date(),
      });
      if (!updated) {
        throw new NotFoundError("Location not found");
      }
      return updated;
    } catch (error) {
      throw getConflictError(error) ?? error;
    }
  },

  // Manual stock-take / opening stock only (BR-GRN-43, BR-INV-21..23).
  // Document types are posted from their source document.
  async createInventoryMovement(
    input: assetManualMovementCreateSchemaType,
    actorId: number,
  ) {
    if (
      input.referenceType !== "stock_adjustment" &&
      input.referenceType !== "opening_stock"
    ) {
      throw new BadRequestError(
        `Type ${input.referenceType} is posted from its source document, not by hand.`,
      );
    }
    return assetRepository.manualMovement(input, actorId);
  },

  async inventoryStock(params: assetStockListQuerySchemaType) {
    const { rows, total } = await assetRepository.listStock(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async inventoryReconciliation(params: assetReconciliationQuerySchemaType) {
    const { rows, total } =
      await assetRepository.inventoryReconciliation(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async listMachines(params: assetMachineListQuerySchemaType) {
    const { rows, total } = await assetRepository.listMachines(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async createMachine(input: assetMachineCreateSchemaType, actorId: number) {
    try {
      const created = await assetRepository.createMachine(input, actorId);
      if (!created) {
        throw new InternalServerError("Failed to create machine");
      }
      return created;
    } catch (error) {
      throw getConflictError(error) ?? error;
    }
  },

  async updateMachine(
    id: number,
    input: assetMachineUpdateSchemaType,
    actorId: number,
  ) {
    try {
      const updated = await assetRepository.updateMachine(id, {
        ...input,
        lastUpdatedBy: actorId,
        lastUpdatedAt: new Date(),
      });

      if (!updated) {
        throw new NotFoundError("Machine not found");
      }

      return updated;
    } catch (error) {
      throw getConflictError(error) ?? error;
    }
  },
};
