import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../db/client";
import {
  itemMaster,
  serviceMaster,
  supplierHistory,
  supplierItems,
  supplierMaster,
  supplierServices,
} from "../db/schemas/02_procurement";
import { employees } from "../db/schemas/03_hcm";
import { AppError } from "../lib/errors";
import type { PartialUpdate } from "../lib/types";
import type {
  supplierHistoryQuerySchemaType,
  supplierItemCreateSchemaType,
  supplierItemListQuerySchemaType,
  supplierItemLookupQuerySchemaType,
  supplierListQuerySchemaType,
  supplierServiceCreateSchemaType,
  supplierServiceListQuerySchemaType,
} from "../types/supplier.types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export type SupplierHistoryInsert = {
  supplierId: number;
  entity: "supplier" | "item" | "service";
  entityId: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: number;
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const supplierColumns = getTableColumns(supplierMaster);

const supplierItemColumns = getTableColumns(supplierItems);

const supplierServiceColumns = getTableColumns(supplierServices);

type SupplierCreateData = Omit<
  typeof supplierMaster.$inferInsert,
  "id" | "createdBy" | "createdAt"
>;

type SupplierMasterUpdateData = PartialUpdate<
  Omit<typeof supplierMaster.$inferInsert, "id" | "createdBy" | "createdAt">
>;

type SupplierItemCreateData = supplierItemCreateSchemaType;

type SupplierItemCreateBatchData = supplierItemCreateSchemaType;

type SupplierServiceCreateData = supplierServiceCreateSchemaType;

type SupplierItemUpdateData = PartialUpdate<
  Omit<
    typeof supplierItems.$inferInsert,
    "id" | "supplierId" | "itemId" | "createdBy" | "createdAt"
  >
>;

type SupplierItemEditData = SupplierItemUpdateData;

type SupplierServiceEditData = PartialUpdate<
  Omit<
    typeof supplierServices.$inferInsert,
    "id" | "supplierId" | "serviceId" | "createdBy" | "createdAt"
  >
>;

const supplierSortColumns = {
  name: supplierMaster.name,
  type: supplierMaster.type,
  contactPerson: supplierMaster.contactPerson,
  isActive: supplierMaster.isActive,
  createdAt: supplierMaster.createdAt,
} as const;

const itemLookupColumns = {
  itemId: itemMaster.id,
  itemName: itemMaster.name,
  uom: itemMaster.uom,
  sku: itemMaster.sku,
};

const supplierDetailItemColumns = {
  id: supplierItems.id,
  supplierId: supplierItems.supplierId,
  itemId: supplierItems.itemId,
  itemName: itemMaster.name,
  sku: itemMaster.sku,
  uom: itemMaster.uom,
  supplierSku: supplierItems.supplierSku,
  supplierUnitPricePaise: supplierItems.supplierUnitPricePaise,
  taxPercentage: supplierItems.taxPercentage,
  leadTimeDays: supplierItems.leadTimeDays,
  qty: supplierItems.qty,
  isActive: supplierItems.isActive,
  createdBy: supplierItems.createdBy,
  createdAt: supplierItems.createdAt,
  lastUpdatedBy: supplierItems.lastUpdatedBy,
  lastUpdatedAt: supplierItems.lastUpdatedAt,
};

const supplierDetailServiceColumns = {
  id: supplierServices.id,
  supplierId: supplierServices.supplierId,
  serviceId: supplierServices.serviceId,
  serviceCode: serviceMaster.code,
  serviceName: serviceMaster.name,
  serviceUnitPricePaise: supplierServices.serviceUnitPricePaise,
  taxPercentage: supplierServices.taxPercentage,
  leadTimeDays: supplierServices.leadTimeDays,
  isActive: supplierServices.isActive,
  createdBy: supplierServices.createdBy,
  createdAt: supplierServices.createdAt,
  lastUpdatedBy: supplierServices.lastUpdatedBy,
  lastUpdatedAt: supplierServices.lastUpdatedAt,
};

