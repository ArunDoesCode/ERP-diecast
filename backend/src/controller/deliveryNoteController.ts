import type { Context } from "hono";

import { can } from "../lib/auth-middleware";
import { UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import {
  deliveryNoteService,
  type Viewer,
} from "../service/deliveryNoteService";
import {
  cancelDeliveryNoteSchema,
  createDeliveryNoteSchema,
  noteIdParamSchema,
  noteListQuerySchema,
  pendingListQuerySchema,
  postDeliveryNoteSchema,
  transportHistoryQuerySchema,
  updateDeliveryNoteSchema,
  updateTransportSchema,
} from "../types/dispatch.types";

function viewerOf(c: Context<AppEnv>): Viewer {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  // BR-DSP-43: price fields need so.view on top of the dispatch key
  return { actorId, canSeePrice: can(c.get("actor"), "so.view") };
}

const parseId = (c: Context<AppEnv>) =>
  noteIdParamSchema.parse(c.req.param()).id;
const queryOf = (c: Context<AppEnv>) =>
  Object.fromEntries(new URL(c.req.url).searchParams);

export const deliveryNoteController = {
  async pending(c: Context<AppEnv>) {
    const query = pendingListQuerySchema.parse(queryOf(c));
    const { data, meta } = await deliveryNoteService.pending(query);
    return c.json({ success: true, data, meta });
  },

  async settings(c: Context<AppEnv>) {
    const data = await deliveryNoteService.settings();
    return c.json({ success: true, data });
  },

  async list(c: Context<AppEnv>) {
    const query = noteListQuerySchema.parse(queryOf(c));
    const { data, meta } = await deliveryNoteService.list(
      query,
      viewerOf(c).canSeePrice,
    );
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const data = await deliveryNoteService.getDetails(parseId(c), viewerOf(c));
    return c.json({ success: true, data });
  },

  async create(c: Context<AppEnv>) {
    const body = createDeliveryNoteSchema.parse(await c.req.json());
    const data = await deliveryNoteService.create(body, viewerOf(c));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = updateDeliveryNoteSchema.parse(await c.req.json());
    const data = await deliveryNoteService.update(id, body, viewerOf(c));
    return c.json({ success: true, data });
  },

  async post(c: Context<AppEnv>) {
    const id = parseId(c);
    // an empty body is the same as {}
    postDeliveryNoteSchema.parse(await c.req.json().catch(() => ({})));
    const data = await deliveryNoteService.post(id, viewerOf(c));
    return c.json({ success: true, data });
  },

  async cancelDraft(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = cancelDeliveryNoteSchema.parse(await c.req.json());
    const data = await deliveryNoteService.cancelDraft(id, body, viewerOf(c));
    return c.json({ success: true, data });
  },

  async cancel(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = cancelDeliveryNoteSchema.parse(await c.req.json());
    const data = await deliveryNoteService.cancel(id, body, viewerOf(c));
    return c.json({ success: true, data });
  },

  async transport(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = updateTransportSchema.parse(await c.req.json());
    const data = await deliveryNoteService.updateTransport(
      id,
      body,
      viewerOf(c),
    );
    return c.json({ success: true, data });
  },

  async transportHistory(c: Context<AppEnv>) {
    const id = parseId(c);
    const query = transportHistoryQuerySchema.parse(queryOf(c));
    const { data, meta } = await deliveryNoteService.transportHistory(
      id,
      query,
    );
    return c.json({ success: true, data, meta });
  },
};
