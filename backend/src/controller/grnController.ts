import type { Context } from "hono";

import { BadRequestError, UnauthorizedError } from "../lib/errors";
import type { Role } from "../lib/token";
import type { AppEnv } from "../lib/types";
import { grnService } from "../service/grnService";
import {
  createGrnSchema,
  grnBypassSchema,
  grnCorrectionSchema,
  grnListQuerySchema,
  grnQaActionSchema,
  updateGrnSchema,
} from "../types/grn.types";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

function parseId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return id;
}

export const grnController = {
  async details(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "GRN id");
    const data = await grnService.getDetails(id);
    return c.json({ success: true, data });
  },

  async list(c: Context<AppEnv>) {
    const query = grnListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await grnService.list(query);
    return c.json({ success: true, data, meta });
  },

  async create(c: Context<AppEnv>) {
    const body = createGrnSchema.parse(await c.req.json());
    const actorId = parseActorId(c);
    const data = await grnService.create(body, actorId);
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const body = updateGrnSchema.parse(await c.req.json());
    const data = await grnService.update(body);
    return c.json({ success: true, data });
  },

  async remove(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "GRN id");
    const data = await grnService.remove(id);
    return c.json({ success: true, data });
  },

  async qaAction(c: Context<AppEnv>) {
    const grnId = parseId(c.req.param("id"), "GRN id");
    const lineId = parseId(c.req.param("lineId"), "GRN line id");
    const body = grnQaActionSchema.parse(await c.req.json());
    const actorId = parseActorId(c);
    const actorRole = c.get("actor").roleName as Role;
    const data = await grnService.qaAction(
      grnId,
      lineId,
      body,
      actorId,
      actorRole,
    );
    return c.json({ success: true, data });
  },

  async bypass(c: Context<AppEnv>) {
    const grnId = parseId(c.req.param("id"), "GRN id");
    const lineId = parseId(c.req.param("lineId"), "GRN line id");
    const body = grnBypassSchema.parse(await c.req.json());
    const actorId = parseActorId(c);
    const actorRole = c.get("actor").roleName as Role;
    const data = await grnService.bypass(
      grnId,
      lineId,
      body,
      actorId,
      actorRole,
    );
    return c.json({ success: true, data });
  },

  async correction(c: Context<AppEnv>) {
    const grnId = parseId(c.req.param("id"), "GRN id");
    const lineId = parseId(c.req.param("lineId"), "GRN line id");
    const body = grnCorrectionSchema.parse(await c.req.json());
    const actorId = parseActorId(c);
    const data = await grnService.correction(grnId, lineId, body, actorId);
    return c.json({ success: true, data }, 201);
  },
};
