import type { Context } from "hono";

import { BadRequestError, UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { scoChallanService } from "../service/scoChallanService";
import {
  createChallanSchema,
  openChallanListQuerySchema,
} from "../types/scoChallan.types";

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

export const scoChallanController = {
  async create(c: Context<AppEnv>) {
    const scoId = parsePositiveParam(c, "id", "SCO");
    const body = createChallanSchema.parse(await c.req.json());
    const data = await scoChallanService.create(
      scoId,
      body,
      parseActorId(c),
      c.get("actor"),
    );
    return c.json({ success: true, data }, 201);
  },

  async listBySco(c: Context<AppEnv>) {
    const data = await scoChallanService.listBySco(
      parsePositiveParam(c, "id", "SCO"),
    );
    return c.json({ success: true, data });
  },

  async listOpen(c: Context<AppEnv>) {
    const query = openChallanListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await scoChallanService.listOpen(query);
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const data = await scoChallanService.getPrintData(
      parsePositiveParam(c, "challanId", "challan"),
    );
    return c.json({ success: true, data });
  },
};
