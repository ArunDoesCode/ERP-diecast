import type { Context } from "hono";

import { AppError, BadRequestError, UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { prService } from "../service/prService";
import {
  cancelPrSchema,
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
      throw new AppError("Invalid PR id", 400, "INVALID_PR_ID");
    }

    const raw = await c.req.json().catch(() => ({}));
    const parsed = cancelPrSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestError(
        "A cancel reason of 3 to 500 characters is required",
        "PR_CANCEL_REASON_REQUIRED",
      );
    }

    const data = await prService.cancel(id, parsed.data.reason, c.get("actor"));
    return c.json({ success: true, data: { pr: data } });
  },

  // BR-PR-33: POST /pr/:id/lines/:lineId/cancel { reason }
  async cancelLine(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    const lineId = Number(c.req.param("lineId"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid PR id", 400, "INVALID_PR_ID");
    }
    if (!Number.isInteger(lineId) || lineId <= 0) {
      throw new AppError("Invalid PR line id", 400, "INVALID_PR_LINE_ID");
    }

    const raw = await c.req.json().catch(() => ({}));
    const parsed = cancelPrSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestError(
        "A cancel reason of 3 to 500 characters is required",
        "PR_CANCEL_REASON_REQUIRED",
      );
    }

    const data = await prService.cancelLine(id, lineId, c.get("actor"));
    return c.json({ success: true, data });
  },
};
