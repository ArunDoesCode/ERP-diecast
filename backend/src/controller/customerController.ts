import type { Context } from "hono";

import { UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { customerService } from "../service/customerService";
import {
  createCustomerSchema,
  customerIdParamSchema,
  customerListQuerySchema,
  updateCustomerSchema,
} from "../types/customer.types";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

const parseId = (c: Context<AppEnv>) =>
  customerIdParamSchema.parse(c.req.param()).id;

export const customerController = {
  async list(c: Context<AppEnv>) {
    const query = customerListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await customerService.list(query);
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const data = await customerService.getDetails(parseId(c));
    return c.json({ success: true, data });
  },

  async create(c: Context<AppEnv>) {
    const body = createCustomerSchema.parse(await c.req.json());
    const data = await customerService.create(body, parseActorId(c));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = updateCustomerSchema.parse(await c.req.json());
    const data = await customerService.update(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },
};
