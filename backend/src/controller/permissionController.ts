import type { Context } from "hono";

import { BadRequestError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { permissionService } from "../service/permissionService";
import { roleGrantsDiffSchema } from "../types/setup.types";

function parseRoleId(c: Context<AppEnv>) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    throw new BadRequestError("Invalid role id");
  }
  return id;
}

export const permissionController = {
  async getGrants(c: Context<AppEnv>) {
    const data = await permissionService.getGrants(parseRoleId(c));
    return c.json({ success: true, data });
  },

  async setGrants(c: Context<AppEnv>) {
    const body = roleGrantsDiffSchema.parse(await c.req.json());
    const data = await permissionService.setGrants(
      parseRoleId(c),
      body,
      c.get("actor").id,
    );
    return c.json({ success: true, data });
  },
};
