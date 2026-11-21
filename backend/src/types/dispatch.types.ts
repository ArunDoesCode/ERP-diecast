import { z } from "zod";
import { deliveryNoteStatusEnum } from "../db/schemas/06_dispatch";
import { paginatedResponse, successResponse } from "../lib/response-schemas";

// Dispatch (delivery note) request and response shapes. design/api.md.
// Every body is strict: any other key (customer, price, status...) is a 400
// (BR-DSP-02, A-43). Dates are YYYY-MM-DD plant (IST) days; the "not in the
// future" and "not before the SO date" checks need IST today, so the service
// enforces them (400). Money is integer paise.

const idSchema = z.number().int().positive();
const queryId = z.coerce.number().int().positive();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => {
    const [y, m, day] = v.split("-").map(Number);
    const d = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, day ?? 1));
    return (
      d.getUTCFullYear() === y &&
      d.getUTCMonth() === (m ?? 1) - 1 &&
      d.getUTCDate() === day
    );
  }, "Not a real calendar date");

// Qty: 0 < qty <= 1,000,000, at most 3 decimals (BR-DSP-04, 05). The whole-number
// rule for pcs / set needs the item unit, so the service enforces that one (400).
const qty3 = z
  .number()
  .positive()
  .max(1_000_000)
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
    message: "Quantity can have at most 3 decimals",
  });

// Weight in kg: 3 decimals, 0 < kg <= 50,000 (BR-DSP-20).
const kg3 = z
  .number()
  .positive()
  .max(50_000)
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
    message: "Weight can have at most 3 decimals",
  });

const lotNoSchema = z.string().trim().max(50);

export const deliveryNoteStatusSchema = z.enum(
  deliveryNoteStatusEnum.enumValues,
);
export const TRANSPORT_MODES = ["road", "rail", "air", "ship"] as const;
export const transportModeSchema = z.enum(TRANSPORT_MODES);

// --- formats (BR-DSP-25), shared by every route that takes transport ---
export const VEHICLE_NO_PATTERN = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;
export const VEHICLE_NO_BH_PATTERN = /^\d{2}BH\d{4}[A-Z]{1,2}$/;
export const TRANSPORTER_ID_PATTERN = /^\d{2}[A-Z0-9]{13}$/;
export const EWAY_BILL_NO_PATTERN = /^\d{12}$/;

// Trim, drop spaces and dashes, upper-case, then check length and pattern.
const vehicleNoSchema = z
  .string()
  .max(40)
  .transform((v) => v.trim().replace(/[\s-]/g, "").toUpperCase())
  .pipe(
    z
      .string()
      .max(15)
      .refine(
        (v) => VEHICLE_NO_PATTERN.test(v) || VEHICLE_NO_BH_PATTERN.test(v),
        "Vehicle number format is not valid",
      ),
  );
const transporterIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(15)
  .regex(TRANSPORTER_ID_PATTERN, "Transporter ID must be a 15-character GSTIN");
const ewayBillNoSchema = z
  .string()
  .max(30)
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(
    z.string().regex(EWAY_BILL_NO_PATTERN, "E-way bill number is 12 digits"),
  );

// Transport block. Every field optional and nullable; a PATCH changes only the keys
// sent, `null` clears (draft) - see api.md "Transport fields". e-way no without a date
// is checked by the service (400, BR-DSP-27).
const transportFields = {
  mode: transportModeSchema.nullable().optional(),
  vehicleNo: vehicleNoSchema.nullable().optional(),
  transporterId: transporterIdSchema.nullable().optional(),
  transporterName: z.string().trim().min(1).max(100).nullable().optional(),
  transportDocNo: z.string().trim().min(1).max(30).nullable().optional(),
  transportDocDate: isoDate.nullable().optional(),
  ewayBillNo: ewayBillNoSchema.nullable().optional(),
  ewayBillDate: isoDate.nullable().optional(),
  distanceKm: z.number().int().min(1).max(4000).nullable().optional(),
};
export const transportSchema = z.object(transportFields).strict();
export type TransportInput = z.infer<typeof transportSchema>;

// PATCH .../transport (after posting): same keys, at least one (BR-DSP-27). A locked
// key is a 409 DISPATCH_NOTE_FIELD_LOCKED, an unknown key a 400.
export const updateTransportSchema = transportSchema.refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  { message: "At least one field must be provided" },
);
export type UpdateTransportInput = z.infer<typeof updateTransportSchema>;

// --- lines and packages ---
export const noteLineInputSchema = z
  .object({
    soLineId: idSchema,
    qty: qty3,
    lotNo: lotNoSchema.nullable().optional(),
  })
  .strict();
export type NoteLineInput = z.infer<typeof noteLineInputSchema>;

export const noteLinesSchema = z.array(noteLineInputSchema).min(1).max(200);

export const packageInputSchema = z
  .object({
    soLineId: idSchema,
    packageNo: z.string().trim().min(1).max(20),
    qty: qty3,
    netKg: kg3,
    grossKg: kg3,
    lotNo: lotNoSchema.nullable().optional(),
  })
  .strict()
  .refine((v) => v.grossKg >= v.netKg, {
    message: "Gross weight cannot be less than net weight",
    path: ["grossKg"],
  });
