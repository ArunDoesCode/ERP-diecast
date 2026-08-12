import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  lt,
  or,
} from "drizzle-orm";

import { db } from "../db/client";
import {
  inventoryLedger,
  itemMaster,
  locations,
  machines,
  purchaseOrderItems,
  purchaseOrders,
  serviceMaster,
  supplierItems,
} from "../db/schemas/02_procurement";
import type { PartialUpdate } from "../lib/types";
import type {
  assetInventoryMovementCreateSchemaType,
  assetInventoryMovementListQuerySchemaType,
  assetItemCreateSchemaType,
  assetItemListQuerySchemaType,
  assetLocationCreateSchemaType,
  assetLocationListQuerySchemaType,
  assetMachineCreateSchemaType,
  assetMachineListQuerySchemaType,
  assetServiceCreateSchemaType,
  assetServiceListQuerySchemaType,
} from "../types/asset.types";

const itemColumns = getTableColumns(itemMaster);

const serviceColumns = getTableColumns(serviceMaster);

const inventoryMovementColumns = {
  id: inventoryLedger.id,
  itemId: inventoryLedger.itemId,
  itemSku: itemMaster.sku,
  itemName: itemMaster.name,
  itemUom: itemMaster.uom,
  locationId: inventoryLedger.locationId,
  locationName: locations.name,
  locationType: locations.type,
  batchNumber: inventoryLedger.batchNumber,
  transactionType: inventoryLedger.transactionType,
  referenceType: inventoryLedger.referenceType,
  referenceId: inventoryLedger.referenceId,
  quantityChange: inventoryLedger.quantityChange,
  balanceAfter: inventoryLedger.balanceAfter,
  unitCostPaise: inventoryLedger.unitCostPaise,
  totalValueChangePaise: inventoryLedger.totalValueChangePaise,
  notes: inventoryLedger.notes,
  createdBy: inventoryLedger.createdBy,
  createdAt: inventoryLedger.createdAt,
};

const inventoryMovementWriteColumns = {
  id: inventoryLedger.id,
  itemId: inventoryLedger.itemId,
  locationId: inventoryLedger.locationId,
  batchNumber: inventoryLedger.batchNumber,
  transactionType: inventoryLedger.transactionType,
  referenceType: inventoryLedger.referenceType,
  referenceId: inventoryLedger.referenceId,
  quantityChange: inventoryLedger.quantityChange,
  balanceAfter: inventoryLedger.balanceAfter,
  unitCostPaise: inventoryLedger.unitCostPaise,
  totalValueChangePaise: inventoryLedger.totalValueChangePaise,
  notes: inventoryLedger.notes,
  createdBy: inventoryLedger.createdBy,
  createdAt: inventoryLedger.createdAt,
};

const locationColumns = getTableColumns(locations);

const machineColumns = getTableColumns(machines);

const itemSortColumns = {
  sku: itemMaster.sku,
  name: itemMaster.name,
  category: itemMaster.category,
  currentStock: itemMaster.currentStock,
  createdAt: itemMaster.createdAt,
} as const;

const serviceSortColumns = {
  code: serviceMaster.code,
  name: serviceMaster.name,
  createdAt: serviceMaster.createdAt,
} as const;

const inventoryMovementSortColumns = {
  createdAt: inventoryLedger.createdAt,
  transactionType: inventoryLedger.transactionType,
  quantityChange: inventoryLedger.quantityChange,
} as const;

const locationSortColumns = {
  name: locations.name,
  type: locations.type,
  createdAt: locations.createdAt,
} as const;

const machineSortColumns = {
  name: machines.name,
  type: machines.type,
  status: machines.status,
  createdAt: machines.createdAt,
} as const;

type ItemUpdateData = PartialUpdate<
  Omit<typeof itemMaster.$inferInsert, "id" | "createdBy" | "createdAt">
>;

type ServiceUpdateData = PartialUpdate<
  Omit<typeof serviceMaster.$inferInsert, "id" | "createdBy" | "createdAt">
>;

type LocationUpdateData = PartialUpdate<
  Omit<typeof locations.$inferInsert, "id" | "createdAt">
>;

type MachineUpdateData = PartialUpdate<
  Omit<typeof machines.$inferInsert, "id" | "createdBy" | "createdAt">
>;

function toStartOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function toNextDayStart(date: Date) {
  const normalized = toStartOfDay(date);
  normalized.setDate(normalized.getDate() + 1);
  return normalized;
}

