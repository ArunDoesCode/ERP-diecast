import type { Context } from "hono";

import { UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { companySettingsService } from "../service/companySettingsService";
import {
  companySettingsHistoryQuerySchema,
  companySettingsUpsertSchema,
} from "../types/sco.types";
import { updateInvoiceTolerancesSchema } from "../types/supplierInvoice.types";

export const companySettingsController = {
  async get(c: Context<AppEnv>) {
    const data = await companySettingsService.get();
    return c.json({ success: true, data });
  },

  async upsert(c: Context<AppEnv>) {
    const body = companySettingsUpsertSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new UnauthorizedError("Invalid user session");
    }
    const data = await companySettingsService.upsert(body, actorId);
    return c.json({ success: true, data });
  },

  // supplier-invoice BR-SINV-32: the two match tolerances.
  async getInvoiceTolerances(c: Context<AppEnv>) {
    const data = await companySettingsService.getInvoiceTolerances();
    return c.json({ success: true, data });
  },

  async updateInvoiceTolerances(c: Context<AppEnv>) {
    const body = updateInvoiceTolerancesSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new UnauthorizedError("Invalid user session");
    }
    const data = await companySettingsService.updateInvoiceTolerances(
      body,
      actorId,
    );
    return c.json({ success: true, data });
  },

  async listHistory(c: Context<AppEnv>) {
    const query = companySettingsHistoryQuerySchema.parse(c.req.query());
    const { data, meta } = await companySettingsService.listHistory(query);
    return c.json({ success: true, data, meta });
  },
};
