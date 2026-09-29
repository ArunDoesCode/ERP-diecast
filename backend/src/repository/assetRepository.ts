import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db/client";
import {
  grns,
  inventoryLedger,
  itemMaster,
  locations,
  machines,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  serviceMaster,
  supplierItems,
  supplierMaster,
} from "../db/schemas/02_procurement";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import type { PartialUpdate } from "../lib/types";
import type {
  assetInventoryMovementListQuerySchemaType,
  assetItemCreateSchemaType,
  assetItemListQuerySchemaType,
  assetLocationCreateSchemaType,
  assetLocationListQuerySchemaType,
  assetMachineCreateSchemaType,
  assetMachineListQuerySchemaType,
  assetManualMovementCreateSchemaType,
  assetReconciliationQuerySchemaType,
  assetServiceCreateSchemaType,
  assetServiceListQuerySchemaType,
  assetStockListQuerySchemaType,
} from "../types/asset.types";
import { postStock } from "./stockPostingRepository";

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
  referenceLineId: inventoryLedger.referenceLineId,
  sourceNumber: grns.grnNumber,
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
  code: machines.code,
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

// SEC-20: escape LIKE wildcards in user search text (Postgres default escape is \).
function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// BR-INV-04: any ledger row, PR line, PO line or supplier-item line.
async function itemInUse(tx: Tx, itemId: number) {
  const [row] = await tx.execute<{ used: boolean }>(sql`
    select (
      exists (select 1 from ${inventoryLedger} where ${inventoryLedger.itemId} = ${itemId})
      or exists (select 1 from ${purchaseRequestItems} where ${purchaseRequestItems.itemId} = ${itemId})
      or exists (select 1 from ${purchaseOrderItems} where ${purchaseOrderItems.itemId} = ${itemId})
      or exists (select 1 from ${supplierItems} where ${supplierItems.itemId} = ${itemId})
    ) as used`);
  return row?.used === true;
}