export type PackageInput = z.infer<typeof packageInputSchema>;

export const packagesSchema = z.array(packageInputSchema).max(500);

const remarksSchema = z.string().trim().max(500);

// --- params ---
export const noteIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// --- request bodies ---
export const createDeliveryNoteSchema = z
  .object({
    soId: idSchema,
    noteDate: isoDate.optional(),
    sourceLocationId: idSchema.optional(),
    remarks: remarksSchema.optional(),
    lines: noteLinesSchema,
    packages: packagesSchema.optional(),
    transport: transportSchema.optional(),
  })
  .strict();
export type CreateDeliveryNoteInput = z.infer<typeof createDeliveryNoteSchema>;

// lines and packages, when sent, replace the whole list (a package names its line by
// soLineId). Fields not sent stay; `null` clears remarks.
export const updateDeliveryNoteSchema = z
  .object({
    noteDate: isoDate.optional(),
    sourceLocationId: idSchema.optional(),
    remarks: remarksSchema.nullable().optional(),
    lines: noteLinesSchema.optional(),
    packages: packagesSchema.optional(),
    transport: transportSchema.optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateDeliveryNoteInput = z.infer<typeof updateDeliveryNoteSchema>;

// Post takes nothing: everything comes from the saved draft (BR-DSP-16).
export const postDeliveryNoteSchema = z.object({}).strict();

// Both cancel routes: reason 3..500 after trim (BR-DSP-29, 30).
export const cancelDeliveryNoteSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export type CancelDeliveryNoteInput = z.infer<typeof cancelDeliveryNoteSchema>;

// --- list queries ---
const pageFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
};

export const PENDING_SORT_FIELDS = [
  "soDate",
  "customerName",
  "itemSku",
  "openQty",
] as const;

// sortBy omitted -> soDate asc; sortBy without sortDir -> asc (service resolves).
export const pendingListQuerySchema = z
  .object({
    ...pageFields,
    sortBy: z.enum(PENDING_SORT_FIELDS).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
    customerId: queryId.optional(),
    itemId: queryId.optional(),
    soId: queryId.optional(),
    // stock column location; must be active, non-virtual, not vendor_premise (400)
    locationId: queryId.optional(),
  })
  .strict();
export type PendingListQuery = z.infer<typeof pendingListQuerySchema>;

export const NOTE_SORT_FIELDS = [
  "noteDate",
  "dnNumber",
  "customerName",
  "status",
  "valuePaise",
] as const;

const boolQuery = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

// sortBy omitted -> noteDate desc; sortBy without sortDir -> asc (service resolves).
// sortBy=valuePaise without so.view is a 400 (BR-DSP-43, service check).
export const noteListQuerySchema = z
  .object({
    ...pageFields,
    sortBy: z.enum(NOTE_SORT_FIELDS).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
    customerId: queryId.optional(),
    soId: queryId.optional(),
    status: deliveryNoteStatusSchema.optional(),
    // drafts only: e-way needed and no e-way no (BR-DSP-40)
    ewayMissing: boolQuery,
  })
  .strict()
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, {
    message: "dateFrom must be on or before dateTo",
    path: ["dateFrom"],
  });
export type NoteListQuery = z.infer<typeof noteListQuerySchema>;

export const transportHistoryQuerySchema = z.object(pageFields).strict();
export type TransportHistoryQuery = z.infer<typeof transportHistoryQuerySchema>;

// --- responses ---
const idName = z.object({ id: z.number().int(), name: z.string() });

export const dispatchSettingsSchema = z.object({
  ewayIntraLimitPaise: z.number().int(),
  // null until the company details are saved (D5)
  plantStateCode: z.string().nullable(),
});
export const dispatchSettingsResponseSchema = successResponse(
  dispatchSettingsSchema,
);

// GET /pending row. No sale price here (BR-DSP-39).
export const pendingRowSchema = z.object({
  soId: z.number().int(),
  soNumber: z.string(),
  soLineId: z.number().int(),
  customer: idName,
  item: z.object({
    id: z.number().int(),
    sku: z.string(),
    name: z.string(),
  }),
  uom: z.string(),
  deliveryDate: z.string(),
  ordered: z.number(),
  delivered: z.number(),
  open: z.number(),
  soDate: z.string(),
  stockAtLocation: z.number(),
});

const soHeaderForPickerSchema = z.object({
  soNumber: z.string(),
  customerPoNumber: z.string().nullable(),
  customer: z.object({
    id: z.number().int(),
    name: z.string(),
    address: z.string(),
    stateCode: z.string(),
    gstin: z.string().nullable(),
  }),
  shipTo: z.object({ address: z.string(), stateCode: z.string() }),
});

export const pendingListResponseSchema = paginatedResponse(
  pendingRowSchema,
).extend({
  meta: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
    // distinct options over rows matching the other filters (max 200 each)
    customers: z.array(idName),
    items: z.array(
      z.object({
        id: z.number().int(),
        sku: z.string(),
        name: z.string(),
      }),
    ),
    // only when soId is given
    so: soHeaderForPickerSchema.optional(),
  }),
});

