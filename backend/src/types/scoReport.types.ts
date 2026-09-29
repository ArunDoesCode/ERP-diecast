import { z } from "zod";

// --- Stock at each vendor (S4 report) ---
// One row per vendor and raw item still held at the vendor location.
// qty = ledger balance of the vendor location; value = qty at issue cost.

export const vendorStockRowSchema = z.object({
  vendorId: z.number().int(),
  vendorName: z.string(),
  itemId: z.number().int(),
  itemSku: z.string(),
  itemName: z.string(),
  qty: z.number().int(),
  valuePaise: z.number().int(),
});
export type vendorStockRowSchemaType = z.infer<typeof vendorStockRowSchema>;

export const vendorStockQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z
    .enum(["vendorName", "itemSku", "qty", "valuePaise"])
    .default("vendorName"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  vendorId: z.coerce.number().int().positive().optional(),
});
export type vendorStockQuerySchemaType = z.infer<typeof vendorStockQuerySchema>;

// --- Loss log (S4 report) ---
// One row per `sco_loss` ledger posting (written at close, BR-SCO-19), with the
// SCO close reason and who closed it.

export const lossLogRowSchema = z.object({
  ledgerId: z.number().int(),
  scoId: z.number().int(),
  scoNumber: z.string(),
  vendorId: z.number().int(),
  vendorName: z.string(),
  itemId: z.number().int(),
  itemSku: z.string(),
  itemName: z.string(),
  // Pieces written off (positive number).
  qty: z.number().int(),
  // qty x issue cost, paise (positive number).
  costPaise: z.number().int(),
  batchNumber: z.string().nullable(),
  reason: z.string(),
  createdBy: z.number().int(),
  createdByName: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type lossLogRowSchemaType = z.infer<typeof lossLogRowSchema>;

export const lossLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["id", "createdAt", "qty", "costPaise"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  vendorId: z.coerce.number().int().positive().optional(),
  scoId: z.coerce.number().int().positive().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
});
export type lossLogQuerySchemaType = z.infer<typeof lossLogQuerySchema>;
