import type { Context } from "hono";

import { BadRequestError, UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { poService } from "../service/poService";
import {
  cancelPoSchema,
  closePoSchema,
  confirmPoSchema,
  createPoSchema,
  logPoCommunicationSchema,
  markPoInvoicedSchema,
  markPoSentSchema,
  poListQuerySchema,
  shortClosePoSchema,
  updatePoDelaySchema,
  updatePoSchema,
} from "../types/po.types";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

export const poController = {
  async details(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PO id");
    }

    const data = await poService.getDetails(id);
    return c.json({ success: true, data });
  },

  async list(c: Context<AppEnv>) {
    const query = poListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await poService.list(query);
    return c.json({ success: true, data, meta });
  },

  async create(c: Context<AppEnv>) {
    const body = createPoSchema.parse(await c.req.json());
    const actorId = parseActorId(c);
    const data = await poService.create(body, actorId);
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const body = updatePoSchema.parse(await c.req.json());
    const data = await poService.update(body);
    return c.json({ success: true, data });
  },

  async remove(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PO id");
    }

    // BR-PO-11: the reason is required for every status, draft included.
    const rawBody = await c.req.text();
    const { reason } = cancelPoSchema.parse(rawBody ? JSON.parse(rawBody) : {});

    const data = await poService.cancel(id, reason, parseActorId(c));
    return c.json({ success: true, data });
  },

  async markSent(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PO id");
    }

    const body = markPoSentSchema.parse(await c.req.json());
    const actorId = parseActorId(c);
    const data = await poService.markSent(id, body, actorId);
    return c.json({ success: true, data });
  },

  async reminder(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PO id");
    }

    const body = logPoCommunicationSchema.parse(await c.req.json());
    const actorId = parseActorId(c);
    const data = await poService.logReminder(id, body, actorId);
    return c.json({ success: true, data }, 201);
  },

  async escalate(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PO id");
    }

    const body = logPoCommunicationSchema.parse(await c.req.json());
    const actorId = parseActorId(c);
    const data = await poService.escalate(id, body, actorId);
    return c.json({ success: true, data }, 201);
  },

  async updateDelay(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PO id");
    }

    const body = updatePoDelaySchema.parse(await c.req.json());
    const data = await poService.updateDelay(id, body);
    return c.json({ success: true, data });
  },

  async confirmSupplier(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PO id");
    }

    const body = confirmPoSchema.parse(await c.req.json());
    const actorId = parseActorId(c);
    const data = await poService.confirmSupplier(id, body, actorId);
    return c.json({ success: true, data });
  },

  async markInvoiced(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PO id");
    }

    const body = markPoInvoicedSchema.parse(await c.req.json());
    const data = await poService.markInvoiced(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async close(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PO id");
    }

    const body = closePoSchema.parse(await c.req.json());
    const actorId = parseActorId(c);
    const data = await poService.close(id, body, actorId);
    return c.json({ success: true, data });
  },

  async shortClose(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PO id");
    }

    const body = shortClosePoSchema.parse(await c.req.json());
    const data = await poService.shortClose(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async communications(c: Context<AppEnv>) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestError("Invalid PO id");
    }

    const data = await poService.communications(id);
    return c.json({ success: true, data });
  },
};
