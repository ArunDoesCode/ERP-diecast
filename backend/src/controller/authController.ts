import type { Context } from "hono";
import { UnauthorizedError } from "../lib/errors";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "../lib/http";
import type { AppEnv } from "../lib/types";
import { authService } from "../service/authService";
import { loginSchema, registerSchema } from "../types/auth.types";

export const authController = {
  async register(c: Context<AppEnv>) {
    const body = registerSchema.parse(await c.req.json());
    const employee = await authService.register(body);
    return c.json(
      { success: true, data: employee, message: "Registration Successful" },
      201,
    );
  },

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
    const user = c.get("user");
    return c.json(
      { success: true, data: user, message: "User fetched successfully" },
      200,
    );
  },
};
