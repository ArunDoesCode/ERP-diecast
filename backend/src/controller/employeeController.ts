import type { Context } from "hono";

import { BadRequestError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { authAuditService } from "../service/authAuditService";
import { employeeService } from "../service/employeeService";
import {
  accessLogListQuerySchema,
  employeeInputSchema,
  employeeListQuerySchema,
  employeeRoleAssignSchema,
  employeeSearchQuerySchema,
  employeeUpdateSchema,
} from "../types/setup.types";

function parseIdParam(c: Context<AppEnv>) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    throw new BadRequestError("Invalid employee id");
  }
  return id;
}

export const employeeController = {
  async list(c: Context<AppEnv>) {
    const query = employeeListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await employeeService.list(query);
    return c.json({ success: true, data, meta });
  },

  async search(c: Context<AppEnv>) {
    const query = employeeSearchQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await employeeService.search(query);
    return c.json({ success: true, data, meta });
  },

  async create(c: Context<AppEnv>) {
    const body = employeeInputSchema.parse(await c.req.json());
    const data = await employeeService.create(body, c.get("actor"));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const id = parseIdParam(c);
    const body = employeeUpdateSchema.parse(await c.req.json());
    const data = await employeeService.update(id, body, c.get("actor"));
    return c.json({ success: true, data });
  },

  async remove(c: Context<AppEnv>) {
    const id = parseIdParam(c);
    await employeeService.remove(id, c.get("actor"));
    return c.json({ success: true });
  },

  async generateQr(c: Context<AppEnv>) {
    const id = parseIdParam(c);
    const data = await employeeService.regenerateQr(id);
    return c.json({ success: true, data });
  },

  async assignableRoles(c: Context<AppEnv>) {
    const data = await employeeService.assignableRoles(c.get("actor"));
    return c.json({ success: true, data });
  },

  async assignRole(c: Context<AppEnv>) {
    const id = parseIdParam(c);
    const body = employeeRoleAssignSchema.parse(await c.req.json());
    const data = await employeeService.assignRole(
      id,
      body.roleId,
      c.get("actor"),
    );
    return c.json({ success: true, data });
  },

  async accessLog(c: Context<AppEnv>) {
    const query = accessLogListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await authAuditService.list(query);
    return c.json({ success: true, data, meta });
  },
};
