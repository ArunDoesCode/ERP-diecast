import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { itemMaster } from "../db/schemas/02_procurement-catalog";
import {
  purchaseOrderItems,
  purchaseOrders,
} from "../db/schemas/02_procurement-purchasing";
import {
  rateContractItems,
  rateContracts,
} from "../db/schemas/02_procurement-rfq";
import { supplierItems } from "../db/schemas/02_procurement-suppliers";
import type { DbExecutor } from "./executor";

export type RateSource =
  | "contract"
  | "po_history"
  | "supplier_catalog"
  | "item_average"
  | "standard_rate";

export type RateChoice = {
  ratePaise: number;
  source: RateSource;
  // set only when source is "contract"
  contractItemId?: number;
  contractId?: number;
  contractNumber?: string;
  gstPercent?: number;
  agreedQty?: number | null;
  allowancePercent?: number;
};

// PO statuses that count as "a real PO" for last-rate and ordered qty (BR-INV-24, BR-RFQ-53).
export const APPROVED_OR_LATER_PO_STATUSES = [
  "approved",
  "dispatched",
  "partial_received",
  "fully_received",
  "invoiced",
  "closed",
] as const;

/**
 * BR-RFQ-47, 48: a contract line is usable on `day` (IST YYYY-MM-DD) when its
 * contract is active or terminated, valid-from has begun, and the usable end
 * (termination date, else valid-to) has not passed.
 */
export function contractUsableOn(day: string) {
  return and(
    inArray(rateContracts.status, ["active", "terminated"]),
    sql`${rateContracts.validFrom} <= ${day}`,
    sql`coalesce(${rateContracts.terminatedOn}, ${rateContracts.validTo}) >= ${day}`,
  );
}

/**
 * The one rate chain (BR-INV-24, BR-RFQ-50): contract usable on `onDate`, else
 * the newest approved-or-later PO line for this supplier + item, else the
 * supplier's active catalog price, else the item average cost (> 0), else the
 * item standard rate. Several items at once; unknown items are left out.
 * `includeContract` is false for callers without po.manage / contract.view
 * (BR-RFQ-56) - they get the next source as if no contract existed.
 * `includeFallback` false returns only contract rates (the PO resolver, which
 * handles an explicit rate itself).
 */
export async function findRateChoices(
  executor: DbExecutor,
  supplierId: number,
  itemIds: number[],
  opts: {
    onDate: string;
    includeContract: boolean;
    includeFallback?: boolean;
  },
): Promise<Map<number, RateChoice>> {
  const choices = new Map<number, RateChoice>();
  if (itemIds.length === 0) return choices;
  const includeFallback = opts.includeFallback ?? true;

  const [contractRows, poRows, itemRows] = await Promise.all([
    opts.includeContract
      ? executor
          .select({
            itemId: rateContractItems.itemId,
            contractItemId: rateContractItems.id,
            contractId: rateContracts.id,
            allowancePercent: rateContracts.allowancePercent,
            agreedQty: rateContractItems.agreedQty,
            contractNumber: rateContracts.contractNumber,
            ratePaise: rateContractItems.ratePaise,
            gstPercent: rateContractItems.gstPercent,
          })
          .from(rateContractItems)
          .innerJoin(
            rateContracts,
            eq(rateContracts.id, rateContractItems.contractId),
          )
          .where(
            and(
              eq(rateContracts.supplierId, supplierId),
              inArray(rateContractItems.itemId, itemIds),
              contractUsableOn(opts.onDate),
            ),
          )
          // newest contract wins if a terminated one still overlaps in the data
          .orderBy(desc(rateContractItems.id))
      : Promise.resolve([]),
    includeFallback
      ? executor
          .selectDistinctOn([purchaseOrderItems.itemId], {
            itemId: purchaseOrderItems.itemId,
            ratePaise: purchaseOrderItems.unitPricePaise,
          })
          .from(purchaseOrderItems)
          .innerJoin(
            purchaseOrders,
            eq(purchaseOrders.id, purchaseOrderItems.poId),
          )
          .where(
            and(
              eq(purchaseOrders.supplierId, supplierId),
              inArray(purchaseOrderItems.itemId, itemIds),
              sql`${purchaseOrderItems.unitPricePaise} > 0`,
              inArray(purchaseOrders.status, [
                ...APPROVED_OR_LATER_PO_STATUSES,
              ]),
            ),
          )
          .orderBy(
            purchaseOrderItems.itemId,
            desc(purchaseOrders.createdAt),
            desc(purchaseOrderItems.id),
          )
      : Promise.resolve([]),
    includeFallback
      ? executor
          .select({
            itemId: itemMaster.id,
            averageCostPaise: itemMaster.averageCostPaise,
            standardRatePaise: itemMaster.standardRatePaise,
            catalogPaise: supplierItems.supplierUnitPricePaise,
          })
          .from(itemMaster)
          .leftJoin(
            supplierItems,
            and(
              eq(supplierItems.itemId, itemMaster.id),
              eq(supplierItems.supplierId, supplierId),
              eq(supplierItems.isActive, true), // BR-SUP-15
            ),
          )
          .where(inArray(itemMaster.id, itemIds))
      : Promise.resolve([]),
  ]);

  const poRate = new Map(poRows.map((row) => [row.itemId, row.ratePaise]));
  for (const row of itemRows) {
    const fromPo = poRate.get(row.itemId);
    if (fromPo && fromPo > 0) {
      choices.set(row.itemId, { ratePaise: fromPo, source: "po_history" });
    } else if (row.catalogPaise && row.catalogPaise > 0) {
      choices.set(row.itemId, {
        ratePaise: row.catalogPaise,
        source: "supplier_catalog",
      });
    } else if (row.averageCostPaise > 0) {
      choices.set(row.itemId, {
        ratePaise: row.averageCostPaise,
        source: "item_average",
      });
    } else {
      // legacy rows may still have 0 (API rejects 0 on write)
      choices.set(row.itemId, {
        ratePaise: row.standardRatePaise,
        source: "standard_rate",
      });
    }
  }
  // contract first: overwrite (rows come newest first, so keep the first per item)
  const seen = new Set<number>();
  for (const row of contractRows) {
    if (seen.has(row.itemId)) continue;
    seen.add(row.itemId);
    choices.set(row.itemId, {
      ratePaise: row.ratePaise,
      source: "contract",
      contractItemId: row.contractItemId,
      contractId: row.contractId,
      agreedQty: row.agreedQty,
      allowancePercent: row.allowancePercent,
      contractNumber: row.contractNumber,
      gstPercent: row.gstPercent,
    });
  }
  return choices;
}

export const rateChainRepository = { findRateChoices };
