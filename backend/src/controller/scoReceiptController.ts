import type { Context } from "hono";

import { BadRequestError, UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { scoReceiptService } from "../service/scoReceiptService";
import {
  createReceiptSchema,
  qaDecisionSchema,
} from "../types/scoReceipt.types";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

function parsePositiveParam(c: Context<AppEnv>, name: string, label: string) {
  const id = Number(c.req.param(name));
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(`Invalid ${label} id`);
  }
  return id;
}

export const scoReceiptController = {
  async create(c: Context<AppEnv>) {
    const scoId = parsePositiveParam(c, "id", "SCO");
    const body = createReceiptSchema.parse(await c.req.json());
    const data = await scoReceiptService.create(
      scoId,
      body,
      parseActorId(c),
      c.get("actor"),
    );
    return c.json({ success: true, data }, 201);
  },

  async decideQa(c: Context<AppEnv>) {
    const body = qaDecisionSchema.parse(await c.req.json());
    const data = await scoReceiptService.decideQa(
      parsePositiveParam(c, "receiptId", "receipt"),
      parsePositiveParam(c, "lineId", "receipt line"),
      body,
      parseActorId(c),
      c.get("actor"),
    );
    return c.json({ success: true, data });
  },

  async listBySco(c: Context<AppEnv>) {
    const data = await scoReceiptService.listBySco(
      parsePositiveParam(c, "id", "SCO"),
    );
    return c.json({ success: true, data });
  },

  async details(c: Context<AppEnv>) {
    const data = await scoReceiptService.getDetails(
      parsePositiveParam(c, "receiptId", "receipt"),
    );
    return c.json({ success: true, data });
  },
};
