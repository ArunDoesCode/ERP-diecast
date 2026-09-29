import type { Context } from "hono";

import { BadRequestError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { roleService } from "../service/roleService";
import {
  roleCopyInputSchema,
  roleInputSchema,
  roleListQuerySchema,
  roleUpdateSchema,
} from "../types/setup.types";

function parseIdParam(c: Context<AppEnv>) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    throw new BadRequestError("Invalid role id");
  }
  return id;
}

export const roleController = {
  async list(c: Context<AppEnv>) {
    const query = roleListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await roleService.list(query);
    return c.json({ success: true, data, meta });
  },

  async create(c: Context<AppEnv>) {
    const body = roleInputSchema.parse(await c.req.json());
    const data = await roleService.create(body, c.get("actor"));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const id = parseIdParam(c);
    const body = roleUpdateSchema.parse(await c.req.json());
    const data = await roleService.update(id, body, c.get("actor"));
    return c.json({ success: true, data });
  },

  async remove(c: Context<AppEnv>) {
    const id = parseIdParam(c);
    await roleService.remove(id, c.get("actor"));
    return c.json({ success: true });
  },

  async copy(c: Context<AppEnv>) {
    const id = parseIdParam(c);
    const body = roleCopyInputSchema.parse(await c.req.json());
    const data = await roleService.copy(id, body, c.get("actor"));
    return c.json({ success: true, data }, 201);
  },
};
