/**
 * HTTP smoke tests through the real app (middleware + routers + onError),
 * the pattern for future endpoint tests: `createApp().request(path, init)`.
 * No DB access needed for these cases.
 */
import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { signAccessToken } from "./lib/token";

const app = createApp();

describe("createApp (BL-007)", () => {
  test("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { status: "ok" },
    });
  });

  test("protected route without a token maps UnauthorizedError to 401 JSON", async () => {
    const res = await app.request("/api/setup/modules");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      message: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });

  test("wrong role maps ForbiddenError to 403 JSON", async () => {
    const token = await signAccessToken({
      userId: 1,
      userName: "operator",
      role: "operator",
      allowedPages: [],
    });
    const res = await app.request("/api/setup/modules", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });
});
