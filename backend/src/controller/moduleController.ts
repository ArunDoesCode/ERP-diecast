import type { Context } from "hono";

import type { AppEnv } from "../lib/types";
import { moduleService } from "../service/moduleService";

export const moduleController = {
  async list(c: Context<AppEnv>) {
    const data = await moduleService.list();
    return c.json({ success: true, data });
  },
};
