import type { Context } from "hono";

import type { AppEnv } from "../lib/types";
import { pageService } from "../service/pageService";
import {
  screenRolesDiffSchema,
  screenUpdateSchema,
} from "../types/setup.types";

export const pageController = {
  async listScreens(c: Context<AppEnv>) {
    const data = await pageService.listScreens();
    return c.json({ success: true, data });
  },

  async updateScreen(c: Context<AppEnv>) {
    const body = screenUpdateSchema.parse(await c.req.json());
    const data = await pageService.updateScreen(
      c.req.param("key") ?? "",
      body,
      c.get("actor").id,
    );
    return c.json({ success: true, data });
  },

  async setScreenRoles(c: Context<AppEnv>) {
    const body = screenRolesDiffSchema.parse(await c.req.json());
    const data = await pageService.setScreenRoles(
      c.req.param("key") ?? "",
      body,
      c.get("actor").id,
    );
    return c.json({ success: true, data });
  },
};
