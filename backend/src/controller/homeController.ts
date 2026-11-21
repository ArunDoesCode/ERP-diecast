import type { Context } from "hono";

import { UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { homeService } from "../service/homeService";
import { homeCountsQuerySchema, parseTileKeys } from "../types/home.types";

export const homeController = {
  async getCounts(c: Context<AppEnv>) {
    const query = homeCountsQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const actorId = Number(c.get("user").userId);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new UnauthorizedError("Invalid user session");
    }
    const data = await homeService.getCounts(
      c.get("actor"),
      actorId,
      parseTileKeys(query.tiles),
    );
    return c.json({ success: true, data });
  },
};
