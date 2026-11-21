import type { Context } from "hono";

import { UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { saleOrderService } from "../service/saleOrderService";
import {
  createSaleOrderSchema,
  soAuditQuerySchema,
  soIdParamSchema,
  soListQuerySchema,
  soReasonBodySchema,
  soVersionBodySchema,
  updateSaleOrderSchema,
} from "../types/saleOrder.types";
import { notImplemented } from "./notImplemented";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

const parseId = (c: Context<AppEnv>) => soIdParamSchema.parse(c.req.param()).id;
const queryOf = (c: Context<AppEnv>) =>
  Object.fromEntries(new URL(c.req.url).searchParams);

// Explosion handlers (runExplosion .. createDrafts) come with slices S2 / S3.
export const saleOrderController = {
  async list(c: Context<AppEnv>) {
    const query = soListQuerySchema.parse(queryOf(c));
    const { data, meta } = await saleOrderService.list(query);
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const data = await saleOrderService.getDetails(parseId(c));
    return c.json({ success: true, data });
  },

  async create(c: Context<AppEnv>) {
    const body = createSaleOrderSchema.parse(await c.req.json());
    const data = await saleOrderService.create(body, parseActorId(c));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = updateSaleOrderSchema.parse(await c.req.json());
    const data = await saleOrderService.update(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async confirm(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = soVersionBodySchema.parse(await c.req.json());
    const data = await saleOrderService.confirm(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async hold(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = soReasonBodySchema.parse(await c.req.json());
    const data = await saleOrderService.hold(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async resume(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = soVersionBodySchema.parse(await c.req.json());
    const data = await saleOrderService.resume(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async close(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = soReasonBodySchema.parse(await c.req.json());
    const data = await saleOrderService.close(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async cancel(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = soReasonBodySchema.parse(await c.req.json());
    const data = await saleOrderService.cancel(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async audit(c: Context<AppEnv>) {
    const id = parseId(c);
    const query = soAuditQuerySchema.parse(queryOf(c));
    const { data, meta } = await saleOrderService.listAudit(id, query);
    return c.json({ success: true, data, meta });
  },

  runExplosion: notImplemented,
  listExplosions: notImplemented,
  explosionDetails: notImplemented,
  explosionRows: notImplemented,
  createDrafts: notImplemented,
};
