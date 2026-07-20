import { and, asc, count, desc, eq, gte, ilike, lt, or } from "drizzle-orm";

import { db } from "../db/client";
import {
  inventoryLedger,
  itemMaster,
  locations,
  machines,
  serviceMaster,
} from "../db/schemas/02_procurement";
import type {
  assetInventoryMovementCreateSchemaType,
  assetInventoryMovementListQuerySchemaType,
  assetItemCreateSchemaType,
  assetItemListQuerySchemaType,
  assetItemUpdateSchemaType,
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

const itemColumns = {
  id: itemMaster.id,
  sku: itemMaster.sku,
  name: itemMaster.name,
  description: itemMaster.description,
  category: itemMaster.category,
  uom: itemMaster.uom,
  reorderLevel: itemMaster.reorderLevel,
  currentStock: itemMaster.currentStock,
  averageCostPaise: itemMaster.averageCostPaise,
  isActive: itemMaster.isActive,
  createdBy: itemMaster.createdBy,
  createdAt: itemMaster.createdAt,
};

const serviceColumns = {
  id: serviceMaster.id,
  code: serviceMaster.code,
  name: serviceMaster.name,
  description: serviceMaster.description,
  sacCode: serviceMaster.sacCode,
  defaultUom: serviceMaster.defaultUom,
  isActive: serviceMaster.isActive,
  createdBy: serviceMaster.createdBy,
  createdAt: serviceMaster.createdAt,
  lastUpdatedBy: serviceMaster.lastUpdatedBy,
  lastUpdatedAt: serviceMaster.lastUpdatedAt,
};

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

const locationColumns = {
  id: locations.id,
  name: locations.name,
  type: locations.type,
  isVirtual: locations.isVirtual,
  linkedVendorId: locations.linkedVendorId,
  createdAt: locations.createdAt,
};

const machineColumns = {
  id: machines.id,
  name: machines.name,
  type: machines.type,
  status: machines.status,
  lastMaintenanceAt: machines.lastMaintenanceAt,
  createdBy: machines.createdBy,
  createdAt: machines.createdAt,
  lastUpdatedBy: machines.lastUpdatedBy,
  lastUpdatedAt: machines.lastUpdatedAt,
};

type ItemUpdateData = {
  sku?: string | undefined;
  name?: string | undefined;
  description?: string | null | undefined;
  category?: string | undefined;
  uom?: string | undefined;
  reorderLevel?: number | undefined;
  currentStock?: number | undefined;
  averageCostPaise?: number | null | undefined;
  isActive?: boolean | undefined;
};

type ServiceUpdateData = {
  code?: string | undefined;
  name?: string | undefined;
  description?: string | null | undefined;
  sacCode?: string | null | undefined;
  defaultUom?: string | undefined;
  isActive?: boolean | undefined;
  lastUpdatedBy?: number | undefined;
  lastUpdatedAt?: Date | undefined;
};

type LocationUpdateData = {
  name?: string | undefined;
  type?:
    | "main_store"
    | "vendor_premise"
    | "finished_goods"
    | "scrap_yard"
    | undefined;
  isVirtual?: boolean | undefined;
  linkedVendorId?: number | null | undefined;
};

type MachineUpdateData = {
  name?: string | undefined;
  type?: string | null | undefined;
  status?: "idle" | "running" | "maintenance" | "breakdown" | undefined;
  lastMaintenanceAt?: Date | null | undefined;
  lastUpdatedBy?: number | undefined;
  lastUpdatedAt?: Date | undefined;
};

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
            .orderBy(asc(itemMaster.name), asc(itemMaster.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(itemMaster).where(whereClause),
        ])
      : await Promise.all([
          db
            .select(itemColumns)
            .from(itemMaster)
            .orderBy(asc(itemMaster.name), asc(itemMaster.id))
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

  async listServices(params: assetServiceListQuerySchemaType) {
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
            .orderBy(asc(serviceMaster.name), asc(serviceMaster.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(serviceMaster).where(whereClause),
        ])
      : await Promise.all([
          db
            .select(serviceColumns)
            .from(serviceMaster)
            .orderBy(asc(serviceMaster.name), asc(serviceMaster.id))
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
        .orderBy(desc(inventoryLedger.createdAt), desc(inventoryLedger.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(inventoryLedger).where(whereClause),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async listLocations(params: assetLocationListQuerySchemaType) {
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
            .orderBy(asc(locations.name), asc(locations.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(locations).where(whereClause),
        ])
      : await Promise.all([
          db
            .select(locationColumns)
            .from(locations)
            .orderBy(asc(locations.name), asc(locations.id))
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
    const [lastRow] = await db
      .select({ balanceAfter: inventoryLedger.balanceAfter })
      .from(inventoryLedger)
      .where(
        and(
          eq(inventoryLedger.itemId, input.itemId),
          eq(inventoryLedger.locationId, input.locationId),
        ),
      )
      .orderBy(desc(inventoryLedger.createdAt), desc(inventoryLedger.id))
      .limit(1);

    const previousBalance = lastRow?.balanceAfter ?? 0;
    const balanceAfter = previousBalance + input.quantityChange;

    const [created] = await db
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
  },

  async listMachines(params: assetMachineListQuerySchemaType) {
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
        .orderBy(asc(machines.name), asc(machines.id))
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
