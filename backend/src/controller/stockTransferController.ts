import type { Context } from "hono";

import { UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { stockTransferService } from "../service/stockTransferService";
import {
  createStockTransferSchema,
  emptyBodySchema,
  reverseStockTransferSchema,
  stockTransferIdParamSchema,
  stockTransferListQuerySchema,
  updateStockTransferSchema,
} from "../types/stockTransfer.types";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

const queryOf = (c: Context<AppEnv>) =>
  Object.fromEntries(new URL(c.req.url).searchParams);

const idOf = (c: Context<AppEnv>) =>
  stockTransferIdParamSchema.parse({ id: c.req.param("id") }).id;

export const stockTransferController = {
  async list(c: Context<AppEnv>) {
    const query = stockTransferListQuerySchema.parse(queryOf(c));
    const { data, meta } = await stockTransferService.list(query);
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const data = await stockTransferService.getDetails(idOf(c));
    return c.json({ success: true, data });
  },

  async create(c: Context<AppEnv>) {
    const body = createStockTransferSchema.parse(await c.req.json());
    const data = await stockTransferService.create(body, parseActorId(c));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const id = idOf(c);
    const body = updateStockTransferSchema.parse(await c.req.json());
    const data = await stockTransferService.update(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async cancel(c: Context<AppEnv>) {
    const id = idOf(c);
    emptyBodySchema.parse(await c.req.json());
    const data = await stockTransferService.cancel(id, parseActorId(c));
    return c.json({ success: true, data });
  },

  async post(c: Context<AppEnv>) {
    const id = idOf(c);
    emptyBodySchema.parse(await c.req.json());
    const data = await stockTransferService.post(id, parseActorId(c));
    return c.json({ success: true, data });
  },

  async reverse(c: Context<AppEnv>) {
    const id = idOf(c);
    const body = reverseStockTransferSchema.parse(await c.req.json());
    const data = await stockTransferService.reverse(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },
};
