import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { supplierServices } from "../db/schemas/02_procurement-suppliers";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Shared by subcontracting (BR-SCO-02) and BOM job work (BR-BOM-07): the
// vendor's active price-list rows for these services. One lookup, two callers.
export async function findActiveVendorServiceRows(
  vendorId: number,
  serviceIds: number[],
  executor: typeof db | Tx = db,
) {
  if (serviceIds.length === 0) return [];
  return executor
    .select({
      serviceId: supplierServices.serviceId,
      serviceUnitPricePaise: supplierServices.serviceUnitPricePaise,
      taxPercentage: supplierServices.taxPercentage,
    })
    .from(supplierServices)
    .where(
      and(
        eq(supplierServices.supplierId, vendorId),
        inArray(supplierServices.serviceId, serviceIds),
        eq(supplierServices.isActive, true),
      ),
    );
}
