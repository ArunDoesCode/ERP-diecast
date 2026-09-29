import type { Context } from "hono";
import { UnauthorizedError } from "../lib/errors";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "../lib/http";
import type { AppEnv } from "../lib/types";
import { authService } from "../service/authService";
import { loginSchema } from "../types/auth.types";

export const authController = {
  async login(c: Context<AppEnv>) {
    const body = loginSchema.parse(await c.req.json());
    const result = await authService.login(body.email, body.password);

    setRefreshCookie(c, result.refreshToken);

    return c.json({
      success: true,
      message: "Login Successful",
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    });
  },

  async refresh(c: Context<AppEnv>) {
    const refreshToken = readRefreshCookie(c);
    if (!refreshToken) {
      throw new UnauthorizedError("Refresh token missing");
    }

    const result = await authService.refresh(refreshToken);

    setRefreshCookie(c, result.refreshToken);

    return c.json(
      {
        success: true,
        data: {
          accessToken: result.accessToken,
        },
        message: "Token refreshed successfully",
      },
      200,
    );
  },

  async logout(c: Context<AppEnv>) {
    const refreshToken = readRefreshCookie(c);
    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    clearRefreshCookie(c);

    return c.json({ success: true, message: "Logout Successful" }, 200);
  },

  async me(c: Context<AppEnv>) {
    const actor = c.get("actor");
    const data = await authService.getSessionUser(actor, actor.email);
    return c.json(
      { success: true, data, message: "User fetched successfully" },
      200,
    );
  },
};
