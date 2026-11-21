import type { Context } from "hono";

import { BadRequestError, UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { purchaseReturnService } from "../service/purchaseReturnService";
import {
  awaitingReturnQuerySchema,
  cancelPurchaseReturnSchema,
  createPurchaseReturnSchema,
  purchaseReturnListQuerySchema,
  updatePurchaseReturnSchema,
} from "../types/purchaseReturn.types";

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

const queryOf = (c: Context<AppEnv>) =>
  Object.fromEntries(new URL(c.req.url).searchParams);

export const purchaseReturnController = {
  async list(c: Context<AppEnv>) {
    const query = purchaseReturnListQuerySchema.parse(queryOf(c));
    const { data, meta } = await purchaseReturnService.list(query);
    return c.json({ success: true, data, meta });
  },

  async awaiting(c: Context<AppEnv>) {
    const query = awaitingReturnQuerySchema.parse(queryOf(c));
    const { data, meta } = await purchaseReturnService.awaiting(query);
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "purchase return id");
    const data = await purchaseReturnService.getDetails(id);
    return c.json({ success: true, data });
  },

  async prefill(c: Context<AppEnv>) {
    const grnId = parseId(c.req.param("grnId"), "GRN id");
    const data = await purchaseReturnService.prefill(grnId);
    return c.json({ success: true, data });
  },

  async create(c: Context<AppEnv>) {
    const body = createPurchaseReturnSchema.parse(await c.req.json());
    const data = await purchaseReturnService.create(body, parseActorId(c));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const body = updatePurchaseReturnSchema.parse(await c.req.json());
    const data = await purchaseReturnService.update(body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async cancelDraft(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "purchase return id");
    const data = await purchaseReturnService.cancelDraft(id, parseActorId(c));
    return c.json({ success: true, data });
  },

  async post(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "purchase return id");
    const data = await purchaseReturnService.post(id, parseActorId(c));
    return c.json({ success: true, data });
  },

  async cancel(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "purchase return id");
    // A missing body falls through to the schema's 400 (reason required).
    const body = cancelPurchaseReturnSchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const data = await purchaseReturnService.cancel(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },
};
