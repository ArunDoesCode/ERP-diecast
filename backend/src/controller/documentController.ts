import type { Context } from "hono";

import { UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { documentService } from "../service/documentService";
import { panelParamSchema } from "../types/document.types";

export const documentController = {
  async getPanel(c: Context<AppEnv>) {
    const params = panelParamSchema.parse({
      docType: c.req.param("docType"),
      docId: c.req.param("docId"),
    });
    const actorId = Number(c.get("user").userId);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new UnauthorizedError("Invalid user session");
    }
    const data = await documentService.getPanel(params, {
      actorId,
      actor: c.get("actor"),
    });
    return c.json({ success: true, data });
  },
};
