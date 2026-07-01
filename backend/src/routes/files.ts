import { Hono } from "hono";

import { requireAuth, requireRole } from "../lib/auth-middleware";
import type { AppEnv } from "../lib/types";

const filesRoutes = new Hono<AppEnv>();

filesRoutes.post(
  "/presign",
  requireAuth,
  requireRole("owner", "back_office"),
  async (c) => {
    const user = c.get("user");

    return c.json({
      success: true,
      data: {
        uploadUrl: "placeholder-upload-url",
        fileKey: `uploads/${user.userId}/${Date.now()}.bin`,
      },
    });
  },
);

export { filesRoutes };
