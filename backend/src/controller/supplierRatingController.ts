import type { Context } from "hono";

import type { AppEnv } from "../lib/types";
import { supplierRatingService } from "../service/supplierRatingService";
import {
  supplierRatingIdParamSchema,
  supplierRatingLinesQuerySchema,
  supplierRatingListQuerySchema,
} from "../types/supplierRating.types";

const queryOf = (c: Context<AppEnv>) =>
  Object.fromEntries(new URL(c.req.url).searchParams);
const supplierIdOf = (c: Context<AppEnv>) =>
  supplierRatingIdParamSchema.parse({ supplierId: c.req.param("supplierId") })
    .supplierId;

export const supplierRatingController = {
  async list(c: Context<AppEnv>) {
    const query = supplierRatingListQuerySchema.parse(queryOf(c));
    const { data, meta } = await supplierRatingService.list(query);
    return c.json({ success: true, data, meta });
  },

  async card(c: Context<AppEnv>) {
    const data = await supplierRatingService.card(supplierIdOf(c));
    return c.json({ success: true, data });
  },

  async lines(c: Context<AppEnv>) {
    const supplierId = supplierIdOf(c);
    const query = supplierRatingLinesQuerySchema.parse(queryOf(c));
    const { data, meta } = await supplierRatingService.lines(supplierId, query);
    return c.json({ success: true, data, meta });
  },

  async trend(c: Context<AppEnv>) {
    const data = await supplierRatingService.trend(supplierIdOf(c));
    return c.json({ success: true, data });
  },
};
