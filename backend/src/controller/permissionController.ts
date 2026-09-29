import type { Context } from "hono";

import { BadRequestError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { permissionService } from "../service/permissionService";
import {
  roleGrantsDiffSchema,
  rolePermissionDiffSchema,
} from "../types/setup.types";

function parseRoleId(c: Context<AppEnv>) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    throw new BadRequestError("Invalid role id");
  }
  return id;
}

export const permissionController = {
  async list(c: Context<AppEnv>) {
    const data = await permissionService.list();
    return c.json({ success: true, data });
  },

  async updateForRole(c: Context<AppEnv>) {
    const roleId = Number(c.req.param("roleId"));
    if (!Number.isInteger(roleId)) {
      throw new BadRequestError("Invalid role id");
    }

    const body = rolePermissionDiffSchema.parse(await c.req.json());
    const data = await permissionService.updateForRole(roleId, body);
    return c.json({ success: true, data });
  },

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
