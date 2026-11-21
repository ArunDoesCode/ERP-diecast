import type { Context } from "hono";

import { BadRequestError, UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { reorderRunService } from "../service/reorderRunService";
import { reorderService } from "../service/reorderService";
import {
  reorderCheckNowBodySchema,
  reorderItemsQuerySchema,
  reorderOwnerCandidatesQuerySchema,
  reorderRunIdParamSchema,
  reorderRunsQuerySchema,
  updateReorderSettingsSchema,
} from "../types/reorder.types";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

const queryOf = (c: Context<AppEnv>) =>
  Object.fromEntries(new URL(c.req.url).searchParams);

export const reorderController = {
  async items(c: Context<AppEnv>) {
    const query = reorderItemsQuerySchema.parse(queryOf(c));
    const { data, meta } = await reorderService.listItems(query);
    return c.json({ success: true, data, meta });
  },

  async runs(c: Context<AppEnv>) {
    const query = reorderRunsQuerySchema.parse(queryOf(c));
    const { data, meta } = await reorderService.listRuns(query);
    return c.json({ success: true, data, meta });
  },

  async runDetails(c: Context<AppEnv>) {
    const { id } = reorderRunIdParamSchema.parse(c.req.param());
    const data = await reorderService.getRun(id);
    return c.json({ success: true, data });
  },

  async checkNow(c: Context<AppEnv>) {
    // no body, or an empty {}; anything else is a 400
    const raw = await c.req.text();
    let body: unknown = {};
    if (raw.trim() !== "") {
      try {
        body = JSON.parse(raw);
      } catch {
        throw new BadRequestError("Invalid JSON body");
      }
    }
    reorderCheckNowBodySchema.parse(body);
    const data = await reorderRunService.checkNow(parseActorId(c));
    return c.json({ success: true, data }, 201);
  },

  async getSettings(c: Context<AppEnv>) {
    const data = await reorderService.getSettings();
    return c.json({ success: true, data });
  },

  async updateSettings(c: Context<AppEnv>) {
    const body = updateReorderSettingsSchema.parse(await c.req.json());
    const data = await reorderService.updateSettings(body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async ownerCandidates(c: Context<AppEnv>) {
    const query = reorderOwnerCandidatesQuerySchema.parse(queryOf(c));
    const { data, meta } = await reorderService.listOwnerCandidates(query);
    return c.json({ success: true, data, meta });
  },
};