export const supplierRepository = {
  async list(params: supplierListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in supplierSortColumns
        ? supplierSortColumns[params.sortBy as keyof typeof supplierSortColumns]
        : supplierMaster.name; // BR-SUP-23: sorted by name unless chosen
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? `%${escapeLike(q)}%` : undefined;

    const searchClause = pattern
      ? or(
          ilike(supplierMaster.name, pattern),
          ilike(supplierMaster.contactPerson, pattern),
          ilike(supplierMaster.email, pattern),
          ilike(supplierMaster.phone, pattern),
          ilike(supplierMaster.gstNumber, pattern),
          exists(
            db
              .select({ id: supplierItems.id })
              .from(supplierItems)
              .innerJoin(itemMaster, eq(itemMaster.id, supplierItems.itemId))
              .where(
                and(
                  eq(supplierItems.supplierId, supplierMaster.id),
                  ilike(itemMaster.sku, pattern),
                ),
              ),
          ),
        )
      : undefined;
    const statusClause =
      params.status === "active"
        ? eq(supplierMaster.isActive, true)
        : params.status === "inactive"
          ? eq(supplierMaster.isActive, false)
          : undefined;
    const whereClause = and(searchClause, statusClause);

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(supplierColumns)
        .from(supplierMaster)
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(supplierMaster.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(supplierMaster).where(whereClause),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async findExistingItemIds(itemIds: number[], activeOnly = false) {
    const rows = await db
      .select({ id: itemMaster.id })
      .from(itemMaster)
      .where(
        activeOnly
          ? and(inArray(itemMaster.id, itemIds), eq(itemMaster.isActive, true))
          : inArray(itemMaster.id, itemIds),
      );
    return new Set(rows.map((row) => row.id));
  },

  async findExistingServiceIds(serviceIds: number[]) {
    const rows = await db
      .select({ id: serviceMaster.id })
      .from(serviceMaster)
      .where(inArray(serviceMaster.id, serviceIds));
    return new Set(rows.map((row) => row.id));
  },

  async listItems(params: supplierItemLookupQuerySchemaType) {
    const q = params.q?.trim();
    const pattern = q ? `%${q}%` : undefined;

    const whereClause = pattern
      ? or(ilike(itemMaster.name, pattern), ilike(itemMaster.sku, pattern))
      : undefined;

    const [rows, [totalRow]] = whereClause
      ? await Promise.all([
          db
            .select(itemLookupColumns)
            .from(itemMaster)
            .where(whereClause)
            .orderBy(asc(itemMaster.name), asc(itemMaster.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(itemMaster).where(whereClause),
        ])
      : await Promise.all([
          db
            .select(itemLookupColumns)
            .from(itemMaster)
            .orderBy(asc(itemMaster.name), asc(itemMaster.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(itemMaster),
        ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async listSupplierItems(
    supplierId: number,
    params: supplierItemListQuerySchemaType,
  ) {
    const q = params.q?.trim();
    const pattern = q ? `%${q}%` : undefined;

    const whereClause = and(
      eq(supplierItems.supplierId, supplierId),
      pattern
        ? or(
            ilike(itemMaster.name, pattern),
            ilike(itemMaster.sku, pattern),
            ilike(supplierItems.supplierSku, pattern),
          )
        : undefined,
    );

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(supplierDetailItemColumns)
        .from(supplierItems)
        .innerJoin(itemMaster, eq(itemMaster.id, supplierItems.itemId))
        .where(whereClause)
        .orderBy(asc(supplierItems.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      pattern
        ? db
            .select({ value: count() })
            .from(supplierItems)
            .innerJoin(itemMaster, eq(itemMaster.id, supplierItems.itemId))
            .where(whereClause)
        : db
            .select({ value: count() })
            .from(supplierItems)
            .where(eq(supplierItems.supplierId, supplierId)),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async listSupplierServices(
    supplierId: number,
    params: supplierServiceListQuerySchemaType,
  ) {
    const q = params.q?.trim();
    const pattern = q ? `%${q}%` : undefined;

    const whereClause = and(
      eq(supplierServices.supplierId, supplierId),
      pattern
        ? or(
            ilike(serviceMaster.name, pattern),
            ilike(serviceMaster.code, pattern),
          )
        : undefined,
    );

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(supplierDetailServiceColumns)
        .from(supplierServices)
        .innerJoin(
          serviceMaster,
          eq(serviceMaster.id, supplierServices.serviceId),
        )
        .where(whereClause)
        .orderBy(asc(supplierServices.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      pattern
        ? db
            .select({ value: count() })
            .from(supplierServices)
            .innerJoin(
              serviceMaster,
              eq(serviceMaster.id, supplierServices.serviceId),
            )
            .where(whereClause)
        : db
            .select({ value: count() })
            .from(supplierServices)
            .where(eq(supplierServices.supplierId, supplierId)),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async findSupplierDetailById(supplierId: number) {
    const [supplier] = await db
      .select(supplierColumns)
      .from(supplierMaster)
      .where(eq(supplierMaster.id, supplierId))
      .limit(1);

    if (!supplier) {
      return undefined;
    }

    const [[itemCountRow], [serviceCountRow]] = await Promise.all([
      db
        .select({ value: count() })
        .from(supplierItems)
        .where(eq(supplierItems.supplierId, supplierId)),
      db
        .select({ value: count() })
        .from(supplierServices)
        .where(eq(supplierServices.supplierId, supplierId)),
    ]);

    return {
      supplier,
      itemCount: itemCountRow?.value ?? 0,
      serviceCount: serviceCountRow?.value ?? 0,
    };
  },

  async findSupplierById(supplierId: number) {
    const [supplier] = await db
      .select({ id: supplierMaster.id })
      .from(supplierMaster)
      .where(eq(supplierMaster.id, supplierId))
      .limit(1);
    return supplier;
  },

  async create(
    supplierData: SupplierCreateData,
    supplierItemData: SupplierItemCreateData[],
    actorId: number,
  ) {
    return db.transaction(async (tx) => {
      const [supplier] = await tx
        .insert(supplierMaster)
        .values({
          ...supplierData,
          createdBy: actorId,
        })
        .returning(supplierColumns);

      if (!supplier) {
        throw new AppError(
          "Failed to create supplier",
          500,
          "SUPPLIER_CREATE_FAILED",
        );
      }

      const createdSupplierItems =
        supplierItemData.length > 0
          ? await tx
              .insert(supplierItems)
              .values(
                supplierItemData.map((item) => ({
                  ...item,
                  supplierId: supplier.id,
                  createdBy: actorId,
                  lastUpdatedBy: actorId,
                })),
              )
              .returning(supplierItemColumns)
          : [];

      return {
        supplier,
        supplierItems: createdSupplierItems,
      };
    });
  },

  async updateMaster(
    id: number,
    data: SupplierMasterUpdateData,
    ex: Executor = db,
  ) {
    const [row] = await ex
      .update(supplierMaster)
      .set(data)
      .where(eq(supplierMaster.id, id))
      .returning(supplierColumns);
    return row;
  },

  async updateItemBySupplierItemsId(
    supplierId: number,
    supplierItemsId: number,
    data: SupplierItemUpdateData,
  ) {
    const [row] = await db
      .update(supplierItems)
      .set(data)
      .where(
        and(
          eq(supplierItems.supplierId, supplierId),
          eq(supplierItems.id, supplierItemsId),
        ),
      )
      .returning(supplierItemColumns);
    return row;
  },

  async updateItemByItemId(
    supplierId: number,
    itemId: number,
    data: SupplierItemUpdateData,
  ) {
    const [row] = await db
      .update(supplierItems)
      .set(data)
      .where(
        and(
          eq(supplierItems.supplierId, supplierId),
          eq(supplierItems.itemId, itemId),
        ),
      )
      .returning(supplierItemColumns);
    return row;
  },

  async createSupplierItems(
    supplierId: number,
    rows: SupplierItemCreateBatchData[],
    actorId: number,
  ) {
    const created = await db
      .insert(supplierItems)
      .values(
        rows.map((row) => ({
          ...row,
          supplierId,
          createdBy: actorId,
          lastUpdatedBy: actorId,
        })),
      )
      .returning(supplierItemColumns);

    return created;
  },

  async editSupplierItemBySupplierItemsId(
    supplierId: number,
    supplierItemsId: number,
    data: SupplierItemEditData,
  ) {
    const [row] = await db
      .update(supplierItems)
      .set(data)
      .where(
        and(
          eq(supplierItems.supplierId, supplierId),
          eq(supplierItems.id, supplierItemsId),
        ),
      )
      .returning(supplierItemColumns);

    return row;
  },

  async editSupplierItemByItemId(
    supplierId: number,
    itemId: number,
    data: SupplierItemEditData,
  ) {
    const [row] = await db
      .update(supplierItems)
      .set(data)
      .where(
        and(
          eq(supplierItems.supplierId, supplierId),
          eq(supplierItems.itemId, itemId),
        ),
      )
      .returning(supplierItemColumns);

    return row;
  },

  async createSupplierServices(
    supplierId: number,
    rows: SupplierServiceCreateData[],
    actorId: number,
  ) {
    const created = await db
      .insert(supplierServices)
      .values(
        rows.map((row) => ({
          ...row,
          supplierId,
          createdBy: actorId,
          lastUpdatedBy: actorId,
        })),
      )
      .returning(supplierServiceColumns);

    return created;
  },

  async editSupplierServiceBySupplierServiceId(
    supplierId: number,
    supplierServiceId: number,
    data: SupplierServiceEditData,
  ) {
    const [row] = await db
      .update(supplierServices)
      .set(data)
      .where(
        and(
          eq(supplierServices.supplierId, supplierId),
          eq(supplierServices.id, supplierServiceId),
        ),
      )
      .returning(supplierServiceColumns);

    return row;
  },

  async editSupplierServiceByServiceId(
    supplierId: number,
    serviceId: number,
    data: SupplierServiceEditData,
  ) {
    const [row] = await db
      .update(supplierServices)
      .set(data)
      .where(
        and(
          eq(supplierServices.supplierId, supplierId),
          eq(supplierServices.serviceId, serviceId),
        ),
      )
      .returning(supplierServiceColumns);

    return row;
  },

  async transaction<T>(fn: (tx: Tx) => Promise<T>) {
    return db.transaction(fn);
  },

  async findMasterForUpdate(id: number, ex: Executor = db) {
    const [row] = await ex
      .select(supplierColumns)
      .from(supplierMaster)
      .where(eq(supplierMaster.id, id))
      .for("update")
      .limit(1);
    return row;
  },

  async insertHistory(rows: SupplierHistoryInsert[], ex: Executor = db) {
    if (rows.length === 0) return;
    await ex.insert(supplierHistory).values(rows);
  },

  // Price-list row of this supplier by row id or item id, with the item's own unit (BR-SUP-14).
  async findItemRow(
    supplierId: number,
    selector: {
      supplierItemsId?: number | undefined;
      itemId?: number | undefined;
    },
    ex: Executor = db,
  ) {
    const [row] = await ex
      .select({ ...supplierItemColumns, itemUom: itemMaster.uom })
      .from(supplierItems)
      .innerJoin(itemMaster, eq(itemMaster.id, supplierItems.itemId))
      .where(
        and(
          eq(supplierItems.supplierId, supplierId),
          selector.supplierItemsId !== undefined
            ? eq(supplierItems.id, selector.supplierItemsId)
            : eq(supplierItems.itemId, selector.itemId ?? -1),
        ),
      )
      .for("update", { of: supplierItems })
      .limit(1);
    return row;
  },

  async findServiceRow(
    supplierId: number,
    selector: {
      supplierServiceId?: number | undefined;
      serviceId?: number | undefined;
    },
    ex: Executor = db,
  ) {
    const [row] = await ex
      .select(supplierServiceColumns)
      .from(supplierServices)
      .where(
        and(
          eq(supplierServices.supplierId, supplierId),
          selector.supplierServiceId !== undefined
            ? eq(supplierServices.id, selector.supplierServiceId)
            : eq(supplierServices.serviceId, selector.serviceId ?? -1),
        ),
      )
      .for("update")
      .limit(1);
    return row;
  },

  async updateItemRow(
    rowId: number,
    data: SupplierItemEditData,
    ex: Executor = db,
  ) {
    const [row] = await ex
      .update(supplierItems)
      .set(data)
      .where(eq(supplierItems.id, rowId))
      .returning(supplierItemColumns);
    return row;
  },

  async updateServiceRow(
    rowId: number,
    data: SupplierServiceEditData,
    ex: Executor = db,
  ) {
    const [row] = await ex
      .update(supplierServices)
      .set(data)
      .where(eq(supplierServices.id, rowId))
      .returning(supplierServiceColumns);
    return row;
  },

  async findItemUoms(itemIds: number[]) {
    const rows = await db
      .select({ id: itemMaster.id, uom: itemMaster.uom })
      .from(itemMaster)
      .where(inArray(itemMaster.id, itemIds));
    return new Map(rows.map((row) => [row.id, row.uom]));
  },

  async listHistory(
    supplierId: number,
    params: supplierHistoryQuerySchemaType,
  ) {
    const whereClause = and(
      eq(supplierHistory.supplierId, supplierId),
      params.entity ? eq(supplierHistory.entity, params.entity) : undefined,
    );
    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          ...getTableColumns(supplierHistory),
          changedByName: employees.name,
          entityLabel: sql<
            string | null
          >`coalesce(${itemMaster.sku}, ${serviceMaster.code})`,
        })
        .from(supplierHistory)
        .leftJoin(employees, eq(employees.id, supplierHistory.changedBy))
        .leftJoin(
          supplierItems,
          and(
            eq(supplierHistory.entity, "item"),
            eq(supplierItems.id, supplierHistory.entityId),
          ),
        )
        .leftJoin(itemMaster, eq(itemMaster.id, supplierItems.itemId))
        .leftJoin(
          supplierServices,
          and(
            eq(supplierHistory.entity, "service"),
            eq(supplierServices.id, supplierHistory.entityId),
          ),
        )
        .leftJoin(
          serviceMaster,
          eq(serviceMaster.id, supplierServices.serviceId),
        )
        .where(whereClause)
        .orderBy(desc(supplierHistory.changedAt), desc(supplierHistory.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(supplierHistory).where(whereClause),
    ]);
    return { rows, total: totalRow?.value ?? 0 };
  },
};
