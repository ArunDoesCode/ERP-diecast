import type { Context } from "hono";

import { BadRequestError, UnauthorizedError } from "../lib/errors";
import { parseCancelReason } from "../lib/http";
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
    const raw = await c.req.json();
    // BR-PR-15 / BR-KD-01: status is never set from the edit path, even to its current value.
    if (raw && typeof raw === "object" && "status" in raw) {
      throw new BadRequestError(
        "Status cannot be changed here; use the cancel or approval action",
        "PR_STATUS_VIA_ACTION",
      );
    }
    const body = updatePrSchema.parse(raw);
    const data = await prService.update(body, c.get("actor"));
    return c.json({ success: true, data });
  },

  async remove(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PR id", "INVALID_PR_ID");
    }

    const reason = await parseCancelReason(c, "PR_CANCEL_REASON_REQUIRED");

    const data = await prService.cancel(id, reason, c.get("actor"));
    return c.json({ success: true, data: { pr: data } });
  },

  // BR-PR-33: POST /pr/:id/lines/:lineId/cancel { reason }
  async cancelLine(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    const lineId = Number(c.req.param("lineId"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PR id", "INVALID_PR_ID");
    }
    if (!Number.isInteger(lineId) || lineId <= 0) {
      throw new BadRequestError("Invalid PR line id", "INVALID_PR_LINE_ID");
    }

    const reason = await parseCancelReason(c, "PR_CANCEL_REASON_REQUIRED");

    const data = await prService.cancelLine(id, lineId, reason, c.get("actor"));
    return c.json({ success: true, data });
  },
};
