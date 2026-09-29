import type { Context } from "hono";

import { BadRequestError, UnauthorizedError } from "../lib/errors";
import { parseCancelReason } from "../lib/http";
import type { AppEnv } from "../lib/types";
import { scoService } from "../service/scoService";
import {
  createScoSchema,
  scoListQuerySchema,
  updateScoSchema,
} from "../types/sco.types";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

function parseId(c: Context<AppEnv>) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError("Invalid SCO id");
  }
  return id;
}

export const scoController = {
  async list(c: Context<AppEnv>) {
    const query = scoListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await scoService.list(query);
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const data = await scoService.getDetails(parseId(c));
    return c.json({ success: true, data });
  },

  async create(c: Context<AppEnv>) {
    const body = createScoSchema.parse(await c.req.json());
    const data = await scoService.create(body, parseActorId(c));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const body = updateScoSchema.parse(await c.req.json());
    const data = await scoService.update(body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async submit(c: Context<AppEnv>) {
    const data = await scoService.submit(
      parseId(c),
      parseActorId(c),
      c.get("actor"),
    );
    return c.json({ success: true, data });
  },

  async cancel(c: Context<AppEnv>) {
    const id = parseId(c);
    // BR-SCO-20: reason 3-500 chars, every status.
    const reason = await parseCancelReason(c, "SCO_CANCEL_REASON_REQUIRED");
    const data = await scoService.cancel(id, { reason }, parseActorId(c));
    return c.json({ success: true, data });
  },
};
