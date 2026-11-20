import { z } from "zod";
import { approvalTrailEntrySchema } from "./approval.types";

export const panelDocTypeSchema = z.enum(["pr", "po", "grn"]);
export type PanelDocType = z.infer<typeof panelDocTypeSchema>;

// docId int 1..2147483647 (400 otherwise).
export const panelParamSchema = z.object({
  docType: panelDocTypeSchema,
  docId: z.coerce.number().int().min(1).max(2147483647),
});
export type panelParamSchemaType = z.infer<typeof panelParamSchema>;

// Every money key is optional: present only for a caller with the doc key or
// via approval (BR-FF-06). A GRN totals object never has money keys.
export const panelTotalsSchema = z.object({
  lineCount: z.number().int().optional(),
  estimatedAmountPaise: z.number().int().optional(),
  subtotalPaise: z.number().int().optional(),
  taxAmountPaise: z.number().int().optional(),
  totalAmountPaise: z.number().int().optional(),
  receivedPct: z.number().min(0).max(100).optional(),
  arrivedQty: z.number().optional(),
  acceptedQty: z.number().nullable().optional(),
  rejectedQty: z.number().nullable().optional(),
  uom: z.string().optional(),
});

export const panelApprovalsSchema = z.object({
  status: z.string().nullable(),
  currentLevel: z.number().int().nullable(),
  totalLevels: z.number().int().nullable(),
  trail: z.array(approvalTrailEntrySchema),
});

export const panelLinkedSchema = z.object({
  docType: z.enum(["pr", "po", "grn", "sco"]),
  id: z.number().int(),
  number: z.string(),
  status: z.string(),
  qaStatus: z.enum(["pending", "passed", "failed", "mixed"]).optional(),
  canOpen: z.boolean(),
});

export const panelHistoryEventSchema = z.object({
  at: z.string(),
  byName: z.string().nullable(),
  event: z.string(),
  note: z.string().optional(),
});

export const panelSchema = z.object({
  totals: panelTotalsSchema,
  approvals: panelApprovalsSchema.nullable(),
  linked: z.array(panelLinkedSchema),
  history: z.array(panelHistoryEventSchema),
  historyTruncated: z.boolean(),
});
export type panelSchemaType = z.infer<typeof panelSchema>;
