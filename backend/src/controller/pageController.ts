import type { Context } from "hono";

import { BadRequestError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { pageService } from "../service/pageService";
import {
  pageInputSchema,
  pageListQuerySchema,
  pageUpdateSchema,
  screenRolesDiffSchema,
  screenUpdateSchema,
} from "../types/setup.types";

function parseIdParam(c: Context<AppEnv>) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    throw new BadRequestError("Invalid page id");
  }
  return id;
}

export const pageController = {
  async list(c: Context<AppEnv>) {
    const query = pageListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await pageService.list(query);
    return c.json({ success: true, data, meta });
  },

  async create(c: Context<AppEnv>) {
    const body = pageInputSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await pageService.create(body, actorId);
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const id = parseIdParam(c);
    const body = pageUpdateSchema.parse(await c.req.json());
    const data = await pageService.update(id, body);
    return c.json({ success: true, data });
  },

  async remove(c: Context<AppEnv>) {
    const id = parseIdParam(c);
    await pageService.remove(id);
    return c.json({ success: true });
  },

  async listScreens(c: Context<AppEnv>) {
    const data = await pageService.listScreens();
    return c.json({ success: true, data });
  },

  async updateScreen(c: Context<AppEnv>) {
    const body = screenUpdateSchema.parse(await c.req.json());
    const data = await pageService.updateScreen(
      c.req.param("key") ?? "",
      body,
      c.get("actor").id,
    );
    return c.json({ success: true, data });
  },

  async setScreenRoles(c: Context<AppEnv>) {
    const body = screenRolesDiffSchema.parse(await c.req.json());
    const data = await pageService.setScreenRoles(
      c.req.param("key") ?? "",
      body,
      c.get("actor").id,
    );
    return c.json({ success: true, data });
  },
};
