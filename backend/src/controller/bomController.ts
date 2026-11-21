import type { Context } from "hono";

import { UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { bomService } from "../service/bomService";
import {
  bomHistoryQuerySchema,
  bomIdParamSchema,
  bomListQuerySchema,
  bomPartIdParamSchema,
  createBomSchema,
  releaseBomSchema,
  retireBomSchema,
  updateBomSchema,
} from "../types/bom.types";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

const parseId = (c: Context<AppEnv>) =>
  bomIdParamSchema.parse(c.req.param()).id;
const parsePartId = (c: Context<AppEnv>) =>
  bomPartIdParamSchema.parse(c.req.param()).partId;
const queryOf = (c: Context<AppEnv>) =>
  Object.fromEntries(new URL(c.req.url).searchParams);

// S3 (needs, where-used) is not built yet: those two still answer 501.
function notImplemented(c: Context<AppEnv>) {
  return c.json(
    { success: false, message: "Not implemented", code: "NOT_IMPLEMENTED" },
    501,
  );
}

export const bomController = {
  async list(c: Context<AppEnv>) {
    const query = bomListQuerySchema.parse(queryOf(c));
    const { data, meta } = await bomService.list(query);
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const data = await bomService.getDetails(parseId(c), c.get("actor"));
    return c.json({ success: true, data });
  },

  async tree(c: Context<AppEnv>) {
    const data = await bomService.getTree(parseId(c));
    return c.json({ success: true, data });
  },

  async changeSummary(c: Context<AppEnv>) {
    const data = await bomService.getChangeSummary(parseId(c));
    return c.json({ success: true, data });
  },

  needs: notImplemented,
  whereUsed: notImplemented,

  async partHistory(c: Context<AppEnv>) {
    const query = bomHistoryQuerySchema.parse(queryOf(c));
    const { data, meta } = await bomService.getPartHistory(
      parsePartId(c),
      query,
    );
    return c.json({ success: true, data, meta });
  },

  async create(c: Context<AppEnv>) {
    const body = createBomSchema.parse(await c.req.json());
    const data = await bomService.create(body, parseActorId(c));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const body = updateBomSchema.parse(await c.req.json());
    const data = await bomService.update(parseId(c), body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async remove(c: Context<AppEnv>) {
    const data = await bomService.remove(parseId(c), parseActorId(c));
    return c.json({ success: true, data });
  },

  async startRevision(c: Context<AppEnv>) {
    const data = await bomService.startRevision(
      parsePartId(c),
      parseActorId(c),
    );
    return c.json({ success: true, data }, 201);
  },

  async release(c: Context<AppEnv>) {
    const body = releaseBomSchema.parse(await c.req.json());
    const data = await bomService.release(parseId(c), body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async retire(c: Context<AppEnv>) {
    const body = retireBomSchema.parse(await c.req.json());
    const data = await bomService.retire(parseId(c), body, parseActorId(c));
    return c.json({ success: true, data });
  },
};
