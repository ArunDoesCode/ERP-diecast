import type { Context } from "hono";

import { BadRequestError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { authAuditService } from "../service/authAuditService";
import { accessLogListQuerySchema } from "../types/setup.types";

/** Read-only access log (BR-AUTH-20, BR-AUTH-31). */
export const accessLogController = {
  async list(c: Context<AppEnv>) {
    const query = accessLogListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await authAuditService.list(query);
    return c.json({ success: true, data, meta });
  },

  async detail(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id < 1) {
      throw new BadRequestError("Invalid access-log id");
    }
    const data = await authAuditService.detail(id);
    return c.json({ success: true, data });
  },
};
