import { z } from "zod";

// Home tiles = spec tiles 20..30 in BR-FF-13 order.
export const HOME_TILE_KEYS = [
  "approvals",
  "my_prs_draft",
  "my_prs_pending",
  "prs_to_order",
  "pos_to_send",
  "my_pos_draft",
  "pos_late",
  "goods_expected",
  "grns_to_inspect",
  "jobwork_due",
  "stock_low",
] as const;

export const homeTileKeySchema = z.enum(HOME_TILE_KEYS);
export type HomeTileKey = z.infer<typeof homeTileKeySchema>;

// GET /home/getcounts query. `tiles` is a csv of tile keys (BR-FF-19, max 11,
// no duplicates, every entry in the enum). No user id: counts are the caller's.
export const homeCountsQuerySchema = z
  .object({
    tiles: z
      .string()
      .trim()
      .max(300)
      .refine(
        (v) => {
          const parts = v.split(",").map((t) => t.trim());
          return (
            parts.length <= HOME_TILE_KEYS.length &&
            new Set(parts).size === parts.length &&
            parts.every((t) => homeTileKeySchema.safeParse(t).success)
          );
        },
        { message: "tiles must be a csv of unique, known tile keys" },
      )
      .optional(),
  })
  .strict();
export type homeCountsQuerySchemaType = z.infer<typeof homeCountsQuerySchema>;

/** Parses the validated csv into tile keys (undefined = all tiles). */
export function parseTileKeys(
  tiles: string | undefined,
): HomeTileKey[] | undefined {
  if (tiles === undefined) return undefined;
  return tiles.split(",").map((t) => homeTileKeySchema.parse(t.trim()));
}

export const homeTileToneSchema = z.enum([
  "waiting",
  "moving",
  "neutral",
  "danger",
]);

export const homeTileHintSchema = z.object({
  kind: z.enum([
    "oldest_since",
    "sent_back",
    "earliest_required",
    "earliest_due",
    "oldest_due",
    "oldest_received",
    "items",
  ]),
  date: z.string().optional(),
  n: z.number().int().min(0).optional(),
});

// A failed tile is `{ key, error: true }` (HTTP stays 200), so everything but
// `key` is optional by presence.
export const homeTileSchema = z.object({
  key: homeTileKeySchema,
  count: z.number().int().min(0).optional(),
  tone: homeTileToneSchema.optional(),
  late: z.number().int().min(0).optional(),
  today: z.number().int().min(0).optional(),
  later: z.number().int().min(0).optional(),
  hint: homeTileHintSchema.optional(),
  error: z.literal(true).optional(),
});
export type homeTileSchemaType = z.infer<typeof homeTileSchema>;

export const homeCountsSchema = z.object({
  today: z.string(),
  tiles: z.array(homeTileSchema),
});
export type homeCountsSchemaType = z.infer<typeof homeCountsSchema>;