// GET /notes row. valuePaise needs so.view (omitted otherwise, BR-DSP-43).
export const noteListRowSchema = z.object({
  id: z.number().int(),
  dnNumber: z.string().nullable(),
  soId: z.number().int(),
  soNumber: z.string(),
  totalQty: z.number(),
  noteDate: z.string(),
  customer: idName,
  status: deliveryNoteStatusSchema,
  ewayBillNo: z.string().nullable(),
  ewayValidUntil: z.string().nullable(),
  ewayExpired: z.boolean(),
  ewayNeeded: z.boolean(),
  valuePaise: z.number().int().optional(),
});

export const noteListResponseSchema = paginatedResponse(
  noteListRowSchema,
).extend({
  meta: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
    // distinct customers over all notes, max 200, sorted by name
    customers: z.array(idName),
  }),
});

export const transportBlockSchema = z.object({
  mode: transportModeSchema.nullable(),
  vehicleNo: z.string().nullable(),
  transporterId: z.string().nullable(),
  transporterName: z.string().nullable(),
  transportDocNo: z.string().nullable(),
  transportDocDate: z.string().nullable(),
  distanceKm: z.number().int().nullable(),
  ewayBillNo: z.string().nullable(),
  ewayBillDate: z.string().nullable(),
});

// `*` price fields are present only when the caller also holds so.view (BR-DSP-43).
export const noteLineSchema = z.object({
  id: z.number().int(),
  soLineId: z.number().int(),
  item: z.object({
    id: z.number().int(),
    sku: z.string(),
    name: z.string(),
    hsnCode: z.string().nullable(),
  }),
  qty: z.number(),
  uom: z.string(),
  deliveryDate: z.string(),
  lotNo: z.string().nullable(),
  openQtyAtRead: z.number(),
  unitPricePaise: z.number().int().optional(),
  gstPercent: z.number().optional(),
  taxablePaise: z.number().int().optional(),
  gstPaise: z.number().int().optional(),
});

export const notePackageSchema = z.object({
  id: z.number().int(),
  lineId: z.number().int(),
  soLineId: z.number().int(),
  packageNo: z.string(),
  qty: z.number(),
  netKg: z.number(),
  grossKg: z.number(),
  lotNo: z.string().nullable(),
});

export const noteActivitySchema = z.object({
  at: z.string(),
  actorName: z.string().nullable(),
  action: z.string(),
  reason: z.string().nullable(),
});

// Detail shape: GET /notes/:id and the response of create, edit, post, cancel.
export const deliveryNoteDetailSchema = z.object({
  soStatus: z.string(),
  // newest first, max 50, no prices
  activity: z.array(noteActivitySchema),
  id: z.number().int(),
  dnNumber: z.string().nullable(),
  status: deliveryNoteStatusSchema,
  soId: z.number().int(),
  soNumber: z.string(),
  customerPoNumber: z.string().nullable(),
  customer: z.object({
    id: z.number().int(),
    name: z.string(),
    address: z.string(),
    gstin: z.string().nullable(),
    stateCode: z.string(),
  }),
  shipTo: z.object({ address: z.string(), stateCode: z.string() }),
  noteDate: z.string(),
  sourceLocation: idName,
  remarks: z.string().nullable(),
  lines: z.array(noteLineSchema),
  packages: z.array(notePackageSchema),
  transport: transportBlockSchema,
  ewayValidUntil: z.string().nullable(),
  ewayExpired: z.boolean(),
  // always returned, with or without so.view (BR-DSP-43)
  ewayNeeded: z.boolean(),
  ewayLimitPaise: z.number().int(),
  // posted: copied at post; draft: current company settings; null when not saved yet
  company: z
    .object({
      name: z.string().nullable(),
      address: z.string().nullable(),
      gstin: z.string().nullable(),
      stateCode: z.string().nullable(),
    })
    .nullable(),
  taxablePaise: z.number().int().optional(),
  gstPaise: z.number().int().optional(),
  valuePaise: z.number().int().optional(),
  postedBy: idName.nullable(),
  postedAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  cancelledBy: idName.nullable(),
  cancelledAt: z.string().nullable(),
  createdBy: idName.nullable(),
  createdAt: z.string(),
});
export type DeliveryNoteDetail = z.infer<typeof deliveryNoteDetailSchema>;
export const deliveryNoteDetailResponseSchema = successResponse(
  deliveryNoteDetailSchema,
);

export const transportHistoryRowSchema = z.object({
  id: z.number().int(),
  field: z.enum([
    "vehicleNo",
    "transporterId",
    "transporterName",
    "transportDocNo",
    "transportDocDate",
    "ewayBillNo",
    "ewayBillDate",
    "distanceKm",
  ]),
  oldValue: z.string().nullable(),
  newValue: z.string(),
  changedBy: z.number().int(),
  changedByName: z.string().nullable(),
  changedAt: z.string(),
});
export const transportHistoryResponseSchema = paginatedResponse(
  transportHistoryRowSchema,
);
