import type { Context } from "hono";

import { BadRequestError, UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { prService } from "../service/prService";
import {
  createPrSchema,
  prListQuerySchema,
  updatePrSchema,
} from "../types/pr.types";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

export const prController = {
  async details(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PR id");
    }

    const data = await prService.getDetails(id);
    return c.json({ success: true, data });
  },

  async list(c: Context<AppEnv>) {
    const query = prListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await prService.list(query);
    return c.json({ success: true, data, meta });
  },

  async create(c: Context<AppEnv>) {
    const body = createPrSchema.parse(await c.req.json());
    const actorId = parseActorId(c);
    const data = await prService.create(body, actorId, c.get("actor"));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const body = updatePrSchema.parse(await c.req.json());
    const data = await prService.update(body, c.get("actor"));
    return c.json({ success: true, data });
  },

  async remove(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PR id");
    }

    const data = await prService.cancel(id);
    return c.json({ success: true, data });
  },
};
