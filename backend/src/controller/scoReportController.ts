import type { Context } from "hono";

import type { AppEnv } from "../lib/types";
import { scoReportService } from "../service/scoReportService";
import {
  lossLogQuerySchema,
  vendorStockQuerySchema,
} from "../types/scoReport.types";

function queryOf(c: Context<AppEnv>) {
  return Object.fromEntries(new URL(c.req.url).searchParams);
}

export const scoReportController = {
  async vendorStock(c: Context<AppEnv>) {
    const query = vendorStockQuerySchema.parse(queryOf(c));
    const { data, meta } = await scoReportService.vendorStock(query);
    return c.json({ success: true, data, meta });
  },

  async lossLog(c: Context<AppEnv>) {
    const query = lossLogQuerySchema.parse(queryOf(c));
    const { data, meta } = await scoReportService.lossLog(query);
    return c.json({ success: true, data, meta });
  },
};
