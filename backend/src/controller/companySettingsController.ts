import type { Context } from "hono";

import { UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { companySettingsService } from "../service/companySettingsService";
import { companySettingsUpsertSchema } from "../types/sco.types";

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
};