export const assetRepository = {
  async listItems(params: assetItemListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in itemSortColumns
        ? itemSortColumns[params.sortBy as keyof typeof itemSortColumns]
        : itemMaster.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? likePattern(q) : undefined;

    const whereClause = and(
      pattern
        ? or(
            ilike(itemMaster.name, pattern),
            ilike(itemMaster.sku, pattern),
            ilike(itemMaster.category, pattern),
          )
        : undefined,
      params.isActive !== undefined
        ? eq(itemMaster.isActive, params.isActive)
        : undefined,
      params.category ? eq(itemMaster.category, params.category) : undefined,
    );

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(itemColumns)
        .from(itemMaster)
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(itemMaster.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(itemMaster).where(whereClause),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async createItem(input: assetItemCreateSchemaType, actorId: number) {
    const [created] = await db
      .insert(itemMaster)
      .values({
        ...input,
        createdBy: actorId,
        lastUpdatedBy: actorId,
      })
      .returning(itemColumns);

    return created;
  },

  async findItemById(id: number) {
    const [row] = await db
      .select({ id: itemMaster.id, sku: itemMaster.sku, uom: itemMaster.uom })
      .from(itemMaster)
      .where(eq(itemMaster.id, id))
      .limit(1);
    return row;
  },

  // BR-INV-04 (CR-24): the in-use check and the update run in one transaction
  // with the item row locked, so a first posting can't slip in between.
  // `decide` gets the current row and returns the columns to write.
  async updateItemLocked(
    id: number,
    decide: (
      current: {
        sku: string;
        uom: string;
        reorderLevel: number;
      },
      isInUse: () => Promise<boolean>,
    ) => ItemUpdateData | Promise<ItemUpdateData>,
  ) {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          sku: itemMaster.sku,
          uom: itemMaster.uom,
          reorderLevel: itemMaster.reorderLevel,
        })
        .from(itemMaster)
        .where(eq(itemMaster.id, id))
        .limit(1)
        .for("update");
      if (!current) {
        return undefined;
      }
      const data = await decide(current, () => itemInUse(tx, id));
      const [updated] = await tx
        .update(itemMaster)
        .set(data)
        .where(eq(itemMaster.id, id))
        .returning(itemColumns);
      return updated;
    });
  },

  async updateItem(id: number, data: ItemUpdateData) {
    const [updated] = await db
      .update(itemMaster)
      .set(data)
      .where(eq(itemMaster.id, id))
      .returning(itemColumns);

    return updated;
  },

  // BR-INV-24 fallback chain: newest line of an approved-or-later PO for this
  // supplier+item; else the supplier's catalog price; else the item average
  // cost if > 0; else the item's standard rate. Undefined only for an unknown item.
  async getLastRate(itemId: number, supplierId: number) {
    const [poHistoryRow] = await db
      .select({ ratePaise: purchaseOrderItems.unitPricePaise })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.poId))
      .where(
        and(
          eq(purchaseOrders.supplierId, supplierId),
          eq(purchaseOrderItems.itemId, itemId),
          sql`${purchaseOrderItems.unitPricePaise} > 0`,
          inArray(purchaseOrders.status, [
            "approved",
            "dispatched",
            "partial_received",
            "fully_received",
            "invoiced",
            "closed",
          ]),
        ),
      )
      .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrderItems.id))
      .limit(1);

    if (poHistoryRow && poHistoryRow.ratePaise > 0) {
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

    if (supplierCatalogRow && supplierCatalogRow.ratePaise > 0) {
      return {
        ratePaise: supplierCatalogRow.ratePaise,
        source: "supplier_catalog" as const,
      };
    }

    const [itemRow] = await db
      .select({
        averageCostPaise: itemMaster.averageCostPaise,
        standardRatePaise: itemMaster.standardRatePaise,
      })
      .from(itemMaster)
      .where(eq(itemMaster.id, itemId))
      .limit(1);

    if (!itemRow) {
      return undefined;
    }
    if (itemRow.averageCostPaise > 0) {
      return {
        ratePaise: itemRow.averageCostPaise,
        source: "pr_estimate" as const,
      };
    }
    return {
      // legacy rows may still have 0 (API rejects 0 on write)
      ratePaise: itemRow.standardRatePaise,
      source: "standard_rate" as const,
    };
  },

  async listServices(params: assetServiceListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in serviceSortColumns
        ? serviceSortColumns[params.sortBy as keyof typeof serviceSortColumns]
        : serviceMaster.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? likePattern(q) : undefined;

    const whereClause = and(
      pattern
        ? or(
            ilike(serviceMaster.name, pattern),
            ilike(serviceMaster.code, pattern),
          )
        : undefined,
      params.isActive !== undefined
        ? eq(serviceMaster.isActive, params.isActive)
        : undefined,
    );

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(serviceColumns)
        .from(serviceMaster)
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(serviceMaster.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(serviceMaster).where(whereClause),
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
        .leftJoin(
          grns,
          and(
            eq(grns.id, inventoryLedger.referenceId),
            inArray(inventoryLedger.referenceType, [
              "grn",
              "grn_bypass",
              "grn_correction",
            ]),
          ),
        )
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(inventoryLedger.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(inventoryLedger).where(whereClause),
    ]);

    return {
      rows: rows.map(({ sourceNumber, ...row }) => ({
        ...row,
        sourceDocument: {
          type: row.referenceType,
          id: row.referenceId,
          number: sourceNumber ?? null,
        },
      })),
      total: totalRow?.value ?? 0,
    };
  },

  async listLocations(params: assetLocationListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in locationSortColumns
        ? locationSortColumns[params.sortBy as keyof typeof locationSortColumns]
        : locations.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? likePattern(q) : undefined;

    const whereClause = and(
      pattern
        ? or(
            ilike(locations.name, pattern),
            sql`${locations.type}::text ilike ${pattern}`,
          )
        : undefined,
      params.isActive !== undefined
        ? eq(locations.isActive, params.isActive)
        : undefined,
    );

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(locationColumns)
        .from(locations)
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(locations.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(locations).where(whereClause),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async findLocationById(id: number) {
    const [row] = await db
      .select(locationColumns)
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);
    return row;
  },

  async findSupplierForLocation(supplierId: number) {
    const [row] = await db
      .select({ id: supplierMaster.id, isActive: supplierMaster.isActive })
      .from(supplierMaster)
      .where(eq(supplierMaster.id, supplierId))
      .limit(1);
    return row;
  },

  // Other locations of a type (optionally linked to one supplier).
  async countLocations(
    type: (typeof locations.$inferSelect)["type"],
    opts: {
      excludeId?: number;
      supplierId?: number;
      activeOnly?: boolean;
    } = {},
  ) {
    const [row] = await db
      .select({ value: count() })
      .from(locations)
      .where(
        and(
          eq(locations.type, type),
          opts.excludeId !== undefined
            ? sql`${locations.id} <> ${opts.excludeId}`
            : undefined,
          opts.supplierId !== undefined
            ? eq(locations.linkedVendorId, opts.supplierId)
            : undefined,
          opts.activeOnly ? eq(locations.isActive, true) : undefined,
        ),
      );
    return row?.value ?? 0;
  },

  async locationHasLedgerRows(locationId: number) {
    const [row] = await db
      .select({ id: inventoryLedger.id })
      .from(inventoryLedger)
      .where(eq(inventoryLedger.locationId, locationId))
      .limit(1);
    return row !== undefined;
  },

  async createLocation(input: assetLocationCreateSchemaType, actorId: number) {
    const [created] = await db
      .insert(locations)
      .values({ ...input, createdBy: actorId, lastUpdatedBy: actorId })
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

  // Manual movement (BR-GRN-43/44, BR-INV-21..23): type `adjustment`, reference
  // id 0, posted through postStock in one transaction. The item row is locked
  // before the balance is read, so the stock-take difference is exact.
  async manualMovement(
    input: Extract<
      assetManualMovementCreateSchemaType,
      { referenceType: "stock_adjustment" | "opening_stock" }
    >,
    actorId: number,
  ) {
    return db.transaction(async (tx) => {
      const [item] = await tx
        .select({
          id: itemMaster.id,
          uom: itemMaster.uom,
          isActive: itemMaster.isActive,
        })
        .from(itemMaster)
        .where(eq(itemMaster.id, input.itemId))
        .limit(1)
        .for("update");
      if (!item) {
        const [service] = await tx
          .select({ id: serviceMaster.id })
          .from(serviceMaster)
          .where(eq(serviceMaster.id, input.itemId))
          .limit(1);
        if (service) {
          // BR-INV-10: services never hold stock
          throw new BadRequestError("Services do not hold stock");
        }
        throw new NotFoundError("Item not found");
      }
      const [location] = await tx
        .select({ id: locations.id, isActive: locations.isActive })
        .from(locations)
        .where(eq(locations.id, input.locationId))
        .limit(1);
      if (!location) {
        throw new NotFoundError("Location not found");
      }
      if (!location.isActive) {
        // BR-INV-15
        throw new BadRequestError("Location is inactive");
      }

      const qty =
        input.referenceType === "opening_stock" ? input.qty : input.countedQty;
      if (
        (item.uom === "pcs" || item.uom === "set") &&
        !Number.isInteger(qty)
      ) {
        // BR-INV-08
        throw new BadRequestError(
          `Items in ${item.uom} take whole numbers only`,
        );
      }

      const [lastRow] = await tx
        .select({ balanceAfter: inventoryLedger.balanceAfter })
        .from(inventoryLedger)
        .where(
          and(
            eq(inventoryLedger.itemId, input.itemId),
            eq(inventoryLedger.locationId, input.locationId),
          ),
        )
        .orderBy(desc(inventoryLedger.id))
        .limit(1);

      if (input.referenceType === "opening_stock") {
        if (lastRow) {
          throw new ConflictError(
            "This item already has stock rows at this location, use stock-take",
          );
        }
        if (!item.isActive) {
          throw new BadRequestError("Item is inactive");
        }
        return postStock(tx, {
          itemId: input.itemId,
          locationId: input.locationId,
          batchNumber: input.batchNumber,
          transactionType: "adjustment",
          referenceType: "opening_stock",
          referenceId: 0,
          quantityChange: input.qty,
          unitCostPaise: input.unitCostPaise,
          notes: input.reason,
          createdBy: actorId,
        });
      }

      // stock-take: post counted - balance at this location
      const diffMilli =
        Math.round(input.countedQty * 1000) -
        Math.round((lastRow?.balanceAfter ?? 0) * 1000);
      if (diffMilli === 0) {
        throw new BadRequestError(
          "No difference between counted and system stock",
        );
      }
      const isStockIn = diffMilli > 0;
      if (isStockIn && !item.isActive) {
        throw new BadRequestError(
          "Item is inactive, it can only be adjusted down",
        );
      }
      if (isStockIn && input.unitCostPaise === undefined) {
        throw new BadRequestError(
          "unitCostPaise (> 0) is needed when counted is above the system stock",
        );
      }
      return postStock(tx, {
        itemId: input.itemId,
        locationId: input.locationId,
        batchNumber: input.batchNumber,
        transactionType: "adjustment",
        referenceType: "stock_adjustment",
        referenceId: 0,
        quantityChange: diffMilli / 1000,
        unitCostPaise: isStockIn ? (input.unitCostPaise ?? 0) : 0,
        valueAtAverage: !isStockIn,
        blockNegative: !isStockIn,
        notes: input.reason,
        createdBy: actorId,
      });
    });
  },

  // Stock view (BR-INV-19, 07, 06): active items plus inactive items that
  // still hold stock; per-location balance = last ledger balance.
  async listStock(params: assetStockListQuerySchemaType) {
    const q = params.q?.trim();
    const pattern = q ? likePattern(q) : undefined;
    const valueExpr = sql`round(${itemMaster.currentStock} * ${itemMaster.averageCostPaise})`;
    const belowExpr = and(
      eq(itemMaster.isActive, true),
      sql`${itemMaster.reorderLevel} > 0`,
      sql`${itemMaster.currentStock} <= ${itemMaster.reorderLevel}`,
    );
    const whereClause = and(
      or(eq(itemMaster.isActive, true), sql`${itemMaster.currentStock} <> 0`),
      pattern
        ? or(ilike(itemMaster.sku, pattern), ilike(itemMaster.name, pattern))
        : undefined,
      params.category ? eq(itemMaster.category, params.category) : undefined,
      params.belowReorder === true ? belowExpr : undefined,
      params.belowReorder === false ? sql`not (${belowExpr})` : undefined,
      params.locationId !== undefined
        ? sql`exists (select 1 from ${inventoryLedger} where ${inventoryLedger.itemId} = ${itemMaster.id} and ${inventoryLedger.locationId} = ${params.locationId})`
        : undefined,
    );
    const sortColumn =
      params.sortBy === "valuePaise"
        ? valueExpr
        : params.sortBy
          ? itemSortColumns[params.sortBy]
          : itemMaster.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const [items, [totalRow]] = await Promise.all([
      db
        .select({
          itemId: itemMaster.id,
          sku: itemMaster.sku,
          name: itemMaster.name,
          category: itemMaster.category,
          uom: itemMaster.uom,
          currentStock: itemMaster.currentStock,
          averageCostPaise: itemMaster.averageCostPaise,
          reorderLevel: itemMaster.reorderLevel,
          isActive: itemMaster.isActive,
        })
        .from(itemMaster)
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(itemMaster.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(itemMaster).where(whereClause),
    ]);

    const balances =
      items.length === 0
        ? []
        : await db
            .selectDistinctOn(
              [inventoryLedger.itemId, inventoryLedger.locationId],
              {
                itemId: inventoryLedger.itemId,
                locationId: inventoryLedger.locationId,
                locationName: locations.name,
                locationType: locations.type,
                balance: inventoryLedger.balanceAfter,
              },
            )
            .from(inventoryLedger)
            .innerJoin(locations, eq(locations.id, inventoryLedger.locationId))
            .where(
              inArray(
                inventoryLedger.itemId,
                items.map((i) => i.itemId),
              ),
            )
            .orderBy(
              inventoryLedger.itemId,
              inventoryLedger.locationId,
              desc(inventoryLedger.id),
            );

    return {
      rows: items.map((item) => ({
        ...item,
        valuePaise: Math.round(item.currentStock * item.averageCostPaise),
        belowReorder:
          item.isActive &&
          item.reorderLevel > 0 &&
          item.currentStock <= item.reorderLevel,
        locations: balances
          .filter((b) => b.itemId === item.itemId)
          .map(({ itemId: _i, ...b }) => b),
      })),
      total: totalRow?.value ?? 0,
    };
  },

  // Mismatch rows only (BR-GRN-41): item stock vs ledger total, and each
  // item+location's last balance vs its ledger total. Quantities compared to
  // half a thousandth to ignore float noise.
  async inventoryReconciliation(params: assetReconciliationQuerySchemaType) {
    const dir = params.sortDir === "desc" ? sql`desc` : sql`asc`;
    const mismatches = sql`
      select 'item_stock'::text as kind, i.id as item_id, i.sku as item_sku,
             null::int as location_id, i.current_stock as stored_qty,
             coalesce(sum(l.quantity_change), 0) as ledger_qty
      from item_master i
      left join inventory_ledger l on l.item_id = i.id
      group by i.id
      having abs(i.current_stock - coalesce(sum(l.quantity_change), 0)) > 0.0005
      union all
      select 'item_location_balance'::text, i.id, i.sku, t.location_id,
             t.balance_after, t.ledger_qty
      from (
        select distinct on (item_id, location_id) item_id, location_id,
               balance_after,
               sum(quantity_change) over (partition by item_id, location_id)
                 as ledger_qty
        from inventory_ledger
        order by item_id, location_id, id desc
      ) t
      join item_master i on i.id = t.item_id
      where abs(t.balance_after - t.ledger_qty) > 0.0005`;

    // One pass: the total rides along on every page row.
    const rows = (await db.execute(sql`
      select m.*, count(*) over ()::int as total
      from (${mismatches}) m
      order by item_id ${dir}, kind, location_id
      limit ${params.pageSize} offset ${(params.page - 1) * params.pageSize}`)) as unknown as Array<{
      kind: "item_stock" | "item_location_balance";
      item_id: number;
      item_sku: string;
      location_id: number | null;
      stored_qty: number;
      ledger_qty: number;
      total: number;
    }>;
    let total = Number(rows[0]?.total ?? 0);
    if (rows.length === 0 && params.page > 1) {
      // page past the end: the window count has no row to ride on
      const counted = (await db.execute(
        sql`select count(*)::int as total from (${mismatches}) m`,
      )) as unknown as Array<{ total: number }>;
      total = Number(counted[0]?.total ?? 0);
    }

    return {
      rows: rows.map((r) => ({
        kind: r.kind,
        itemId: r.item_id,
        itemSku: r.item_sku,
        locationId: r.location_id,
        storedQty: Number(r.stored_qty),
        ledgerQty: Number(r.ledger_qty),
      })),
      total,
    };
  },

  async listMachines(params: assetMachineListQuerySchemaType) {
    const sortColumn =
      params.sortBy && params.sortBy in machineSortColumns
        ? machineSortColumns[params.sortBy as keyof typeof machineSortColumns]
        : machines.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const q = params.q?.trim();
    const pattern = q ? likePattern(q) : undefined;

    const whereClause = and(
      pattern
        ? or(
            ilike(machines.name, pattern),
            ilike(machines.code, pattern),
            ilike(machines.type, pattern),
          )
        : undefined,
      params.status ? eq(machines.status, params.status) : undefined,
      params.isActive !== undefined
        ? eq(machines.isActive, params.isActive)
        : undefined,
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
        code: input.code,
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
