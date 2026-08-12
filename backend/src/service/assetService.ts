import {
  ConflictError,
  InternalServerError,
  NotFoundError,
} from "../lib/errors";
import { assetRepository } from "../repository/assetRepository";
import type {
  assetInventoryMovementCreateSchemaType,
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
  assetServiceCreateSchemaType,
  assetServiceListQuerySchemaType,
  assetServiceUpdateSchemaType,
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
  const dbError = error as DbUniqueError;

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

  return new ConflictError("Duplicate value violates a unique constraint");
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

  async updateItem(id: number, input: assetItemUpdateSchemaType) {
    try {
      const updated = await assetRepository.updateItem(id, input);
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

  async createLocation(input: assetLocationCreateSchemaType) {
    const created = await assetRepository.createLocation(input);
    if (!created) {
      throw new InternalServerError("Failed to create location");
    }
    return created;
  },

  async updateLocation(id: number, input: assetLocationUpdateSchemaType) {
    const updated = await assetRepository.updateLocation(id, input);
    if (!updated) {
      throw new NotFoundError("Location not found");
    }
    return updated;
  },

  async createInventoryMovement(
    input: assetInventoryMovementCreateSchemaType,
    actorId: number,
  ) {
    const created = await assetRepository.createInventoryMovement(
      input,
      actorId,
    );
    if (!created) {
      throw new InternalServerError("Failed to create inventory movement");
    }
    return created;
  },

  async listMachines(params: assetMachineListQuerySchemaType) {
    const { rows, total } = await assetRepository.listMachines(params);
    return {
      data: rows,
      meta: toPaginatedMeta(params.page, params.pageSize, total),
    };
  },

  async createMachine(input: assetMachineCreateSchemaType, actorId: number) {
    const created = await assetRepository.createMachine(input, actorId);
    if (!created) {
      throw new InternalServerError("Failed to create machine");
    }
    return created;
  },

  async updateMachine(
    id: number,
    input: assetMachineUpdateSchemaType,
    actorId: number,
  ) {
    const updated = await assetRepository.updateMachine(id, {
      ...input,
      lastUpdatedBy: actorId,
      lastUpdatedAt: new Date(),
    });

    if (!updated) {
      throw new NotFoundError("Machine not found");
    }

    return updated;
  },
};