export const assetRepository = {
  async listItems(params: assetItemListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in itemSortColumns
        ? itemSortColumns[params.sortBy as keyof typeof itemSortColumns]
        : itemMaster.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? `%${q}%` : undefined;

    const whereClause = pattern
      ? or(
          ilike(itemMaster.name, pattern),
          ilike(itemMaster.sku, pattern),
          ilike(itemMaster.category, pattern),
        )
      : undefined;

    const [rows, [totalRow]] = whereClause
      ? await Promise.all([
          db
            .select(itemColumns)
            .from(itemMaster)
            .where(whereClause)
            .orderBy(orderFn(sortColumn), asc(itemMaster.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(itemMaster).where(whereClause),
        ])
      : await Promise.all([
          db
            .select(itemColumns)
            .from(itemMaster)
            .orderBy(orderFn(sortColumn), asc(itemMaster.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(itemMaster),
        ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async createItem(input: assetItemCreateSchemaType, actorId: number) {
    const [created] = await db
      .insert(itemMaster)
      .values({
        ...input,
        createdBy: actorId,
      })
      .returning(itemColumns);

    return created;
  },

  async updateItem(id: number, data: ItemUpdateData) {
    const [updated] = await db
      .update(itemMaster)
      .set(data)
      .where(eq(itemMaster.id, id))
      .returning(itemColumns);

    return updated;
  },

  // Fallback chain for "what should this line cost": most recent PO price
  // paid to this supplier for this item, then the supplier's catalog price,
  // then the item master's average cost (the PR estimate). Returns
  // undefined only if none of the three exist.
  async getLastRate(itemId: number, supplierId: number) {
    const [poHistoryRow] = await db
      .select({ ratePaise: purchaseOrderItems.unitPricePaise })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.poId))
      .where(
        and(
          eq(purchaseOrders.supplierId, supplierId),
          eq(purchaseOrderItems.itemId, itemId),
        ),
      )
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(1);

    if (poHistoryRow) {
      return {
        ratePaise: poHistoryRow.ratePaise,
        source: "po_history" as const,
      };
    }

    const [supplierCatalogRow] = await db
      .select({ ratePaise: supplierItems.supplierUnitPricePaise })
      .from(supplierItems)
      .where(
        and(
          eq(supplierItems.supplierId, supplierId),
          eq(supplierItems.itemId, itemId),
        ),
      )
      .limit(1);

    if (supplierCatalogRow) {
      return {
        ratePaise: supplierCatalogRow.ratePaise,
        source: "supplier_catalog" as const,
      };
    }

    const [itemRow] = await db
      .select({ ratePaise: itemMaster.averageCostPaise })
      .from(itemMaster)
      .where(eq(itemMaster.id, itemId))
      .limit(1);

    if (itemRow) {
      return { ratePaise: itemRow.ratePaise, source: "pr_estimate" as const };
    }

    return undefined;
  },

  async listServices(params: assetServiceListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in serviceSortColumns
        ? serviceSortColumns[params.sortBy as keyof typeof serviceSortColumns]
        : serviceMaster.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? `%${q}%` : undefined;

    const whereClause = pattern
      ? or(
          ilike(serviceMaster.name, pattern),
          ilike(serviceMaster.code, pattern),
        )
      : undefined;

    const [rows, [totalRow]] = whereClause
      ? await Promise.all([
          db
            .select(serviceColumns)
            .from(serviceMaster)
            .where(whereClause)
            .orderBy(orderFn(sortColumn), asc(serviceMaster.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(serviceMaster).where(whereClause),
        ])
      : await Promise.all([
          db
            .select(serviceColumns)
            .from(serviceMaster)
            .orderBy(orderFn(sortColumn), asc(serviceMaster.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(serviceMaster),
        ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async createService(input: assetServiceCreateSchemaType, actorId: number) {
    const [created] = await db
      .insert(serviceMaster)
      .values({
        ...input,
        createdBy: actorId,
        lastUpdatedBy: actorId,
      })
      .returning(serviceColumns);

    return created;
  },

  async updateService(id: number, data: ServiceUpdateData) {
    const [updated] = await db
      .update(serviceMaster)
      .set(data)
      .where(eq(serviceMaster.id, id))
      .returning(serviceColumns);

    return updated;
  },

  async listInventoryMovements(
    params: assetInventoryMovementListQuerySchemaType,
  ) {
    const sortColumn =
      params.sortBy && params.sortBy in inventoryMovementSortColumns
        ? inventoryMovementSortColumns[
            params.sortBy as keyof typeof inventoryMovementSortColumns
          ]
        : inventoryLedger.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const whereClause = and(
      params.itemId !== undefined
        ? eq(inventoryLedger.itemId, params.itemId)
        : undefined,
      params.locationId !== undefined
        ? eq(inventoryLedger.locationId, params.locationId)
        : undefined,
      params.referenceType !== undefined
        ? eq(inventoryLedger.referenceType, params.referenceType)
        : undefined,
      params.transactionType !== undefined
        ? eq(inventoryLedger.transactionType, params.transactionType)
        : undefined,
      params.fromDate !== undefined
        ? gte(inventoryLedger.createdAt, toStartOfDay(params.fromDate))
        : undefined,
      params.toDate !== undefined
        ? lt(inventoryLedger.createdAt, toNextDayStart(params.toDate))
        : undefined,
    );

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(inventoryMovementColumns)
        .from(inventoryLedger)
        .innerJoin(itemMaster, eq(itemMaster.id, inventoryLedger.itemId))
        .innerJoin(locations, eq(locations.id, inventoryLedger.locationId))
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(inventoryLedger.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(inventoryLedger).where(whereClause),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async listLocations(params: assetLocationListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in locationSortColumns
        ? locationSortColumns[params.sortBy as keyof typeof locationSortColumns]
        : locations.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? `%${q}%` : undefined;

    const whereClause = pattern
      ? or(ilike(locations.name, pattern), ilike(locations.type, pattern))
      : undefined;

    const [rows, [totalRow]] = whereClause
      ? await Promise.all([
          db
            .select(locationColumns)
            .from(locations)
            .where(whereClause)
            .orderBy(orderFn(sortColumn), asc(locations.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(locations).where(whereClause),
        ])
      : await Promise.all([
          db
            .select(locationColumns)
            .from(locations)
            .orderBy(orderFn(sortColumn), asc(locations.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(locations),
        ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async createLocation(input: assetLocationCreateSchemaType) {
    const [created] = await db
      .insert(locations)
      .values(input)
      .returning(locationColumns);
    return created;
  },

  async updateLocation(id: number, data: LocationUpdateData) {
    const [updated] = await db
      .update(locations)
      .set(data)
      .where(eq(locations.id, id))
      .returning(locationColumns);

    return updated;
  },

  async createInventoryMovement(
    input: assetInventoryMovementCreateSchemaType,
    actorId: number,
  ) {
    // ponytail: row-locks the last movement for this item+location so two
    // concurrent movements can't both read the same balanceAfter (lost
    // update). Doesn't lock a brand-new item+location pair with zero prior
    // rows — real fix for that edge is a dedicated running-balance row with
    // a unique constraint per item+location, not done here.
    return db.transaction(async (tx) => {
      const [lastRow] = await tx
        .select({ balanceAfter: inventoryLedger.balanceAfter })
        .from(inventoryLedger)
        .where(
          and(
            eq(inventoryLedger.itemId, input.itemId),
            eq(inventoryLedger.locationId, input.locationId),
          ),
        )
        .orderBy(desc(inventoryLedger.createdAt), desc(inventoryLedger.id))
        .limit(1)
        .for("update");

      const previousBalance = lastRow?.balanceAfter ?? 0;
      const balanceAfter = previousBalance + input.quantityChange;

      const [created] = await tx
        .insert(inventoryLedger)
        .values({
          itemId: input.itemId,
          locationId: input.locationId,
          batchNumber: input.batchNumber ?? null,
          transactionType: input.transactionType,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          quantityChange: input.quantityChange,
          balanceAfter,
          unitCostPaise: input.unitCostPaise,
          totalValueChangePaise: Math.round(
            input.quantityChange * input.unitCostPaise,
          ),
          notes: input.notes ?? null,
          createdBy: actorId,
        })
        .returning(inventoryMovementWriteColumns);

      return created;
    });
  },

  async listMachines(params: assetMachineListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in machineSortColumns
        ? machineSortColumns[params.sortBy as keyof typeof machineSortColumns]
        : machines.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? `%${q}%` : undefined;

    const whereClause = and(
      pattern
        ? or(ilike(machines.name, pattern), ilike(machines.type, pattern))
        : undefined,
      params.status ? eq(machines.status, params.status) : undefined,
    );

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(machineColumns)
        .from(machines)
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(machines.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(machines).where(whereClause),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async createMachine(input: assetMachineCreateSchemaType, actorId: number) {
    const [created] = await db
      .insert(machines)
      .values({
        name: input.name,
        type: input.type ?? null,
        status: input.status ?? "idle",
        lastMaintenanceAt: input.lastMaintenanceAt ?? null,
        createdBy: actorId,
        lastUpdatedBy: actorId,
      })
      .returning(machineColumns);

    return created;
  },

  async updateMachine(id: number, data: MachineUpdateData) {
    const [updated] = await db
      .update(machines)
      .set(data)
      .where(eq(machines.id, id))
      .returning(machineColumns);

    return updated;
  },
};
